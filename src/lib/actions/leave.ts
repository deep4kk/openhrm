"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { sendApprovalRequestEmail, sendLeaveDecisionEmail } from "../mail";
import { computeLeaveDays } from "../queries/leave";
import { canReachEmployee } from "../scope";
import { formatDateRange, leaveYearOf, toDateOnly, today } from "../dates";
import type { FormState } from "./auth";

/**
 * Leave workflow.
 *
 * Every balance movement happens inside a transaction that updates the balance
 * row and appends a ledger entry together. If one succeeds and the other
 * doesn't, the numbers stop explaining themselves — so they always move as a
 * pair, or not at all.
 *
 * Pending days are reserved at request time rather than at approval. Without
 * that, an employee with 3 days left could file three separate 3-day requests
 * and have all of them approved.
 */

const applySchema = z
  .object({
    leaveTypeId: z.string().min(1, "Choose a leave type"),
    startDate: z.string().min(1, "Choose a start date"),
    endDate: z.string().min(1, "Choose an end date"),
    isHalfDay: z.string().optional(),
    halfDaySession: z.string().optional(),
    reason: z
      .string()
      .trim()
      .min(3, "Give a short reason — your approver will see it")
      .max(500),
    contactDuringLeave: z.string().trim().max(120).optional(),
  })
  .refine((v) => new Date(v.endDate) >= new Date(v.startDate), {
    message: "The end date can't be before the start date",
    path: ["endDate"],
  });

export async function applyForLeaveAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "leave.request");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const parsed = applySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);
  const employeeId = session.employee.id;

  const startDate = toDateOnly(new Date(input.startDate));
  const endDate = toDateOnly(new Date(input.endDate));
  const isHalfDay = input.isHalfDay === "on";

  if (isHalfDay && startDate.getTime() !== endDate.getTime()) {
    return { fieldErrors: { endDate: "A half day covers a single date." } };
  }

  const leaveType = await db.leaveType.findFirst({
    where: { id: input.leaveTypeId, isActive: true },
  });
  if (!leaveType) return { fieldErrors: { leaveTypeId: "Unknown leave type." } };

  // Notice period — sick leave is usually 0, planned leave isn't.
  const noticeDays = Math.round(
    (startDate.getTime() - today().getTime()) / 86_400_000,
  );
  if (leaveType.minNoticeDays > 0 && noticeDays < leaveType.minNoticeDays) {
    return {
      fieldErrors: {
        startDate: `${leaveType.name} needs ${leaveType.minNoticeDays} days' notice. Talk to HR if it's urgent.`,
      },
    };
  }

  // Overlap: an employee can't be on two kinds of leave at once.
  const overlapping = await db.leaveRequest.findFirst({
    where: {
      employeeId,
      status: { in: ["PENDING", "APPROVED"] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    include: { leaveType: { select: { name: true } } },
  });

  if (overlapping) {
    return {
      error: `You already have ${overlapping.leaveType.name} booked over those dates (${formatDateRange(
        overlapping.startDate,
        overlapping.endDate,
      )}).`,
    };
  }

  const days = await computeLeaveDays(session, {
    startDate,
    endDate,
    isHalfDay,
    countsHolidays: leaveType.countsHolidays,
  });

  if (days <= 0) {
    return {
      error:
        "Those dates are all weekends or holidays — there's nothing to deduct.",
    };
  }

  if (leaveType.maxConsecutiveDays && days > leaveType.maxConsecutiveDays) {
    return {
      error: `${leaveType.name} allows at most ${leaveType.maxConsecutiveDays} consecutive days.`,
    };
  }

  const year = leaveYearOf(startDate, session.org.fiscalYearStartMonth);

  const result = await rawDb.$transaction(async (tx) => {
    const balance = await tx.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId: leaveType.id,
          year,
        },
      },
    });

    const entitled =
      Number(balance?.openingBalance ?? leaveType.openingBalance) +
      Number(balance?.accrued ?? 0) +
      Number(balance?.carriedForward ?? 0) +
      Number(balance?.adjusted ?? 0);
    const consumed = Number(balance?.used ?? 0) + Number(balance?.pending ?? 0);
    const available = entitled - consumed;

    // Unpaid leave has no balance to exhaust, so it is never blocked.
    if (leaveType.isPaid && days > available) {
      return {
        error: `You have ${available} day${available === 1 ? "" : "s"} of ${leaveType.name} left, and this request is ${days}.`,
      } as const;
    }

    const request = await tx.leaveRequest.create({
      data: {
        orgId: session.org.id,
        employeeId,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        isHalfDay,
        halfDaySession: isHalfDay
          ? ((input.halfDaySession as "FIRST_HALF" | "SECOND_HALF") ??
            "FIRST_HALF")
          : null,
        days,
        reason: input.reason,
        contactDuringLeave: input.contactDuringLeave || null,
        status: leaveType.requiresApproval ? "PENDING" : "APPROVED",
        ...(leaveType.requiresApproval
          ? {}
          : { decidedAt: new Date(), approverId: null }),
      },
    });

    // Reserve the days so they can't be spent twice while awaiting a decision.
    await tx.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId,
          leaveTypeId: leaveType.id,
          year,
        },
      },
      create: {
        orgId: session.org.id,
        employeeId,
        leaveTypeId: leaveType.id,
        year,
        openingBalance: leaveType.openingBalance,
        ...(leaveType.requiresApproval ? { pending: days } : { used: days }),
      },
      update: leaveType.requiresApproval
        ? { pending: { increment: days } }
        : { used: { increment: days } },
    });

    if (!leaveType.requiresApproval) {
      await tx.leaveLedgerEntry.create({
        data: {
          orgId: session.org.id,
          employeeId,
          leaveTypeId: leaveType.id,
          year,
          delta: -days,
          reason: "CONSUMED",
          leaveRequestId: request.id,
          note: `Auto-approved ${leaveType.name}`,
        },
      });
    }

    return { request } as const;
  });

  if ("error" in result) return { error: result.error };

  await audit(session, {
    action: "leave.requested",
    entityType: "LeaveRequest",
    entityId: result.request.id,
    summary: `Requested ${days} day(s) of ${leaveType.name} for ${formatDateRange(startDate, endDate)}`,
  });

  // Tell the approver. Reporting manager first, HR as the fallback when an
  // employee has no manager set.
  if (leaveType.requiresApproval) {
    await notifyApprovers(session, {
      employeeId,
      employeeName: `${session.employee.firstName} ${session.employee.lastName}`,
      leaveTypeName: leaveType.name,
      range: formatDateRange(startDate, endDate),
      days,
      requestId: result.request.id,
    });
  }

  revalidatePath("/leave");
  revalidatePath("/me");
  return { success: true };
}

