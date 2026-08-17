"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, notifyMany, userIdForEmployee } from "../notifications";
import { emitWebhook } from "../webhooks";
import { addDays, toDateOnly, today } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Exit management (PRD §8.21).
 *
 * Accepting a resignation is the moment several things become true at once:
 * the last working day is fixed, the employee moves to notice period, the
 * clearance checklist starts, and a settlement stub appears. They are written
 * in one transaction because an accepted resignation with no clearance list is
 * how kit walks out of the building.
 */

const resignSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, "A line or two — this goes to your manager and HR")
    .max(3000),
  lastWorkingDayRequested: z.string().min(1, "When would you like to leave?"),
  exitType: z.enum(["RESIGNATION", "RETIREMENT", "END_OF_CONTRACT"]).optional(),
});

export async function submitResignationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "exit.request");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const parsed = resignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = orgDb(session.org.id);

  const open = await db.resignation.findFirst({
    where: {
      employeeId: session.employee.id,
      status: { in: ["SUBMITTED", "ACCEPTED"] },
    },
  });
  if (open) {
    return { error: "You already have a resignation in progress." };
  }

  const employee = await db.employee.findFirst({
    where: { id: session.employee.id },
    select: { noticePeriodDays: true, managerId: true, firstName: true, lastName: true },
  });
  if (!employee) return { error: "Your employee record no longer exists." };

  const requested = toDateOnly(new Date(parsed.data.lastWorkingDayRequested));
  if (requested < today()) {
    return {
      fieldErrors: {
        lastWorkingDayRequested: "That date has already passed.",
      },
    };
  }

  const resignation = await db.resignation.create({
    data: {
      orgId: session.org.id,
      employeeId: session.employee.id,
      exitType: parsed.data.exitType ?? "RESIGNATION",
      reason: parsed.data.reason,
      noticePeriodDays: employee.noticePeriodDays,
      lastWorkingDayRequested: requested,
      status: "SUBMITTED",
    },
  });

  await audit(session, {
    action: "exit.requested",
    entityType: "Resignation",
    entityId: resignation.id,
    summary: `Resigned, requesting a last working day of ${requested.toISOString().slice(0, 10)}`,
  });

  // The manager first, HR always — a resignation that only reaches a manager
  // who is on leave is a resignation nobody acts on.
  const recipients = new Set<string>();
  if (employee.managerId) {
    const managerUserId = await userIdForEmployee(employee.managerId);
    if (managerUserId) recipients.add(managerUserId);
  }

  const hrRoles = await db.role.findMany({
    where: { permissions: { has: "exit.manage" } },
    select: { id: true },
  });
  const hrUsers = await db.user.findMany({
    where: { roleId: { in: hrRoles.map((r) => r.id) }, status: "ACTIVE" },
    select: { id: true },
    take: 8,
  });
  for (const user of hrUsers) recipients.add(user.id);

  await notifyMany(
    Array.from(recipients).map((userId) => ({
      orgId: session.org.id,
      userId,
      type: "RESIGNATION_SUBMITTED" as const,
      title: `${employee.firstName} ${employee.lastName} has resigned`,
      body: `Requested last working day: ${requested.toISOString().slice(0, 10)}`,
      linkUrl: `/exits/${resignation.id}`,
    })),
  );

  revalidatePath("/exits");
  revalidatePath("/me");
  redirect(`/exits/${resignation.id}`);
}

export async function withdrawResignationAction(
  id: string,
): Promise<FormState> {
  const session = await requireAuth();

  const db = orgDb(session.org.id);
  const resignation = await db.resignation.findFirst({ where: { id } });
  if (!resignation) return { error: "That resignation no longer exists." };

  const mine = resignation.employeeId === session.employee?.id;
  if (!mine) await assertPermission(session, "exit.manage");

  if (resignation.status === "COMPLETED") {
    return { error: "That exit is already complete." };
  }

  await rawDb.$transaction(async (tx) => {
    await tx.resignation.update({
      where: { id },
      data: { status: "WITHDRAWN" },
    });

    // Withdrawing puts the person back to active and stops the clearance list.
    await tx.employee.update({
      where: { id: resignation.employeeId },
      data: { status: "ACTIVE", dateOfExit: null },
    });

    if (resignation.clearanceInstanceId) {
      await tx.checklistInstance.update({
        where: { id: resignation.clearanceInstanceId },
        data: { status: "CANCELLED" },
      });
    }
  });

  await audit(session, {
    action: "exit.withdrawn",
    entityType: "Resignation",
    entityId: id,
    summary: "Resignation withdrawn",
  });

  revalidatePath("/exits");
  revalidatePath("/me");
  return { success: true };
}

