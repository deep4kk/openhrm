import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { today } from "../dates";

/**
 * Onboarding and offboarding reads (PRD §8.4).
 *
 * A "journey" is one employee running through one checklist. The word is
 * deliberate: HR says "where is Priya's onboarding up to?", never "show me
 * checklist instance 3". The model is called ChecklistInstance because that is
 * what it is; the UI says journey because that is what it means.
 *
 * Tasks are materialised at start time rather than joined from the template on
 * read. A template edited in March must not silently rewrite the checklist a
 * person completed in January — and a task needs its own assignee, due date and
 * completion note, which a template row cannot carry.
 */

export interface JourneyProgress {
  total: number;
  done: number;
  overdue: number;
  percent: number;
}

export function progressOf(
  tasks: { status: string; dueDate: Date | null }[],
): JourneyProgress {
  const total = tasks.length;
  const done = tasks.filter(
    (t) => t.status === "DONE" || t.status === "SKIPPED",
  ).length;
  const now = today();
  const overdue = tasks.filter(
    (t) => t.status === "PENDING" && t.dueDate && t.dueDate < now,
  ).length;

  return {
    total,
    done,
    overdue,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/**
 * Every journey the caller may see.
 *
 * `journey.read.all` sees the organisation. Everyone else sees their own, which
 * is what makes the same screen usable by a new joiner tracking their own
 * onboarding — no separate route, no duplicated markup.
 */
export async function listJourneys(
  session: AuthContext,
  filter: { kind?: "ONBOARDING" | "OFFBOARDING"; includeFinished?: boolean } = {},
) {
  const db = orgDb(session.org.id);
  const orgWide = can(session, "journey.read.all") || can(session, "journey.manage");

  if (!orgWide && !session.employee) return [];

  return db.checklistInstance.findMany({
    where: {
      ...(orgWide ? {} : { employeeId: session.employee!.id }),
      ...(filter.kind ? { kind: filter.kind } : {}),
      ...(filter.includeFinished
        ? {}
        : { status: { in: ["NOT_STARTED", "IN_PROGRESS"] } }),
    },
    orderBy: [{ status: "asc" }, { anchorDate: "desc" }],
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          avatarUrl: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
        },
      },
      tasks: { select: { status: true, dueDate: true } },
    },
  });
}

export async function getJourney(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  const journey = await db.checklistInstance.findFirst({
    where: { id },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          employeeCode: true,
          workEmail: true,
          avatarUrl: true,
          dateOfJoining: true,
          dateOfExit: true,
          managerId: true,
          designation: { select: { title: true } },
          department: { select: { name: true } },
        },
      },
      tasks: {
        orderBy: [{ sortdex: "asc" }],
        include: {
          assignee: {
            select: { id: true, firstName: true, lastName: true, avatarUrl: true },
          },
        },
      },
    },
  });

  if (!journey) return null;

  // Someone with only `journey.read.self` may open their own journey and no
  // one else's. Checked here rather than in the page so every caller inherits
  // it — including a future API route.
  const orgWide = can(session, "journey.read.all") || can(session, "journey.manage");
  if (!orgWide && journey.employeeId !== session.employee?.id) return null;

  return journey;
}

/** Checklist tasks assigned to the signed-in employee, across all journeys. */
export async function getMyTasks(session: AuthContext, take = 12) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.checklistTask.findMany({
    where: { assigneeId: session.employee.id, status: "PENDING" },
    orderBy: [{ dueDate: "asc" }],
    take,
    include: {
      instance: {
        select: {
          id: true,
          name: true,
          kind: true,
          employee: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });
}

export async function listChecklistTemplates(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.checklistTemplate.findMany({
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: {
      items: { orderBy: { sortdex: "asc" } },
      _count: { select: { instances: true } },
    },
  });
}

/**
 * People who could sensibly start a journey: everyone without an open one of
 * that kind. Offering to onboard someone who is already halfway through their
 * onboarding is how you end up with two checklists and no idea which is live.
 */
export async function candidatesForJourney(
  session: AuthContext,
  kind: "ONBOARDING" | "OFFBOARDING",
) {
  const db = orgDb(session.org.id);

  const busy = await db.checklistInstance.findMany({
    where: { kind, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } },
    select: { employeeId: true },
  });
  const busyIds = new Set(busy.map((b) => b.employeeId));

  const employees = await db.employee.findMany({
    where:
      kind === "ONBOARDING"
        ? { status: { in: ["ACTIVE", "INVITED"] } }
        : { status: { in: ["ACTIVE", "NOTICE_PERIOD"] } },
    orderBy: [{ dateOfJoining: "desc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      dateOfJoining: true,
      dateOfExit: true,
      designation: { select: { title: true } },
    },
  });

  return employees.filter((e) => !busyIds.has(e.id));
}
