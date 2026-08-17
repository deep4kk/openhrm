import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { resolveEmployeeScope } from "../scope";
import { today } from "../dates";

/**
 * Performance reads (PRD §8.9).
 *
 * Goals and reviews are two different shapes of the same question, so they are
 * scoped the same way: `goal.read` and `review.read` both resolve through the
 * shared self/team/all resolver. A manager sees their reporting line; HR sees
 * the organisation; everyone sees themselves.
 *
 * One rule this module enforces that the others don't: `privateNotes` on a
 * review are stripped for anyone who is not the reviewer or an HR reader. The
 * field exists precisely so a manager can write something the employee should
 * not read, and a page that forgot to omit it would be a serious disclosure —
 * so it is omitted here, once, for every caller.
 */

export async function listGoals(
  session: AuthContext,
  filters: { status?: string; level?: string; cycleId?: string } = {},
) {
  const db = orgDb(session.org.id);
  const scope = await resolveEmployeeScope(session, "goal.read");
  if (!scope) return [];

  return db.goal.findMany({
    where: {
      // Company and department goals are everyone's business; individual goals
      // follow the reporting line.
      ...(scope.scope === "all"
        ? {}
        : {
            OR: [
              { level: { in: ["COMPANY", "DEPARTMENT"] } },
              { ownerId: { in: scope.employeeIds ?? [] } },
            ],
          }),
      ...(filters.status && filters.status !== "all"
        ? filters.status === "live"
          ? { status: { in: ["ACTIVE", "AT_RISK"] } }
          : { status: filters.status as "ACTIVE" }
        : {}),
      ...(filters.level && filters.level !== "all"
        ? { level: filters.level as "COMPANY" }
        : {}),
      ...(filters.cycleId ? { cycleId: filters.cycleId } : {}),
    },
    orderBy: [{ level: "asc" }, { dueDate: "asc" }],
    include: {
      owner: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
        },
      },
      department: { select: { id: true, name: true } },
      parent: { select: { id: true, title: true } },
      children: { select: { id: true, progress: true, status: true } },
    },
  });
}

export async function getGoal(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  return db.goal.findFirst({
    where: { id },
    include: {
      owner: { select: { id: true, firstName: true, lastName: true } },
      department: { select: { name: true } },
      parent: { select: { id: true, title: true } },
      children: {
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });
}

export async function listReviewCycles(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.reviewCycle.findMany({
    orderBy: { periodEnd: "desc" },
    include: {
      reviews: { select: { status: true, kind: true } },
      _count: { select: { goals: true } },
    },
  });
}

export async function getReviewCycle(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  const orgWide = can(session, "review.read.all") || can(session, "review.cycle.manage");

  const cycle = await db.reviewCycle.findFirst({
    where: { id },
    include: {
      reviews: {
        orderBy: [{ kind: "asc" }],
        include: {
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
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!cycle) return null;

  // Reviews the caller may not read are dropped from the payload rather than
  // hidden in the markup.
  if (!orgWide) {
    const scope = await resolveEmployeeScope(session, "review.read");
    const reachable = new Set(scope?.employeeIds ?? []);
    const self = session.employee?.id;

    cycle.reviews = cycle.reviews.filter(
      (review) =>
        review.employeeId === self ||
        review.reviewerId === self ||
        (scope?.scope === "all") ||
        reachable.has(review.employeeId),
    );
  }

  return cycle;
}

/**
 * One review, with private notes stripped unless the reader is entitled to
 * them. Returns null rather than a partial object when the reader has no
 * business seeing it at all.
 */
export async function getReview(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  const review = await db.performanceReview.findFirst({
    where: { id },
    include: {
      cycle: true,
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
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!review) return null;

  const self = session.employee?.id;
  const isSubject = review.employeeId === self;
  const isReviewer = review.reviewerId === self;
  const orgWide = can(session, "review.read.all");
  const teamRead =
    can(session, "review.read.team") &&
    (await resolveEmployeeScope(session, "review.read"))?.employeeIds?.includes(
      review.employeeId,
    );

  if (!isSubject && !isReviewer && !orgWide && !teamRead) return null;

  // The subject never sees private notes, whatever else they hold.
  const mayReadPrivate = !isSubject && (isReviewer || orgWide || Boolean(teamRead));

  return {
    ...review,
    privateNotes: mayReadPrivate ? review.privateNotes : null,
    canReadPrivate: mayReadPrivate,
    isSubject,
    isReviewer,
  };
}

/** Reviews the signed-in employee still owes — theirs and their reports'. */
export async function myPendingReviews(session: AuthContext) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.performanceReview.findMany({
    where: {
      status: "PENDING",
      OR: [
        { reviewerId: session.employee.id },
        // A self-review has no reviewer — the subject is the author.
        { kind: "SELF", employeeId: session.employee.id },
      ],
      cycle: { status: { in: ["SELF_REVIEW", "MANAGER_REVIEW", "CALIBRATION"] } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      cycle: { select: { id: true, name: true, selfReviewDueOn: true, managerReviewDueOn: true } },
      employee: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });
}

export async function listOneOnOnes(
  session: AuthContext,
  employeeId?: string,
  take = 20,
) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.oneOnOne.findMany({
    where: {
      // A 1:1 is between two people and is readable by exactly those two.
      OR: [
        { managerId: session.employee.id },
        { employeeId: session.employee.id },
      ],
      ...(employeeId ? { employeeId } : {}),
    },
    orderBy: { scheduledAt: "desc" },
    take,
    include: {
      manager: { select: { id: true, firstName: true, lastName: true } },
      employee: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
    },
  });
}

/**
 * Performance headlines.
 *
 * "At risk" counts goals the owner has flagged plus goals that are past due and
 * unfinished — a goal nobody updated is exactly as missed as one somebody
 * admitted to, and only counting the honest ones would flatter the number.
 */
export async function performanceSummary(session: AuthContext) {
  const db = orgDb(session.org.id);
  const scope = await resolveEmployeeScope(session, "goal.read");
  if (!scope) return null;

  const where =
    scope.scope === "all"
      ? {}
      : {
          OR: [
            { level: { in: ["COMPANY" as const, "DEPARTMENT" as const] } },
            { ownerId: { in: scope.employeeIds ?? [] } },
          ],
        };

  const now = today();
  const goals = await db.goal.findMany({
    where,
    select: { status: true, progress: true, dueDate: true },
  });

  const live = goals.filter(
    (g) => g.status === "ACTIVE" || g.status === "AT_RISK",
  );

  const atRisk = live.filter(
    (g) => g.status === "AT_RISK" || g.dueDate < now,
  ).length;

  const activeCycle = await db.reviewCycle.findFirst({
    where: { status: { in: ["SELF_REVIEW", "MANAGER_REVIEW", "CALIBRATION"] } },
    include: { reviews: { select: { status: true } } },
  });

  return {
    liveGoals: live.length,
    atRisk,
    achieved: goals.filter((g) => g.status === "ACHIEVED").length,
    averageProgress:
      live.length === 0
        ? 0
        : Math.round(
            live.reduce((sum, g) => sum + g.progress, 0) / live.length,
          ),
    activeCycle: activeCycle
      ? {
          id: activeCycle.id,
          name: activeCycle.name,
          status: activeCycle.status,
          total: activeCycle.reviews.length,
          submitted: activeCycle.reviews.filter((r) => r.status === "SUBMITTED")
            .length,
        }
      : null,
  };
}
