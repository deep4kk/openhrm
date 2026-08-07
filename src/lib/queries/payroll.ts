import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { countWorkingDays, endOfMonth, startOfMonth } from "../dates";
import type { EngineComponent, StatutoryConfig, Slab } from "../payroll/engine";

/**
 * Reading payroll.
 *
 * The one rule enforced here rather than in the pages: an employee holding only
 * `payroll.read.self` can reach their own payslips and nothing else. Everything
 * wider needs `payroll.read.all` — there is deliberately no `.team` scope for
 * payroll, because a manager seeing their reports' salaries is a policy an
 * organisation should have to opt into by composing a custom role, not a
 * default that ships switched on.
 */

export async function listPayrollRuns(session: AuthContext, take = 24) {
  const db = orgDb(session.org.id);
  return db.payrollRun.findMany({
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
    take,
    include: {
      approvedBy: { select: { name: true } },
      _count: { select: { payslips: true } },
    },
  });
}

export async function getPayrollRun(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  return db.payrollRun.findFirst({
    where: { id },
    include: {
      approvedBy: { select: { name: true } },
      payslips: {
        orderBy: { employeeName: "asc" },
        include: {
          lines: { orderBy: { sortdex: "asc" } },
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      },
    },
  });
}

export async function getPayslip(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  const payslip = await db.payslip.findFirst({
    where: { id },
    include: {
      lines: { orderBy: { sortdex: "asc" } },
      run: true,
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          workEmail: true,
          bankName: true,
          employeeCode: true,
          dateOfJoining: true,
        },
      },
    },
  });

  if (!payslip) return null;

  // Own payslip, or org-wide payroll access. No middle ground.
  const isOwn = payslip.employeeId === session.employee?.id;
  if (!isOwn && !can(session, "payroll.read.all")) return null;

  // A payslip that has not been released is not yet a fact about the employee's
  // pay — it is a draft the payroll team is still revising.
  if (isOwn && !payslip.publishedAt) return null;

  return payslip;
}

export async function listMyPayslips(session: AuthContext) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.payslip.findMany({
    where: { employeeId: session.employee.id, publishedAt: { not: null } },
    orderBy: [{ run: { periodYear: "desc" } }, { run: { periodMonth: "desc" } }],
    include: {
      run: { select: { periodMonth: true, periodYear: true, payDate: true } },
      lines: { orderBy: { sortdex: "asc" } },
    },
    take: 36,
  });
}

