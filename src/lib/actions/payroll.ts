"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify } from "../notifications";
import { emitWebhook } from "../webhooks";
import { toDateOnly } from "../dates";
import { formatMoney } from "../money";
import { calculatePayslip } from "../payroll/engine";
import { periodLabel } from "../payroll/period";
import {
  lossOfPayDays,
  toEngineComponents,
  toStatutoryConfig,
  workingDaysInPeriod,
} from "../queries/payroll";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Payroll operations.
 *
 * The shape of the workflow is deliberate: DRAFT → REVIEW → APPROVED → PAID.
 * Calculating is destructive-but-repeatable (it wipes and rebuilds the run's
 * payslips), approving is one-way, and *only* approval publishes payslips to
 * employees. Nobody sees a number that the payroll owner has not signed off.
 *
 * `payroll.run` and `payroll.approve` are separate permissions so an
 * organisation that wants two people involved can express that; by default HR
 * holds both, because most SMEs have one person doing payroll and pretending
 * otherwise would just add clicks.
 */

// periodLabel lives in ../payroll/period because every export of a "use server"
// module has to be an async server action, and it is a plain string helper.

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

const createRunSchema = z.object({
  periodMonth: z.coerce.number().int().min(1).max(12),
  periodYear: z.coerce.number().int().min(2000).max(2100),
  payDate: z.string().optional(),
  note: z.string().trim().max(500).optional(),
});

export async function createPayrollRunAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.run");

  const parsed = createRunSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { periodMonth, periodYear, payDate, note } = parsed.data;
  const db = orgDb(session.org.id);

  const existing = await db.payrollRun.findFirst({
    where: { periodMonth, periodYear },
  });
  if (existing) {
    return {
      error: `${periodLabel(periodMonth, periodYear)} already has a payroll run. Open it instead of starting a second one.`,
    };
  }

  const run = await db.payrollRun.create({
    data: {
      orgId: session.org.id,
      periodMonth,
      periodYear,
      payDate: payDate ? toDateOnly(new Date(payDate)) : null,
      note: note || null,
    },
  });

  await audit(session, {
    action: "payroll.run.created",
    entityType: "PayrollRun",
    entityId: run.id,
    summary: `Started payroll for ${periodLabel(periodMonth, periodYear)}`,
  });

  revalidatePath("/payroll");
  return { success: true };
}

/**
 * Calculates every payslip in the run.
 *
 * Wipes and rebuilds rather than patching: payroll is re-run constantly during
 * the review week as attendance is corrected and joiners are added, and a
 * partial update would leave stale lines behind for anyone whose structure
 * changed. Refused once the run is approved, because a payslip an employee has
 * already downloaded must not silently change underneath them.
 */