/**
 * Accepting or declining a resignation.
 *
 * On acceptance this is the one write in the app that touches five tables. All
 * of it or none of it: the employee's status, their exit date, the clearance
 * checklist, its tasks, and the settlement stub.
 */
export async function decideResignationAction(
  id: string,
  accept: boolean,
  lastWorkingDay?: string,
  note?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "exit.manage");

  const db = orgDb(session.org.id);
  const resignation = await db.resignation.findFirst({
    where: { id },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, managerId: true },
      },
    },
  });
  if (!resignation) return { error: "That resignation no longer exists." };
  if (resignation.status !== "SUBMITTED") {
    return { error: "That resignation has already been decided." };
  }

  if (!accept) {
    await db.resignation.update({
      where: { id },
      data: {
        status: "REJECTED",
        decidedById: session.employee?.id ?? null,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
      },
    });

    await audit(session, {
      action: "exit.decided",
      entityType: "Resignation",
      entityId: id,
      summary: `Declined the resignation of ${resignation.employee.firstName} ${resignation.employee.lastName}`,
    });

    revalidatePath("/exits");
    revalidatePath(`/exits/${id}`);
    return { success: true };
  }

  const approvedDay = lastWorkingDay
    ? toDateOnly(new Date(lastWorkingDay))
    : resignation.lastWorkingDayRequested;

  await rawDb.$transaction(async (tx) => {
    // The offboarding checklist, dated backwards from the last working day.
    const template = await tx.checklistTemplate.findFirst({
      where: { orgId: session.org.id, kind: "OFFBOARDING", isActive: true },
      orderBy: { isDefault: "desc" },
      include: { items: { orderBy: { sortdex: "asc" } } },
    });

    let clearanceId: string | null = null;

    if (template && template.items.length > 0) {
      const instance = await tx.checklistInstance.create({
        data: {
          orgId: session.org.id,
          employeeId: resignation.employeeId,
          templateId: template.id,
          kind: "OFFBOARDING",
          name: template.name,
          anchorDate: approvedDay,
          status: "IN_PROGRESS",
        },
      });

      await tx.checklistTask.createMany({
        data: template.items.map((item, index) => ({
          orgId: session.org.id,
          instanceId: instance.id,
          title: item.title,
          description: item.description,
          category: item.category,
          assigneeId:
            item.category === "Manager" ? resignation.employee.managerId : null,
          dueDate: addDays(approvedDay, item.offsetDays),
          sortdex: index,
        })),
      });

      clearanceId = instance.id;
    }

    await tx.resignation.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        lastWorkingDayApproved: approvedDay,
        decidedById: session.employee?.id ?? null,
        decidedAt: new Date(),
        decisionNote: note?.trim() || null,
        clearanceInstanceId: clearanceId,
      },
    });

    await tx.employee.update({
      where: { id: resignation.employeeId },
      data: { status: "NOTICE_PERIOD", dateOfExit: approvedDay },
    });

    // A settlement stub so it shows on the unsettled list from day one, rather
    // than appearing only once someone remembers to compute it.
    await tx.finalSettlement.upsert({
      where: { resignationId: id },
      create: {
        orgId: session.org.id,
        resignationId: id,
        employeeId: resignation.employeeId,
        status: "PENDING",
      },
      update: {},
    });

    // The exit interview form, ready for them to fill in.
    await tx.exitInterview.upsert({
      where: { resignationId: id },
      create: {
        orgId: session.org.id,
        resignationId: id,
        employeeId: resignation.employeeId,
      },
      update: {},
    });
  });

  await audit(session, {
    action: "exit.decided",
    entityType: "Resignation",
    entityId: id,
    summary: `Accepted the resignation of ${resignation.employee.firstName} ${resignation.employee.lastName}; last working day ${approvedDay.toISOString().slice(0, 10)}`,
  });

  const userId = await userIdForEmployee(resignation.employeeId);
  if (userId) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "CLEARANCE_PENDING",
      title: "Your resignation has been accepted",
      body: `Last working day: ${approvedDay.toISOString().slice(0, 10)}. Your clearance checklist has started.`,
      linkUrl: `/exits/${id}`,
    });
  }

  revalidatePath("/exits");
  revalidatePath(`/exits/${id}`);
  revalidatePath("/journeys");
  revalidatePath("/people");
  return { success: true };
}