/** Salary history for one employee — the versioned compensation record. */
export async function getSalaryHistory(session: AuthContext, employeeId: string) {
  const db = orgDb(session.org.id);
  return db.employeeSalary.findMany({
    where: { employeeId },
    orderBy: { effectiveFrom: "desc" },
    include: {
      structure: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
}

export async function getCurrentSalary(session: AuthContext, employeeId: string) {
  const db = orgDb(session.org.id);
  return db.employeeSalary.findFirst({
    where: { employeeId, effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
    include: { structure: { select: { id: true, name: true } } },
  });
}

export async function listSalaryComponents(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.salaryComponent.findMany({ orderBy: { sortdex: "asc" } });
}

export async function listSalaryStructures(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.salaryStructure.findMany({
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    include: {
      components: {
        orderBy: { sortdex: "asc" },
        include: { component: true },
      },
      _count: { select: { salaries: true } },
    },
  });
}

export async function getStatutorySettings(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.statutorySetting.findFirst({ where: { orgId: session.org.id } });
}

export async function listLoans(session: AuthContext, employeeId?: string) {
  const db = orgDb(session.org.id);
  return db.loanAdvance.findMany({
    where: employeeId ? { employeeId } : {},
    orderBy: { createdAt: "desc" },
    include: {
      employee: {
        select: { id: true, firstName: true, lastName: true, employeeCode: true },
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Shapes the engine expects
// ---------------------------------------------------------------------------

/**
 * Converts the stored statutory row into the plain-number config the engine
 * takes. Prisma hands back Decimal objects and untyped Json; the engine should
 * never have to know that.
 */
export function toStatutoryConfig(setting: {
  pfEnabled: boolean;
  pfWageCeiling: unknown;
  pfEmployeeRate: unknown;
  pfEmployerRate: unknown;
  pfCapAtCeiling: boolean;
  esiEnabled: boolean;
  esiWageCeiling: unknown;
  esiEmployeeRate: unknown;
  esiEmployerRate: unknown;
  ptEnabled: boolean;
  ptSlabs: unknown;
  tdsEnabled: boolean;
  standardDeduction: unknown;
  tdsSlabs: unknown;
}): StatutoryConfig {
  return {
    pfEnabled: setting.pfEnabled,
    pfWageCeiling: Number(setting.pfWageCeiling),
    pfEmployeeRate: Number(setting.pfEmployeeRate),
    pfEmployerRate: Number(setting.pfEmployerRate),
    pfCapAtCeiling: setting.pfCapAtCeiling,
    esiEnabled: setting.esiEnabled,
    esiWageCeiling: Number(setting.esiWageCeiling),
    esiEmployeeRate: Number(setting.esiEmployeeRate),
    esiEmployerRate: Number(setting.esiEmployerRate),
    ptEnabled: setting.ptEnabled,
    ptSlabs: asSlabs(setting.ptSlabs),
    tdsEnabled: setting.tdsEnabled,
    standardDeduction: Number(setting.standardDeduction),
    tdsSlabs: asSlabs(setting.tdsSlabs),
  };
}

function asSlabs(value: unknown): Slab[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    .map((row) => ({
      upTo: row.upTo === null || row.upTo === undefined ? null : Number(row.upTo),
      amount: row.amount === undefined ? undefined : Number(row.amount),
      rate: row.rate === undefined ? undefined : Number(row.rate),
    }));
}

export function toEngineComponents(
  rows: {
    value: unknown;
    component: {
      code: string;
      name: string;
      type: string;
      calculation: string;
      defaultValue: unknown;
      isTaxable: boolean;
      isActive: boolean;
    };
    sortdex: number;
  }[],
): EngineComponent[] {
  return rows
    .filter((row) => row.component.isActive)
    .map((row) => ({
      code: row.component.code,
      label: row.component.name,
      type: row.component.type as EngineComponent["type"],
      calculation: row.component.calculation as EngineComponent["calculation"],
      value: Number(row.value ?? row.component.defaultValue),
      isTaxable: row.component.isTaxable,
      sortdex: row.sortdex,
    }));
}

/**
 * Working days in a payroll month, from the organisation's own working-days
 * setting and its holiday calendar — the same definition leave uses, so a day
 * cannot be a working day for leave and a non-working day for pay.
 */
export async function workingDaysInPeriod(
  session: AuthContext,
  year: number,
  month: number,
): Promise<number> {
  const db = orgDb(session.org.id);
  const start = startOfMonth(new Date(Date.UTC(year, month - 1, 1)));
  const end = endOfMonth(start);

  const holidays = await db.holiday.findMany({
    where: { date: { gte: start, lte: end }, isOptional: false },
    select: { date: true },
  });

  return countWorkingDays(
    start,
    end,
    session.org.workingDays,
    holidays.map((h) => h.date),
  );
}

/**
 * Unpaid days for one employee in the period: approved leave on an unpaid type,
 * plus days marked absent with no leave behind them.
 */
export async function lossOfPayDays(
  session: AuthContext,
  employeeId: string,
  year: number,
  month: number,
): Promise<number> {
  const db = orgDb(session.org.id);
  const start = startOfMonth(new Date(Date.UTC(year, month - 1, 1)));
  const end = endOfMonth(start);

  const [unpaidLeave, absences] = await Promise.all([
    db.leaveRequest.findMany({
      where: {
        employeeId,
        status: "APPROVED",
        leaveType: { isPaid: false },
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: { days: true },
    }),
    db.attendanceRecord.count({
      where: {
        employeeId,
        date: { gte: start, lte: end },
        status: "ABSENT",
      },
    }),
  ]);

  const unpaidDays = unpaidLeave.reduce(
    (total, row) => total + Number(row.days),
    0,
  );

  return unpaidDays + absences;
}
