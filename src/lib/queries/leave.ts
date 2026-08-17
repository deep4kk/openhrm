import "server-only";

import { cache } from "react";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { resolveEmployeeScope, employeeIdFilter } from "../scope";
import {
  countWorkingDays,
  leaveYearOf,
  leaveYearBounds,
  monthsElapsedInLeaveYear,
  toDateOnly,
} from "../dates";

/**
 * Leave reads and the balance arithmetic behind them.
 *
 * The one rule that keeps this honest: a balance is never stored as a single
 * "remaining" number that something increments. It is derived from named parts —
 * opening + carried-forward + accrued + adjustments − used − pending — each of
 * which has a matching row in the ledger. When an employee asks "why is my
 * balance 7.5 and not 9?", the answer is a list of entries, not a shrug.
 */

export interface LeaveBalanceView {
  leaveTypeId: string;
  name: string;
  code: string;
  colorToken: string;
  isPaid: boolean;
  allowHalfDay: boolean;
  minNoticeDays: number;
  /** Everything credited this year. */
  entitled: number;
  used: number;
  /** Reserved by requests awaiting a decision. */
  pending: number;
  available: number;
}

function decimal(value: unknown): number {
  return Number(value ?? 0);
}

export async function getLeaveBalances(
  session: AuthContext,
  employeeId: string,
  year?: number,
): Promise<LeaveBalanceView[]> {
  const db = orgDb(session.org.id);
  const leaveYear =
    year ?? leaveYearOf(new Date(), session.org.fiscalYearStartMonth);

  const [types, balances, employee] = await Promise.all([
    db.leaveType.findMany({
      where: { isActive: true },
      orderBy: { sortdex: "asc" },
    }),
    db.leaveBalance.findMany({
      where: { employeeId, year: leaveYear },
    }),
    db.employee.findFirst({
      where: { id: employeeId },
      select: { gender: true },
    }),
  ]);

  const byType = new Map(balances.map((b) => [b.leaveTypeId, b]));

  return types
    .filter(
      (type) =>
        !type.applicableGender || type.applicableGender === employee?.gender,
    )
    .map((type) => {
      const balance = byType.get(type.id);

      // No row yet (employee added mid-year, or a new leave type) — show what
      // they would have accrued rather than a misleading zero.
      const accrued = balance
        ? decimal(balance.accrued)
        : projectedAccrual(type, session.org.fiscalYearStartMonth);

      const entitled =
        (balance ? decimal(balance.openingBalance) : decimal(type.openingBalance)) +
        accrued +
        (balance ? decimal(balance.carriedForward) : 0) +
        (balance ? decimal(balance.adjusted) : 0);

      const used = balance ? decimal(balance.used) : 0;
      const pending = balance ? decimal(balance.pending) : 0;

      return {
        leaveTypeId: type.id,
        name: type.name,
        code: type.code,
        colorToken: type.colorToken,
        isPaid: type.isPaid,
        allowHalfDay: type.allowHalfDay,
        minNoticeDays: type.minNoticeDays,
        entitled: round(entitled),
        used: round(used),
        pending: round(pending),
        available: round(entitled - used - pending),
      };
    });
}

function projectedAccrual(
  type: { accrualFrequency: string; accrualAmount: unknown },
  fiscalStart: number,
): number {
  if (type.accrualFrequency !== "MONTHLY") return 0;
  return decimal(type.accrualAmount) * monthsElapsedInLeaveYear(new Date(), fiscalStart);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function getMyLeaveRequests(
  session: AuthContext,
  employeeId: string,
  take = 25,
) {
  const db = orgDb(session.org.id);
  return db.leaveRequest.findMany({
    where: { employeeId },
    include: {
      leaveType: { select: { name: true, code: true, colorToken: true } },
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ startDate: "desc" }],
    take,
  });
}

/**
 * Requests the caller is entitled to decide.
 *
 * `leave.approve.all` sees everything pending; `leave.approve.team` sees only
 * their reporting subtree. A manager never sees, let alone decides, a peer's
 * request.
 *
 * Wrapped in React's `cache` because the dashboard needs this count in two
 * places that stream independently — the header button and the stat tile — and
 * they must not become two queries. The key is the `session` object's identity,
 * which is stable within a request because getSession() is itself cached.
 */
export const getPendingApprovals = cache(async function getPendingApprovals(
  session: AuthContext,
) {
  const db = orgDb(session.org.id);

  const scope = await resolveEmployeeScope(session, "leave.approve");
  if (!scope) return [];

  return db.leaveRequest.findMany({
    where: {
      status: "PENDING",
      ...(scope.scope === "all"
        ? {}
        : {
            employeeId: {
              in: (scope.employeeIds ?? []).filter(
                // A manager doesn't approve their own leave.
                (id) => id !== session.employee?.id,
              ),
            },
          }),
    },
    include: {
      leaveType: { select: { name: true, code: true, colorToken: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
          designation: { select: { title: true } },
        },
      },
    },
    orderBy: [{ startDate: "asc" }],
  });
});

