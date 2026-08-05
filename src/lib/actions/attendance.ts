"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { canReachEmployee } from "../scope";
import { applyTimeToDate, formatDate, toDateOnly } from "../dates";
import type { FormState } from "./auth";

/**
 * Attendance actions.
 *
 * Check-in and check-out are the two most-used writes in the whole product, so
 * they are deliberately forgiving: pressing check-in twice does not create a
 * second day or overwrite the original time, and checking out without having
 * checked in is refused with an explanation rather than silently recording a
 * zero-length day.
 */

export async function checkInAction(): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "attendance.checkin");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record." };
  }

  const db = orgDb(session.org.id);
  const employeeId = session.employee.id;
  const date = toDateOnly(new Date());
  const now = new Date();

  const existing = await db.attendanceRecord.findFirst({
    where: { employeeId, date },
  });

  if (existing?.checkInAt) {
    return { error: "You've already checked in today." };
  }

  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    include: { shift: true },
  });

  const shift =
    employee?.shift ?? (await db.shift.findFirst({ where: { isDefault: true } }));

  // Late is measured against the shift start plus its grace period, so a
  // 15-minute grace genuinely means 15 minutes rather than a warning at 09:31.
  let isLate = false;
  if (shift) {
    const graceEnd = applyTimeToDate(date, shift.startTime);
    graceEnd.setUTCMinutes(graceEnd.getUTCMinutes() + shift.graceMinutes);
    isLate = now > graceEnd;
  }

  await db.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId, date } },
    create: {
      orgId: session.org.id,
      employeeId,
      date,
      checkInAt: now,
      status: "PRESENT",
      shiftId: shift?.id ?? null,
      source: "WEB",
      isLate,
    },
    update: {
      checkInAt: now,
      status: "PRESENT",
      shiftId: shift?.id ?? null,
      isLate,
    },
  });

  await audit(session, {
    action: "attendance.checked_in",
    entityType: "AttendanceRecord",
    summary: `Checked in${isLate ? " (late)" : ""}`,
  });

  revalidatePath("/me");
  revalidatePath("/attendance");
  return { success: true };
}

export async function checkOutAction(): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "attendance.checkin");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record." };
  }

  const db = orgDb(session.org.id);
  const employeeId = session.employee.id;
  const date = toDateOnly(new Date());
  const now = new Date();

  const record = await db.attendanceRecord.findFirst({
    where: { employeeId, date },
    include: { shift: true },
  });

  if (!record?.checkInAt) {
    return {
      error:
        "You haven't checked in today. Ask your manager to regularise the day instead.",
    };
  }
  if (record.checkOutAt) {
    return { error: "You've already checked out today." };
  }

  const grossMinutes = Math.round(
    (now.getTime() - record.checkInAt.getTime()) / 60_000,
  );
  const breakMinutes = record.shift?.breakMinutes ?? 0;
  const workedMinutes = Math.max(grossMinutes - breakMinutes, 0);

  const halfDayMinutes = Number(record.shift?.halfDayHours ?? 4) * 60;
  const status = workedMinutes < halfDayMinutes ? "HALF_DAY" : "PRESENT";

  await db.attendanceRecord.update({
    where: { id: record.id },
    data: { checkOutAt: now, workedMinutes, status },
  });

  await audit(session, {
    action: "attendance.checked_out",
    entityType: "AttendanceRecord",
    entityId: record.id,
    summary: `Checked out after ${Math.floor(workedMinutes / 60)}h ${workedMinutes % 60}m`,
  });

  revalidatePath("/me");
  revalidatePath("/attendance");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Regularisation
// ---------------------------------------------------------------------------

const regularizeSchema = z.object({
  date: z.string().min(1, "Pick the date to correct"),
  checkIn: z.string().min(1, "Enter the time you started"),
  checkOut: z.string().min(1, "Enter the time you finished"),
  reason: z
    .string()
    .trim()
    .min(3, "Say what happened — your manager will see this")
    .max(500),
});

