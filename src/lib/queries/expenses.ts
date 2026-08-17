import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { resolveEmployeeScope } from "../scope";

/**
 * Expense reads (PRD §8.16).
 *
 * Scoping follows the same self/team/all family as leave, through the shared
 * resolver — so "my manager can see my claims but not the whole company's" is
 * one definition applied everywhere rather than a rule re-implemented per
 * module.
 */

export interface ClaimFilters {
  status?: string;
  employeeId?: string;
}

const CLAIM_INCLUDE = {
  employee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      employeeCode: true,
      department: { select: { name: true } },
    },
  },
  approver: { select: { firstName: true, lastName: true } },
  items: {
    orderBy: { spentOn: "asc" as const },
    include: { category: { select: { id: true, name: true } } },
  },
} as const;

/**
 * Claims the caller may read.
 *
 * Returns null — not an empty list — when they hold none of the read
 * permissions, so a page can tell "nothing to show" apart from "you shouldn't
 * be here".
 */
export async function listClaims(
  session: AuthContext,
  filters: ClaimFilters = {},
) {
  const db = orgDb(session.org.id);
  const scope = await resolveEmployeeScope(session, "expense.read");
  if (!scope) return null;

  return db.expenseClaim.findMany({
    where: {
      ...(scope.scope === "all"
        ? {}
        : { employeeId: { in: scope.employeeIds ?? [] } }),
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.status && filters.status !== "all"
        ? { status: filters.status as "SUBMITTED" }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: CLAIM_INCLUDE,
  });
}

/** The approver's queue: submitted claims that are not the approver's own. */
export async function pendingClaims(session: AuthContext) {
  const db = orgDb(session.org.id);

  const orgWide = can(session, "expense.approve.all");
  if (!orgWide && !can(session, "expense.approve.team")) return [];

  const scope = await resolveEmployeeScope(session, "expense.approve");

  return db.expenseClaim.findMany({
    where: {
      status: "SUBMITTED",
      ...(orgWide || scope?.scope === "all"
        ? {}
        : { employeeId: { in: scope?.employeeIds ?? [] } }),
      // Nobody approves their own spending.
      ...(session.employee ? { NOT: { employeeId: session.employee.id } } : {}),
    },
    orderBy: { submittedAt: "asc" },
    include: CLAIM_INCLUDE,
  });
}

export async function getClaim(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  const claim = await db.expenseClaim.findFirst({
    where: { id },
    include: CLAIM_INCLUDE,
  });
  if (!claim) return null;

  // Your own claim is always readable. Anyone else's needs a read or approve
  // permission that reaches them.
  if (claim.employeeId === session.employee?.id) return claim;

  const readScope = await resolveEmployeeScope(session, "expense.read");
  const approveScope = await resolveEmployeeScope(session, "expense.approve");

  const reachable = [readScope, approveScope].some(
    (scope) =>
      scope &&
      (scope.scope === "all" ||
        (scope.employeeIds ?? []).includes(claim.employeeId)),
  );

  return reachable ? claim : null;
}

export async function getMyClaims(session: AuthContext, take?: number) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.expenseClaim.findMany({
    where: { employeeId: session.employee.id },
    orderBy: { createdAt: "desc" },
    ...(take ? { take } : {}),
    include: {
      items: { include: { category: { select: { name: true } } } },
      approver: { select: { firstName: true, lastName: true } },
    },
  });
}

export async function listExpenseCategories(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.expenseCategory.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { items: true } } },
  });
}

/**
 * Headline figures for the expenses screen.
 *
 * "Awaiting reimbursement" is money the company already owes, which is a
 * different and more urgent number than "awaiting approval" — so they are never
 * added together into a single misleading total.
 */
export async function expenseSummary(session: AuthContext) {
  const db = orgDb(session.org.id);
  const scope = await resolveEmployeeScope(session, "expense.read");

  const where =
    scope && scope.scope !== "all"
      ? { employeeId: { in: scope.employeeIds ?? [] } }
      : {};

  const grouped = await db.expenseClaim.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
    _sum: { totalAmount: true },
  });

  const find = (status: string) => grouped.find((g) => g.status === status);

  const reimbursedThisYear = await db.expenseClaim.aggregate({
    where: {
      ...where,
      status: "REIMBURSED",
      reimbursedAt: { gte: new Date(new Date().getFullYear(), 0, 1) },
    },
    _sum: { totalAmount: true },
  });

  return {
    awaitingApproval: {
      count: find("SUBMITTED")?._count._all ?? 0,
      amount: Number(find("SUBMITTED")?._sum.totalAmount ?? 0),
    },
    awaitingPayment: {
      count: find("APPROVED")?._count._all ?? 0,
      amount: Number(find("APPROVED")?._sum.totalAmount ?? 0),
    },
    reimbursedYtd: Number(reimbursedThisYear._sum.totalAmount ?? 0),
    rejected: find("REJECTED")?._count._all ?? 0,
  };
}