/** Everything in the caller's read scope — the org-wide leave register. */
export async function listLeaveRequests(
  session: AuthContext,
  filters: { status?: string; leaveTypeId?: string; take?: number } = {},
) {
  const db = orgDb(session.org.id);

  const scope = await resolveEmployeeScope(session, "leave.read");
  if (!scope) return [];

  return db.leaveRequest.findMany({
    where: {
      ...employeeIdFilter(scope),
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.leaveTypeId ? { leaveTypeId: filters.leaveTypeId } : {}),
    },
    include: {
      leaveType: { select: { name: true, code: true, colorToken: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          department: { select: { name: true } },
        },
      },
      approver: { select: { firstName: true, lastName: true } },
    },
    orderBy: [{ createdAt: "desc" }],
    take: filters.take ?? 50,
  });
}

/**
 * Who is away today — used on the dashboard and the team calendar.
 *
 * Cached for the same reason as getPendingApprovals: the dashboard reads it
 * from two streaming sections. Callers that pass an explicit `on` date get
 * their own cache entry, which is correct — a different day is a different
 * question.
 */
export const getWhoIsOut = cache(async function getWhoIsOut(
  session: AuthContext,
  on = new Date(),
) {
  const db = orgDb(session.org.id);
  const date = toDateOnly(on);

  return db.leaveRequest.findMany({
    where: {
      status: "APPROVED",
      startDate: { lte: date },
      endDate: { gte: date },
    },
    include: {
      leaveType: { select: { name: true, colorToken: true } },
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          department: { select: { name: true } },
        },
      },
    },
    orderBy: [{ endDate: "asc" }],
  });
});

/** Approved leave overlapping a window, for the team calendar. */
export async function getLeaveInRange(
  session: AuthContext,
  start: Date,
  end: Date,
) {
  const db = orgDb(session.org.id);
  const scope = await resolveEmployeeScope(session, "leave.read");
  if (!scope) return [];

  return db.leaveRequest.findMany({
    where: {
      ...employeeIdFilter(scope),
      status: { in: ["APPROVED", "PENDING"] },
      startDate: { lte: toDateOnly(end) },
      endDate: { gte: toDateOnly(start) },
    },
    include: {
      leaveType: { select: { name: true, colorToken: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
}

export async function getLeaveTypes(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.leaveType.findMany({
    where: { isActive: true },
    orderBy: { sortdex: "asc" },
  });
}

export async function getHolidays(session: AuthContext, year?: number) {
  const db = orgDb(session.org.id);
  const targetYear = year ?? new Date().getUTCFullYear();

  return db.holiday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(targetYear, 0, 1)),
        lte: new Date(Date.UTC(targetYear, 11, 31)),
      },
    },
    include: { location: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
}

/**
 * How many working days a request actually costs.
 *
 * Weekends (per the org's configured working days) and holidays are excluded
 * unless the leave type explicitly counts them. Half days are always 0.5 and
 * only valid on a single day.
 */
export async function computeLeaveDays(
  session: AuthContext,
  input: {
    startDate: Date;
    endDate: Date;
    isHalfDay: boolean;
    countsHolidays: boolean;
  },
): Promise<number> {
  if (input.isHalfDay) return 0.5;

  const db = orgDb(session.org.id);

  if (input.countsHolidays) {
    const days = Math.round(
      (toDateOnly(input.endDate).getTime() -
        toDateOnly(input.startDate).getTime()) /
        86_400_000,
    );
    return days + 1;
  }

  const holidays = await db.holiday.findMany({
    where: {
      isOptional: false,
      date: {
        gte: toDateOnly(input.startDate),
        lte: toDateOnly(input.endDate),
      },
    },
    select: { date: true },
  });

  return countWorkingDays(
    input.startDate,
    input.endDate,
    session.org.workingDays,
    holidays.map((h) => h.date),
  );
}

/** The ledger for one employee and leave type — the "why is my balance X" view. */
export async function getLeaveLedger(
  session: AuthContext,
  employeeId: string,
  leaveTypeId?: string,
  year?: number,
) {
  const db = orgDb(session.org.id);
  const leaveYear =
    year ?? leaveYearOf(new Date(), session.org.fiscalYearStartMonth);

  return db.leaveLedgerEntry.findMany({
    where: {
      employeeId,
      year: leaveYear,
      ...(leaveTypeId ? { leaveTypeId } : {}),
    },
    include: { leaveType: { select: { name: true, code: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export function currentLeaveYear(session: AuthContext) {
  const year = leaveYearOf(new Date(), session.org.fiscalYearStartMonth);
  return { year, ...leaveYearBounds(year, session.org.fiscalYearStartMonth) };
}