async function notifyApprovers(
  session: Awaited<ReturnType<typeof requireAuth>>,
  input: {
    employeeId: string;
    employeeName: string;
    leaveTypeName: string;
    range: string;
    days: number;
    requestId: string;
  },
) {
  const db = orgDb(session.org.id);

  const employee = await db.employee.findFirst({
    where: { id: input.employeeId },
    select: { managerId: true },
  });

  const recipients: string[] = [];

  if (employee?.managerId) {
    const managerUserId = await userIdForEmployee(employee.managerId);
    if (managerUserId) recipients.push(managerUserId);
  }

  // Nobody to approve? Route to whoever holds org-wide approval.
  if (recipients.length === 0) {
    const hrRoles = await db.role.findMany({
      where: { permissions: { has: "leave.approve.all" } },
      select: { id: true },
    });
    const hrUsers = await db.user.findMany({
      where: { roleId: { in: hrRoles.map((r) => r.id) }, status: "ACTIVE" },
      select: { id: true },
      take: 5,
    });
    recipients.push(...hrUsers.map((u) => u.id));
  }

  for (const userId of recipients) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "LEAVE_REQUESTED",
      title: `${input.employeeName} requested ${input.leaveTypeName}`,
      body: `${input.days} day${input.days === 1 ? "" : "s"} · ${input.range}`,
      linkUrl: "/leave/approvals",
    });

    const user = await rawDb.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user) {
      await sendApprovalRequestEmail({
        to: user.email,
        requesterName: input.employeeName,
        what: input.leaveTypeName.toLowerCase(),
        detail: `${input.days} day${input.days === 1 ? "" : "s"} · ${input.range}`,
        url: `${process.env.APP_URL ?? "http://localhost:3000"}/leave/approvals`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

export async function decideLeaveAction(
  requestId: string,
  approve: boolean,
  note?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "leave.approve.team", "leave.approve.all");

  const db = orgDb(session.org.id);

  const request = await db.leaveRequest.findFirst({
    where: { id: requestId },
    include: {
      leaveType: true,
      employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
    },
  });

  if (!request) return { error: "That request no longer exists." };
  if (request.status !== "PENDING") {
    return { error: "That request has already been decided." };
  }

  // Team approvers may only decide for their own reporting line.
  if (!can(session, "leave.approve.all")) {
    const reachable = await canReachEmployee(
      session,
      "leave.approve",
      request.employeeId,
    );
    if (!reachable) return { error: "That request isn't yours to decide." };
  }

  if (request.employeeId === session.employee?.id) {
    return { error: "You can't approve your own leave." };
  }

  const days = Number(request.days);
  const year = leaveYearOf(request.startDate, session.org.fiscalYearStartMonth);

  await rawDb.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: {
        status: approve ? "APPROVED" : "REJECTED",
        approverId: session.employee?.id ?? null,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    });

    if (approve) {
      // Reserved days become spent days.
      await tx.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        data: {
          pending: { decrement: days },
          used: { increment: days },
        },
      });

      await tx.leaveLedgerEntry.create({
        data: {
          orgId: session.org.id,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
          delta: -days,
          reason: "CONSUMED",
          leaveRequestId: requestId,
          note: `Approved by ${session.user.name}`,
          createdById: session.user.id,
        },
      });
    } else {
      // Declined — hand the reserved days back.
      await tx.leaveBalance.update({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: request.employeeId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        data: { pending: { decrement: days } },
      });
    }
  });

  await audit(session, {
    action: "leave.decided",
    entityType: "LeaveRequest",
    entityId: requestId,
    summary: `${approve ? "Approved" : "Declined"} ${request.leaveType.name} for ${request.employee.firstName} ${request.employee.lastName}`,
    after: { status: approve ? "APPROVED" : "REJECTED", note: note ?? null },
  });

  const employeeUserId = await userIdForEmployee(request.employeeId);
  if (employeeUserId) {
    await notify({
      orgId: session.org.id,
      userId: employeeUserId,
      type: approve ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      title: `Your ${request.leaveType.name} was ${approve ? "approved" : "declined"}`,
      body: formatDateRange(request.startDate, request.endDate),
      linkUrl: "/me/leave",
    });
  }

  await sendLeaveDecisionEmail({
    to: request.employee.workEmail,
    employeeName: request.employee.firstName,
    approverName: session.user.name,
    leaveType: request.leaveType.name,
    dateRange: formatDateRange(request.startDate, request.endDate),
    approved: approve,
    note: note ?? null,
    url: `${process.env.APP_URL ?? "http://localhost:3000"}/me/leave`,
  });

  revalidatePath("/leave");
  revalidatePath("/leave/approvals");
  revalidatePath("/me");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