/**
 * Marking the exit complete.
 *
 * The last step: the employee becomes EXITED, which is what removes them from
 * headcount, attendance and the directory. Deliberately gated on the settlement
 * being paid — an "exited" employee still owed money is a support ticket
 * waiting to happen.
 */
export async function completeExitAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "exit.manage");

  const db = orgDb(session.org.id);
  const resignation = await db.resignation.findFirst({
    where: { id },
    include: {
      settlement: true,
      clearance: { include: { tasks: { select: { status: true } } } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!resignation) return { error: "That resignation no longer exists." };
  if (resignation.status !== "ACCEPTED") {
    return { error: "Only an accepted resignation can be completed." };
  }

  if (resignation.settlement && resignation.settlement.status !== "PAID") {
    return {
      error:
        "The full and final settlement hasn't been paid yet. Settle it before closing the exit.",
    };
  }

  const outstanding =
    resignation.clearance?.tasks.filter((t) => t.status === "PENDING").length ?? 0;
  if (outstanding > 0) {
    return {
      error: `${outstanding} clearance task${outstanding === 1 ? " is" : "s are"} still open.`,
    };
  }

  await rawDb.$transaction(async (tx) => {
    await tx.resignation.update({
      where: { id },
      data: { status: "COMPLETED" },
    });

    await tx.employee.update({
      where: { id: resignation.employeeId },
      data: { status: "EXITED" },
    });

    // Their login goes with them. The employee record stays for the audit
    // trail and for the experience letter they will ask for in two years.
    await tx.user.updateMany({
      where: { employee: { id: resignation.employeeId } },
      data: { status: "SUSPENDED" },
    });

    await tx.session.updateMany({
      where: { user: { employee: { id: resignation.employeeId } }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await audit(session, {
    action: "exit.decided",
    entityType: "Resignation",
    entityId: id,
    summary: `Exit completed for ${resignation.employee.firstName} ${resignation.employee.lastName}; access revoked`,
  });

  await emitWebhook(session.org.id, "employee.exited", {
    employeeId: resignation.employeeId,
    resignationId: id,
  });

  revalidatePath("/exits");
  revalidatePath("/people");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Exit interview
// ---------------------------------------------------------------------------

const interviewSchema = z.object({
  resignationId: z.string().min(1),
  primaryReason: z.string().trim().max(40).optional(),
  overallRating: z.string().optional(),
  wouldRecommend: z.string().optional(),
  whatWorked: z.string().trim().max(4000).optional(),
  whatDidNot: z.string().trim().max(4000).optional(),
  suggestions: z.string().trim().max(4000).optional(),
});

export async function submitExitInterviewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();

  const parsed = interviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = orgDb(session.org.id);
  const resignation = await db.resignation.findFirst({
    where: { id: parsed.data.resignationId },
    include: { exitInterview: true },
  });
  if (!resignation) return { error: "That resignation no longer exists." };

  const isLeaver = resignation.employeeId === session.employee?.id;
  if (!isLeaver) await assertPermission(session, "exit.manage");

  const rating = parsed.data.overallRating
    ? Number(parsed.data.overallRating)
    : null;
  const recommend = parsed.data.wouldRecommend
    ? Number(parsed.data.wouldRecommend)
    : null;

  const data = {
    primaryReason: parsed.data.primaryReason || null,
    overallRating: rating,
    wouldRecommend: recommend,
    whatWorked: parsed.data.whatWorked || null,
    whatDidNot: parsed.data.whatDidNot || null,
    suggestions: parsed.data.suggestions || null,
    submittedAt: new Date(),
    // "Conducted by" is whoever is filling it in when that is not the leaver —
    // an exit conversation written up by HR is a different artefact from a form
    // the leaver completed alone, and the record should say which.
    ...(isLeaver ? {} : { conductedById: session.employee?.id ?? null, conductedAt: new Date() }),
  };

  await db.exitInterview.upsert({
    where: { resignationId: resignation.id },
    create: {
      orgId: session.org.id,
      resignationId: resignation.id,
      employeeId: resignation.employeeId,
      ...data,
    },
    update: data,
  });

  await audit(session, {
    action: "exit.interview.submitted",
    entityType: "ExitInterview",
    entityId: resignation.id,
    summary: `Exit interview recorded${parsed.data.primaryReason ? ` — reason: ${parsed.data.primaryReason}` : ""}`,
  });

  revalidatePath(`/exits/${resignation.id}`);
  revalidatePath("/me");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Full and final settlement
// ---------------------------------------------------------------------------

const settlementSchema = z.object({
  resignationId: z.string().min(1),
  leaveEncashmentDays: z.coerce.number().min(0).max(500),
  leaveEncashmentAmount: z.coerce.number().min(0),
  gratuityAmount: z.coerce.number().min(0),
  pendingSalary: z.coerce.number().min(0),
  pendingReimbursements: z.coerce.number().min(0),
  loanRecovery: z.coerce.number().min(0),
  noticePayRecovery: z.coerce.number().min(0),
  otherDeductions: z.coerce.number().min(0),
  note: z.string().trim().max(2000).optional(),
});

export async function computeSettlementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "settlement.manage");

  const parsed = settlementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const resignation = await db.resignation.findFirst({
    where: { id: input.resignationId },
    include: { settlement: true },
  });
  if (!resignation) return { error: "That resignation no longer exists." };
  if (resignation.settlement?.status === "PAID") {
    return { error: "That settlement has already been paid." };
  }

  const payable =
    input.leaveEncashmentAmount +
    input.gratuityAmount +
    input.pendingSalary +
    input.pendingReimbursements;

  const recoveries =
    input.loanRecovery + input.noticePayRecovery + input.otherDeductions;

  const netPayable = Math.round(payable - recoveries);

  const data = {
    leaveEncashmentDays: input.leaveEncashmentDays,
    leaveEncashmentAmount: input.leaveEncashmentAmount,
    gratuityAmount: input.gratuityAmount,
    pendingSalary: input.pendingSalary,
    pendingReimbursements: input.pendingReimbursements,
    loanRecovery: input.loanRecovery,
    noticePayRecovery: input.noticePayRecovery,
    otherDeductions: input.otherDeductions,
    netPayable,
    note: input.note || null,
    status: "COMPUTED" as const,
    computedAt: new Date(),
  };

  await db.finalSettlement.upsert({
    where: { resignationId: resignation.id },
    create: {
      orgId: session.org.id,
      resignationId: resignation.id,
      employeeId: resignation.employeeId,
      ...data,
    },
    update: data,
  });

  await audit(session, {
    action: "settlement.computed",
    entityType: "FinalSettlement",
    entityId: resignation.id,
    summary: `Full and final computed: net ${netPayable}`,
    after: data,
  });

  revalidatePath(`/exits/${resignation.id}`);
  revalidatePath("/exits");
  return { success: true };
}

export async function setSettlementStatusAction(
  resignationId: string,
  status: "APPROVED" | "PAID",
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "settlement.manage");

  const db = orgDb(session.org.id);
  const settlement = await db.finalSettlement.findFirst({
    where: { resignationId },
  });
  if (!settlement) return { error: "Nothing has been computed yet." };
  if (settlement.status === "PENDING") {
    return { error: "Compute the settlement first." };
  }
  if (status === "PAID" && settlement.status !== "APPROVED") {
    return { error: "Approve it before marking it paid." };
  }

  await db.finalSettlement.update({
    where: { id: settlement.id },
    data: {
      status,
      ...(status === "APPROVED"
        ? { approvedById: session.user.id, approvedAt: new Date() }
        : { paidAt: new Date() }),
    },
  });

  await audit(session, {
    action: status === "APPROVED" ? "settlement.approved" : "settlement.paid",
    entityType: "FinalSettlement",
    entityId: settlement.id,
    summary: `Settlement ${status.toLowerCase()}: net ${settlement.netPayable}`,
  });

  const userId = await userIdForEmployee(settlement.employeeId);
  if (userId && status === "PAID") {
    await notify({
      orgId: session.org.id,
      userId,
      type: "CLEARANCE_PENDING",
      title: "Your full and final settlement has been paid",
      body: "The breakdown is on your exit record.",
      linkUrl: `/exits/${resignationId}`,
    });
  }

  revalidatePath(`/exits/${resignationId}`);
  revalidatePath("/exits");
  return { success: true };
}