export async function calculatePayrollAction(runId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.run");

  const db = orgDb(session.org.id);

  const run = await db.payrollRun.findFirst({ where: { id: runId } });
  if (!run) return { error: "That payroll run no longer exists." };
  if (run.status === "APPROVED" || run.status === "PAID") {
    return {
      error:
        "This run is already approved. Payslips have been released, so the numbers are fixed.",
    };
  }
  if (run.status === "CANCELLED") {
    return { error: "This run was cancelled." };
  }

  const setting = await db.statutorySetting.findFirst({
    where: { orgId: session.org.id },
  });
  if (!setting) {
    return {
      error:
        "Statutory settings are missing for this organisation. Open Settings → Statutory to configure the compliance pack first.",
    };
  }

  const statutory = toStatutoryConfig(setting);
  const workingDays = await workingDaysInPeriod(
    session,
    run.periodYear,
    run.periodMonth,
  );

  if (workingDays <= 0) {
    return {
      error:
        "That month has no working days according to the organisation calendar. Check the working days and holiday settings.",
    };
  }

  // Only people who were employed during the period, and only those with a
  // salary on record — an employee with no structure assigned is reported back
  // rather than silently paid zero.
  const periodEnd = new Date(Date.UTC(run.periodYear, run.periodMonth, 0));
  const employees = await db.employee.findMany({
    where: {
      status: { in: ["ACTIVE", "ON_LEAVE", "NOTICE_PERIOD"] },
      dateOfJoining: { lte: periodEnd },
    },
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      designation: { select: { title: true } },
      department: { select: { name: true } },
    },
    orderBy: { employeeCode: "asc" },
  });

  if (employees.length === 0) {
    return { error: "There is nobody to pay for this period." };
  }

  const salaries = await db.employeeSalary.findMany({
    where: {
      employeeId: { in: employees.map((e) => e.id) },
      effectiveFrom: { lte: periodEnd },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodEnd } }],
    },
    orderBy: { effectiveFrom: "desc" },
    include: {
      structure: {
        include: {
          components: {
            orderBy: { sortdex: "asc" },
            include: { component: true },
          },
        },
      },
    },
  });

  // Latest effective row per employee wins.
  const salaryFor = new Map<string, (typeof salaries)[number]>();
  for (const salary of salaries) {
    if (!salaryFor.has(salary.employeeId)) salaryFor.set(salary.employeeId, salary);
  }

  const payable = employees.filter((e) => salaryFor.has(e.id));
  if (payable.length === 0) {
    return {
      error:
        "No employee has a salary structure assigned yet. Set compensation on an employee record first.",
    };
  }

  // Approved-but-unreimbursed claims ride along with this run.
  const claims = await db.expenseClaim.findMany({
    where: { status: "APPROVED", payrollRunId: null },
    select: { id: true, employeeId: true, totalAmount: true },
  });
  const claimTotals = new Map<string, number>();
  for (const claim of claims) {
    claimTotals.set(
      claim.employeeId,
      (claimTotals.get(claim.employeeId) ?? 0) + Number(claim.totalAmount),
    );
  }

  const activeLoans = await db.loanAdvance.findMany({
    where: { status: "ACTIVE" },
  });
  const loanFor = new Map(activeLoans.map((loan) => [loan.employeeId, loan]));

  const lopByEmployee = new Map<string, number>();
  for (const employee of payable) {
    lopByEmployee.set(
      employee.id,
      await lossOfPayDays(session, employee.id, run.periodYear, run.periodMonth),
    );
  }

  let totalGross = 0;
  let totalDeductions = 0;
  let totalNet = 0;
  let totalEmployerCost = 0;

  await rawDb.$transaction(async (tx) => {
    // Rebuild from scratch; lines cascade with their payslip.
    await tx.payslip.deleteMany({ where: { orgId: session.org.id, payrollRunId: runId } });

    for (const employee of payable) {
      const salary = salaryFor.get(employee.id)!;
      const components = toEngineComponents(salary.structure.components);

      const lop = Math.min(lopByEmployee.get(employee.id) ?? 0, workingDays);
      const loan = loanFor.get(employee.id);

      const result = calculatePayslip({
        annualCtc: Number(salary.annualCtc),
        components,
        statutory,
        workingDays,
        paidDays: workingDays - lop,
        loanInstallment: loan ? Number(loan.installmentAmount) : 0,
        reimbursements: claimTotals.get(employee.id) ?? 0,
      });

      const payslip = await tx.payslip.create({
        data: {
          orgId: session.org.id,
          payrollRunId: runId,
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
          designationTitle: employee.designation?.title ?? null,
          departmentName: employee.department?.name ?? null,
          workingDays,
          paidDays: workingDays - lop,
          lopDays: lop,
          grossEarnings: result.grossEarnings,
          totalDeductions: result.totalDeductions,
          employerContributions: result.employerContributions,
          netPay: result.netPay,
        },
      });

      await tx.payslipLine.createMany({
        data: result.lines.map((line) => ({
          orgId: session.org.id,
          payslipId: payslip.id,
          code: line.code,
          label: line.label,
          type: line.type,
          amount: line.amount,
          basis: line.basis,
          sortdex: line.sortdex,
        })),
      });

      totalGross += result.grossEarnings;
      totalDeductions += result.totalDeductions;
      totalNet += result.netPay;
      totalEmployerCost += result.grossEarnings + result.employerContributions;
    }

    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "REVIEW",
        headcount: payable.length,
        totalGross,
        totalDeductions,
        totalNet,
        totalEmployerCost,
        processedAt: new Date(),
      },
    });
  });

  await audit(session, {
    action: "payroll.run.calculated",
    entityType: "PayrollRun",
    entityId: runId,
    summary: `Calculated ${periodLabel(run.periodMonth, run.periodYear)} for ${payable.length} employee(s), net ${formatMoney(totalNet, session.org.currency)}`,
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId}`);

  const skipped = employees.length - payable.length;
  return {
    success: true,
    error:
      skipped > 0
        ? `${skipped} employee${skipped === 1 ? " was" : "s were"} skipped — no salary structure assigned.`
        : undefined,
  };
}

/**
 * Approves the run and releases payslips.
 *
 * One transaction does four things that must not come apart: locks the run,
 * stamps every payslip as published, closes out the loan instalments that were
 * recovered, and marks the expense claims that rode along as reimbursed. If any
 * of it fails, none of it happened.
 */
export async function approvePayrollAction(runId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.approve");

  const db = orgDb(session.org.id);
  const run = await db.payrollRun.findFirst({
    where: { id: runId },
    include: { payslips: { select: { id: true, employeeId: true, netPay: true } } },
  });

  if (!run) return { error: "That payroll run no longer exists." };
  if (run.status !== "REVIEW") {
    return {
      error:
        run.status === "DRAFT"
          ? "Calculate the run before approving it."
          : "This run has already been approved.",
    };
  }
  if (run.payslips.length === 0) {
    return { error: "There are no payslips in this run to release." };
  }

  const now = new Date();
  const employeeIds = run.payslips.map((p) => p.employeeId);

  await rawDb.$transaction(async (tx) => {
    await tx.payrollRun.update({
      where: { id: runId },
      data: {
        status: "APPROVED",
        approvedById: session.user.id,
        approvedAt: now,
      },
    });

    await tx.payslip.updateMany({
      where: { orgId: session.org.id, payrollRunId: runId },
      data: { publishedAt: now },
    });

    // Loan recovery: one instalment per employee actually paid in this run.
    const loans = await tx.loanAdvance.findMany({
      where: { orgId: session.org.id, status: "ACTIVE", employeeId: { in: employeeIds } },
    });

    for (const loan of loans) {
      const paid = loan.installmentsPaid + 1;
      const done = paid >= loan.installmentsTotal;
      await tx.loanAdvance.update({
        where: { id: loan.id },
        data: {
          installmentsPaid: paid,
          recovered: { increment: loan.installmentAmount },
          status: done ? "CLOSED" : "ACTIVE",
        },
      });
    }

    await tx.expenseClaim.updateMany({
      where: {
        orgId: session.org.id,
        status: "APPROVED",
        payrollRunId: null,
        employeeId: { in: employeeIds },
      },
      data: { status: "REIMBURSED", payrollRunId: runId, reimbursedAt: now },
    });
  });

  await audit(session, {
    action: "payroll.run.approved",
    entityType: "PayrollRun",
    entityId: runId,
    summary: `Approved and released ${run.payslips.length} payslip(s) for ${periodLabel(run.periodMonth, run.periodYear)}`,
  });

  // Tell everyone their payslip is available.
  const employees = await db.employee.findMany({
    where: { id: { in: employeeIds }, userId: { not: null } },
    select: { userId: true },
  });

  for (const employee of employees) {
    if (!employee.userId) continue;
    await notify({
      orgId: session.org.id,
      userId: employee.userId,
      type: "PAYSLIP_PUBLISHED",
      title: `Your ${periodLabel(run.periodMonth, run.periodYear)} payslip is ready`,
      body: "Open My space to view and download it.",
      linkUrl: "/me/payslips",
    });
  }

  await emitWebhook(session.org.id, "payroll.run.completed", {
    runId,
    period: `${run.periodYear}-${String(run.periodMonth).padStart(2, "0")}`,
    headcount: run.payslips.length,
    totalNet: Number(run.totalNet),
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId}`);
  return { success: true };
}

