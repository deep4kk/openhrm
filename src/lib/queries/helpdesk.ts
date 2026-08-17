import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can, canAny } from "../auth";

/**
 * Helpdesk reads (PRD §8.19).
 *
 * Two audiences, one dataset. An employee sees the tickets they raised; the HR
 * queue sees everything, plus internal comments the requester never gets. The
 * split is enforced here rather than in the page, so an internal note cannot
 * leak by someone forgetting a filter on a new screen.
 */

export interface TicketFilters {
  status?: string;
  categoryId?: string;
  assigneeId?: string;
  q?: string;
}

/** Open, in-progress and waiting all count as "live" for the queue view. */
export const LIVE_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING"] as const;

export async function listTickets(
  session: AuthContext,
  filters: TicketFilters = {},
) {
  const db = orgDb(session.org.id);
  const orgWide = canAny(session, "ticket.read.all", "ticket.manage");

  if (!orgWide && !session.employee) return [];

  return db.ticket.findMany({
    where: {
      ...(orgWide ? {} : { requesterId: session.employee!.id }),
      ...(filters.status === "live"
        ? { status: { in: [...LIVE_STATUSES] } }
        : filters.status && filters.status !== "all"
          ? { status: filters.status as "OPEN" }
          : {}),
      ...(filters.categoryId && filters.categoryId !== "all"
        ? { categoryId: filters.categoryId }
        : {}),
      ...(filters.assigneeId === "mine" && session.employee
        ? { assigneeId: session.employee.id }
        : filters.assigneeId === "unassigned"
          ? { assigneeId: null }
          : {}),
      ...(filters.q
        ? {
            OR: [
              { subject: { contains: filters.q, mode: "insensitive" as const } },
              { body: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      category: { select: { id: true, name: true, slaHours: true } },
      requester: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
        },
      },
      assignee: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
      _count: { select: { comments: true } },
    },
  });
}

export async function getTicket(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  const worksQueue = canAny(session, "ticket.read.all", "ticket.manage");

  const ticket = await db.ticket.findFirst({
    where: { id },
    include: {
      category: true,
      requester: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
          workEmail: true,
          department: { select: { name: true } },
        },
      },
      assignee: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
      comments: {
        // Internal notes are filtered in the query, not hidden in the markup.
        where: worksQueue ? {} : { isInternal: false },
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });

  if (!ticket) return null;
  if (!worksQueue && ticket.requesterId !== session.employee?.id) return null;

  return ticket;
}

export async function listTicketCategories(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.ticketCategory.findMany({
    orderBy: { name: "asc" },
    include: {
      defaultAssignee: { select: { id: true, firstName: true, lastName: true } },
      _count: { select: { tickets: true } },
    },
  });
}

export async function getMyTickets(session: AuthContext, take?: number) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.ticket.findMany({
    where: { requesterId: session.employee.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    ...(take ? { take } : {}),
    include: {
      category: { select: { name: true } },
      assignee: { select: { firstName: true, lastName: true } },
    },
  });
}

/**
 * Queue health.
 *
 * "Breaching" counts live tickets already past their SLA date. It is separated
 * from "due soon" because they call for different actions — one is an apology,
 * the other is a nudge — and rolling them together produces a number that
 * means neither.
 */
export async function helpdeskSummary(session: AuthContext) {
  const db = orgDb(session.org.id);
  if (!canAny(session, "ticket.read.all", "ticket.manage")) return null;

  const now = new Date();
  const soon = new Date(now.getTime() + 8 * 3_600_000);

  const [open, unassigned, breaching, dueSoon, resolvedThisMonth] =
    await Promise.all([
      db.ticket.count({ where: { status: { in: [...LIVE_STATUSES] } } }),
      db.ticket.count({
        where: { status: { in: [...LIVE_STATUSES] }, assigneeId: null },
      }),
      db.ticket.count({
        where: { status: { in: [...LIVE_STATUSES] }, dueAt: { lt: now } },
      }),
      db.ticket.count({
        where: {
          status: { in: [...LIVE_STATUSES] },
          dueAt: { gte: now, lt: soon },
        },
      }),
      db.ticket.count({
        where: {
          resolvedAt: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
        },
      }),
    ]);

  return { open, unassigned, breaching, dueSoon, resolvedThisMonth };
}

/** Who can be handed a ticket: anyone whose role can work the queue. */
export async function queueOwners(session: AuthContext) {
  const db = orgDb(session.org.id);
  if (!can(session, "ticket.manage")) return [];

  const roles = await db.role.findMany({
    where: { permissions: { has: "ticket.manage" } },
    select: { id: true },
  });

  const users = await db.user.findMany({
    where: { roleId: { in: roles.map((r) => r.id) }, status: "ACTIVE" },
    select: {
      employee: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  return users
    .map((u) => u.employee)
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
}