export async function cancelLeaveAction(
  requestId: string,
): Promise<FormState> {
  const session = await requireAuth();
  const db = orgDb(session.org.id);

  const request = await db.leaveRequest.findFirst({
    where: { id: requestId },
    include: { leaveType: true },
  });
  if (!request) return { error: "That request no longer exists." };

  const isOwner = request.employeeId === session.employee?.id;
  if (!isOwner) {
    await assertPermission(session, "leave.approve.all");
  }

  if (request.status === "CANCELLED") {
    return { error: "That request is already cancelled." };
  }
  if (request.status === "REJECTED") {
    return { error: "A declined request can't be cancelled." };
  }

  // Leave already taken is history, not a booking.
  if (request.status === "APPROVED" && request.endDate < today()) {
    return {
      error:
        "That leave has already been taken. Ask HR to adjust the balance instead.",
    };
  }

  const days = Number(request.days);
  const year = leaveYearOf(request.startDate, session.org.fiscalYearStartMonth);
  const wasApproved = request.status === "APPROVED";

  await rawDb.$transaction(async (tx) => {
    await tx.leaveRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    await tx.leaveBalance.update({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      },
      data: wasApproved
        ? { used: { decrement: days } }
        : { pending: { decrement: days } },
    });

    if (wasApproved) {
      await tx.leaveLedgerEntry.create({
        data: {
          orgId: session.org.id,
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          year,
          delta: days,
          reason: "REVERSED",
          leaveRequestId: requestId,
          note: "Cancelled before the leave started",
          createdById: session.user.id,
        },
      });
    }
  });

  await audit(session, {
    action: "leave.cancelled",
    entityType: "LeaveRequest",
    entityId: requestId,
    summary: `Cancelled ${request.leaveType.name} for ${formatDateRange(request.startDate, request.endDate)}`,
  });

  revalidatePath("/leave");
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