export async function markPayrollPaidAction(runId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.approve");

  const db = orgDb(session.org.id);
  const run = await db.payrollRun.findFirst({ where: { id: runId } });
  if (!run) return { error: "That payroll run no longer exists." };
  if (run.status !== "APPROVED") {
    return { error: "Only an approved run can be marked paid." };
  }

  await db.payrollRun.update({
    where: { id: runId },
    data: { status: "PAID", paidAt: new Date() },
  });

  await audit(session, {
    action: "payroll.run.paid",
    entityType: "PayrollRun",
    entityId: runId,
    summary: `Marked ${periodLabel(run.periodMonth, run.periodYear)} as disbursed`,
  });

  revalidatePath("/payroll");
  revalidatePath(`/payroll/${runId}`);
  return { success: true };
}

export async function cancelPayrollRunAction(runId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.run");

  const db = orgDb(session.org.id);
  const run = await db.payrollRun.findFirst({ where: { id: runId } });
  if (!run) return { error: "That payroll run no longer exists." };
  if (run.status === "APPROVED" || run.status === "PAID") {
    return {
      error:
        "Approved payroll can't be cancelled — payslips are already with employees. Correct it in the next run instead.",
    };
  }

  await rawDb.$transaction(async (tx) => {
    await tx.payslip.deleteMany({ where: { orgId: session.org.id, payrollRunId: runId } });
    await tx.payrollRun.update({
      where: { id: runId },
      data: { status: "CANCELLED", headcount: 0, totalGross: 0, totalDeductions: 0, totalNet: 0, totalEmployerCost: 0 },
    });
  });

  await audit(session, {
    action: "payroll.run.cancelled",
    entityType: "PayrollRun",
    entityId: runId,
    summary: `Cancelled ${periodLabel(run.periodMonth, run.periodYear)}`,
  });

  revalidatePath("/payroll");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Compensation
// ---------------------------------------------------------------------------

const salarySchema = z.object({
  employeeId: z.string().min(1),
  structureId: z.string().min(1, "Choose a salary structure"),
  annualCtc: z.coerce.number().positive("Enter the annual CTC"),
  effectiveFrom: z.string().min(1, "Choose an effective date"),
  note: z.string().trim().max(300).optional(),
});

/**
 * Records a salary, closing the previous one rather than editing it. A raise is
 * a new row with an effective date; history is never rewritten, which is what
 * lets an old payslip still be explained.
 */
export async function setSalaryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.compensation.manage");

  const parsed = salarySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { employeeId, structureId, annualCtc, effectiveFrom, note } = parsed.data;
  const db = orgDb(session.org.id);

  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { id: true, firstName: true, lastName: true, ctcAnnual: true },
  });
  if (!employee) return { error: "That employee no longer exists." };

  const structure = await db.salaryStructure.findFirst({ where: { id: structureId } });
  if (!structure) return { fieldErrors: { structureId: "Unknown structure." } };

  const from = toDateOnly(new Date(effectiveFrom));

  await rawDb.$transaction(async (tx) => {
    await tx.employeeSalary.updateMany({
      where: { orgId: session.org.id, employeeId, effectiveTo: null },
      data: { effectiveTo: new Date(from.getTime() - 86_400_000) },
    });

    await tx.employeeSalary.create({
      data: {
        orgId: session.org.id,
        employeeId,
        structureId,
        annualCtc,
        effectiveFrom: from,
        note: note || null,
        createdById: session.user.id,
      },
    });

    // The employee record keeps the headline figure so the profile and reports
    // don't have to join the history table for one number.
    await tx.employee.update({
      where: { id: employeeId },
      data: { ctcAnnual: annualCtc },
    });
  });

  await audit(session, {
    action: "payroll.salary.assigned",
    entityType: "Employee",
    entityId: employeeId,
    summary: `Set compensation for ${employee.firstName} ${employee.lastName} to ${formatMoney(annualCtc, session.org.currency)} on ${structure.name}`,
    before: { ctcAnnual: employee.ctcAnnual ? String(employee.ctcAnnual) : null },
    after: { ctcAnnual: String(annualCtc) },
  });

  revalidatePath(`/people/${employeeId}`);
  revalidatePath("/payroll");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Loans & advances