export async function requestRegularizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "attendance.regularize.request");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record." };
  }

  const parsed = regularizeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { date, checkIn, checkOut, reason } = parsed.data;
  const db = orgDb(session.org.id);
  const employeeId = session.employee.id;
  const day = toDateOnly(new Date(date));

  if (day > toDateOnly(new Date())) {
    return { fieldErrors: { date: "You can't regularise a future date." } };
  }

  const requestedCheckInAt = applyTimeToDate(day, checkIn);
  const requestedCheckOutAt = applyTimeToDate(day, checkOut);

  if (requestedCheckOutAt <= requestedCheckInAt) {
    return {
      fieldErrors: { checkOut: "Finish time must be after start time." },
    };
  }

  const duplicate = await db.attendanceRegularization.findFirst({
    where: { employeeId, date: day, status: "PENDING" },
  });
  if (duplicate) {
    return { error: `You already have a pending correction for ${formatDate(day)}.` };
  }

  const record = await db.attendanceRecord.findFirst({
    where: { employeeId, date: day },
  });

  const created = await db.attendanceRegularization.create({
    data: {
      orgId: session.org.id,
      employeeId,
      attendanceRecordId: record?.id ?? null,
      date: day,
      requestedCheckInAt,
      requestedCheckOutAt,
      reason,
    },
  });

  await audit(session, {
    action: "attendance.regularization.requested",
    entityType: "AttendanceRegularization",
    entityId: created.id,
    summary: `Requested correction for ${formatDate(day)}`,
  });

  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { managerId: true },
  });

  if (employee?.managerId) {
    const managerUserId = await userIdForEmployee(employee.managerId);
    if (managerUserId) {
      await notify({
        orgId: session.org.id,
        userId: managerUserId,
        type: "REGULARIZATION_REQUESTED",
        title: `${session.employee.firstName} asked to correct their attendance`,
        body: `${formatDate(day)} · ${reason}`,
        linkUrl: "/attendance/regularizations",
      });
    }
  }

  revalidatePath("/me");
  revalidatePath("/attendance");
  return { success: true };
}

export async function decideRegularizationAction(
  id: string,
  approve: boolean,
  note?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(
    session,
    "attendance.regularize.approve.team",
    "attendance.regularize.approve.all",
  );

  const db = orgDb(session.org.id);

  const request = await db.attendanceRegularization.findFirst({
    where: { id },
    include: { employee: { select: { id: true, firstName: true } } },
  });
  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "PENDING") {
    return { error: "That request has already been decided." };
  }

  if (!can(session, "attendance.regularize.approve.all")) {
    const reachable = await canReachEmployee(
      session,
      "attendance.regularize.approve",
      request.employeeId,
    );
    if (!reachable) return { error: "That request isn't yours to decide." };
  }

  await db.attendanceRegularization.update({
    where: { id },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      reviewerId: session.employee?.id ?? null,
      reviewedAt: new Date(),
      reviewNote: note?.trim() || null,
    },
  });

  if (approve) {
    const workedMinutes = Math.max(
      Math.round(
        (request.requestedCheckOutAt.getTime() -
          request.requestedCheckInAt.getTime()) /
          60_000,
      ),
      0,
    );

    // The correction becomes the record. `isRegularized` keeps it visible as a
    // corrected day rather than pretending the punch was always there.
    await db.attendanceRecord.upsert({
      where: {
        employeeId_date: { employeeId: request.employeeId, date: request.date },
      },
      create: {
        orgId: session.org.id,
        employeeId: request.employeeId,
        date: request.date,
        checkInAt: request.requestedCheckInAt,
        checkOutAt: request.requestedCheckOutAt,
        workedMinutes,
        status: "PRESENT",
        source: "SYSTEM",
        isRegularized: true,
      },
      update: {
        checkInAt: request.requestedCheckInAt,
        checkOutAt: request.requestedCheckOutAt,
        workedMinutes,
        status: "PRESENT",
        isRegularized: true,
      },
    });
  }

  await audit(session, {
    action: "attendance.regularization.decided",
    entityType: "AttendanceRegularization",
    entityId: id,
    summary: `${approve ? "Approved" : "Declined"} correction for ${formatDate(request.date)}`,
  });

  const userId = await userIdForEmployee(request.employeeId);
  if (userId) {
    await notify({
      orgId: session.org.id,
      userId,
      type: approve
        ? "REGULARIZATION_APPROVED"
        : "REGULARIZATION_REJECTED",
      title: `Your attendance correction was ${approve ? "approved" : "declined"}`,
      body: formatDate(request.date),
      linkUrl: "/me/attendance",
    });
  }

  revalidatePath("/attendance");
  revalidatePath("/me");
  return { success: true };
}

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !output[key]) output[key] = issue.message;
  }
  return output;
}
