import "server-only";

import { rawDb, type OrgClient } from "./db";
import type { AuthContext } from "./auth";
import { resolveScope, type Scope } from "./permissions";

/**
 * Turning a permission scope into an actual set of employees.
 *
 * A permission like `leave.read.team` is meaningless until we know *which*
 * employees count as "team". This module answers that once, so every module
 * (attendance, leave, reports) applies the same definition rather than each
 * inventing its own.
 *
 * "Team" means the whole reporting subtree, not just direct reports — a head of
 * engineering approving leave expects to see their skip-level reports too.
 */

export interface EmployeeScope {
  scope: Scope;
  /**
   * Employee ids the caller may act on. Undefined when scope is "all", which
   * means "no id filter" — materialising every id for a 5,000-person org would
   * be wasteful and would fight the database's own indexes.
   */
  employeeIds?: string[];
}

/**
 * Resolves what the caller can reach for a permission family such as
 * "leave.read", "attendance.read" or "employee.read".
 *
 * Returns null when the caller holds none of the family — callers must treat
 * that as a refusal rather than as "empty result".
 */
export async function resolveEmployeeScope(
  session: AuthContext,
  base: string,
): Promise<EmployeeScope | null> {
  const scope = resolveScope(session.role.permissions, base);
  if (!scope) return null;

  if (scope === "all") {
    return { scope };
  }

  if (!session.employee) {
    // An admin account with no employee record has nothing that is "theirs".
    return { scope, employeeIds: [] };
  }

  if (scope === "self") {
    return { scope, employeeIds: [session.employee.id] };
  }

  const team = await getReportingSubtree(session.org.id, session.employee.id);
  return { scope, employeeIds: [session.employee.id, ...team] };
}

/**
 * Every employee below `managerId` in the reporting tree.
 *
 * A recursive CTE rather than repeated queries: one round trip regardless of
 * depth, and Postgres stops on cycles because we track visited ids. The orgId
 * predicate is written explicitly because raw SQL bypasses the Prisma tenant
 * extension — this is one of the few places that matters.
 */
export async function getReportingSubtree(
  orgId: string,
  managerId: string,
): Promise<string[]> {
  const rows = await rawDb.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE subtree AS (
      SELECT e."id", 1 AS depth
      FROM "employees" e
      WHERE e."managerId" = ${managerId}
        AND e."orgId" = ${orgId}

      UNION

      SELECT e."id", s.depth + 1
      FROM "employees" e
      JOIN subtree s ON e."managerId" = s.id
      WHERE e."orgId" = ${orgId}
        AND s.depth < 20
    )
    SELECT DISTINCT id FROM subtree
  `;

  return rows.map((r) => r.id);
}

/** Direct reports only — used for team rosters and manager dashboards. */
export async function getDirectReports(db: OrgClient, managerId: string) {
  return db.employee.findMany({
    where: { managerId, status: { not: "EXITED" } },
    orderBy: [{ firstName: "asc" }],
    include: {
      designation: true,
      department: true,
    },
  });
}

/**
 * Converts a scope into a Prisma `where` fragment for the employee id column.
 * Returns `{}` for org-wide access so no redundant filter is applied.
 */
export function employeeIdFilter(scope: EmployeeScope) {
  if (scope.scope === "all") return {};
  return { employeeId: { in: scope.employeeIds ?? [] } };
}

/** Same, for queries where the column is the employee's own `id`. */
export function employeeSelfFilter(scope: EmployeeScope) {
  if (scope.scope === "all") return {};
  return { id: { in: scope.employeeIds ?? [] } };
}

/**
 * Can this session act on this specific employee?
 * Used before rendering a profile or accepting an edit.
 */
export async function canReachEmployee(
  session: AuthContext,
  base: string,
  employeeId: string,
): Promise<boolean> {
  const scope = await resolveEmployeeScope(session, base);
  if (!scope) return false;
  if (scope.scope === "all") return true;
  return (scope.employeeIds ?? []).includes(employeeId);
}