// ---------------------------------------------------------------------------

const loanSchema = z.object({
  employeeId: z.string().min(1, "Choose an employee"),
  reason: z.string().trim().min(3, "Say what the advance is for").max(200),
  principal: z.coerce.number().positive("Enter the amount"),
  installmentsTotal: z.coerce
    .number()
    .int()
    .min(1, "At least one instalment")
    .max(60, "Spread it over 60 months or fewer"),
  startMonth: z.coerce.number().int().min(1).max(12),
  startYear: z.coerce.number().int().min(2000).max(2100),
});

export async function createLoanAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "loan.manage");

  const parsed = loanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const outstanding = await db.loanAdvance.findFirst({
    where: { employeeId: input.employeeId, status: "ACTIVE" },
  });
  if (outstanding) {
    return {
      error:
        "This employee already has an active advance. Close it before issuing another — payroll recovers one instalment per month.",
    };
  }

  const loan = await db.loanAdvance.create({
    data: {
      orgId: session.org.id,
      employeeId: input.employeeId,
      reason: input.reason,
      principal: input.principal,
      installmentAmount: Math.ceil(input.principal / input.installmentsTotal),
      installmentsTotal: input.installmentsTotal,
      startMonth: input.startMonth,
      startYear: input.startYear,
    },
  });

  await audit(session, {
    action: "loan.created",
    entityType: "LoanAdvance",
    entityId: loan.id,
    summary: `Issued an advance of ${formatMoney(input.principal, session.org.currency)} over ${input.installmentsTotal} instalments`,
  });

  revalidatePath("/payroll/loans");
  return { success: true };
}

export async function cancelLoanAction(loanId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "loan.manage");

  const db = orgDb(session.org.id);
  const loan = await db.loanAdvance.findFirst({ where: { id: loanId } });
  if (!loan) return { error: "That advance no longer exists." };

  await db.loanAdvance.update({
    where: { id: loanId },
    data: { status: "CANCELLED" },
  });

  await audit(session, {
    action: "loan.cancelled",
    entityType: "LoanAdvance",
    entityId: loanId,
    summary: `Cancelled an advance with ${loan.installmentsTotal - loan.installmentsPaid} instalment(s) outstanding`,
  });

  revalidatePath("/payroll/loans");
  return { success: true };
}
