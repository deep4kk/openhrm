"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, canAny, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { emitWebhook, notifyChat } from "../webhooks";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * HR helpdesk (PRD §8.19).
 *
 * Two things here are worth more than they look:
 *
 *  1. Ticket numbers come from a per-organisation counter incremented inside
 *     the same transaction that creates the ticket. An employee quoting "#42"
 *     to HR should mean the forty-second ticket *this company* raised, and two
 *     people pressing submit at the same moment must not both get #42.
 *
 *  2. The SLA due date is stamped at creation from the category's target, and
 *     never recomputed. Re-reading the category later would silently move every
 *     historical deadline whenever someone edits the queue's SLA.
 */

const raiseSchema = z.object({
  categoryId: z.string().optional(),
  subject: z.string().trim().min(5, "Summarise it in a line").max(160),
  body: z
    .string()
    .trim()
    .min(10, "A sentence or two helps HR answer without asking first")
    .max(4000),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
});

export async function raiseTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "ticket.raise");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const parsed = raiseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const category = input.categoryId
    ? await db.ticketCategory.findFirst({
        where: { id: input.categoryId, isActive: true },
      })
    : null;

  const ticket = await rawDb.$transaction(async (tx) => {
    const org = await tx.organization.update({
      where: { id: session.org.id },
      data: { ticketSequence: { increment: 1 } },
      select: { ticketSequence: true },
    });

    return tx.ticket.create({
      data: {
        orgId: session.org.id,
        number: org.ticketSequence,
        categoryId: category?.id ?? null,
        requesterId: session.employee!.id,
        subject: input.subject,
        body: input.body,
        priority: input.priority ?? "NORMAL",
        assigneeId: category?.defaultAssigneeId ?? null,
        dueAt: category
          ? new Date(Date.now() + category.slaHours * 3_600_000)
          : null,
      },
    });
  });

  await audit(session, {
    action: "ticket.raised",
    entityType: "Ticket",
    entityId: ticket.id,
    summary: `Raised #${ticket.number}: ${input.subject}`,
  });

  await notifyQueue(session, ticket.id, {
    number: ticket.number,
    subject: input.subject,
    assigneeId: ticket.assigneeId,
    who: `${session.employee.firstName} ${session.employee.lastName}`,
  });

  await emitWebhook(session.org.id, "ticket.raised", {
    ticketId: ticket.id,
    number: ticket.number,
    subject: input.subject,
    category: category?.name ?? null,
  });

  revalidatePath("/helpdesk");
  revalidatePath("/me");
  redirect(`/helpdesk/${ticket.id}`);
}

async function notifyQueue(
  session: Awaited<ReturnType<typeof requireAuth>>,
  ticketId: string,
  input: {
    number: number;
    subject: string;
    assigneeId: string | null;
    who: string;
  },
) {
  const db = orgDb(session.org.id);
  const recipients = new Set<string>();

  if (input.assigneeId) {
    const userId = await userIdForEmployee(input.assigneeId);
    if (userId) recipients.add(userId);
  }

  // Unqueued tickets go to everyone who can work the queue, so nothing sits
  // unread because it happened to land in no category.
  if (recipients.size === 0) {
    const roles = await db.role.findMany({
      where: { permissions: { has: "ticket.manage" } },
      select: { id: true },
    });
    const users = await db.user.findMany({
      where: { roleId: { in: roles.map((r) => r.id) }, status: "ACTIVE" },
      select: { id: true },
      take: 8,
    });
    for (const user of users) recipients.add(user.id);
  }

  for (const userId of recipients) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "TICKET_RAISED",
      title: `#${input.number} — ${input.subject}`,
      body: `Raised by ${input.who}`,
      linkUrl: `/helpdesk/${ticketId}`,
    });
  }

  await notifyChat(
    session.org.id,
    `New helpdesk ticket #${input.number}: ${input.subject} (from ${input.who})`,
  );
}

// ---------------------------------------------------------------------------
// Working a ticket
// ---------------------------------------------------------------------------

const commentSchema = z.object({
  ticketId: z.string().min(1),
  body: z.string().trim().min(1, "Say something").max(4000),
  isInternal: z.string().optional(),
});

export async function commentOnTicketAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();

  const parsed = commentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = orgDb(session.org.id);
  const ticket = await db.ticket.findFirst({
    where: { id: parsed.data.ticketId },
    include: { requester: { select: { id: true } } },
  });
  if (!ticket) return { error: "That ticket no longer exists." };

  const worksQueue = canAny(session, "ticket.manage");
  const isRequester = ticket.requesterId === session.employee?.id;
  if (!worksQueue && !isRequester) {
    return { error: "That ticket isn't yours." };
  }

  // Only the queue can write internal notes, and only on someone else's ticket.
  const isInternal = worksQueue && parsed.data.isInternal === "on";

  await rawDb.$transaction(async (tx) => {
    await tx.ticketComment.create({
      data: {
        orgId: session.org.id,
        ticketId: ticket.id,
        authorId: session.user.id,
        body: parsed.data.body,
        isInternal,
      },
    });

    // The SLA clock's first-response stamp is set by the first *public* reply
    // from the queue — an internal note is not an answer to the employee.
    const firstPublicReply =
      worksQueue && !isInternal && !ticket.firstResponseAt && !isRequester;

    await tx.ticket.update({
      where: { id: ticket.id },
      data: {
        ...(firstPublicReply ? { firstResponseAt: new Date() } : {}),
        // A reply from the requester on a waiting ticket reopens the clock.
        ...(isRequester && ticket.status === "WAITING"
          ? { status: "OPEN" as const }
          : {}),
      },
    });
  });

  await audit(session, {
    action: "ticket.commented",
    entityType: "Ticket",
    entityId: ticket.id,
    summary: `${isInternal ? "Internal note" : "Reply"} on #${ticket.number}`,
  });

  if (!isInternal) {
    // Notify the other side, never the person who just typed it.
    const recipientEmployeeId = isRequester
      ? ticket.assigneeId
      : ticket.requesterId;
    if (recipientEmployeeId) {
      const userId = await userIdForEmployee(recipientEmployeeId);
      if (userId) {
        await notify({
          orgId: session.org.id,
          userId,
          type: "TICKET_UPDATED",
          title: `#${ticket.number} — ${ticket.subject}`,
          body: parsed.data.body.slice(0, 140),
          linkUrl: `/helpdesk/${ticket.id}`,
        });
      }
    }
  }

  revalidatePath(`/helpdesk/${ticket.id}`);
  return { success: true };
}

export async function updateTicketAction(
  ticketId: string,
  patch: {
    status?: "OPEN" | "IN_PROGRESS" | "WAITING" | "RESOLVED" | "CLOSED";
    assigneeId?: string | null;
    priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
    categoryId?: string | null;
  },
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "ticket.manage");

  const db = orgDb(session.org.id);
  const ticket = await db.ticket.findFirst({ where: { id: ticketId } });
  if (!ticket) return { error: "That ticket no longer exists." };

  const now = new Date();

  await db.ticket.update({
    where: { id: ticketId },
    data: {
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.assigneeId !== undefined ? { assigneeId: patch.assigneeId } : {}),
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.categoryId !== undefined ? { categoryId: patch.categoryId } : {}),
      ...(patch.status === "RESOLVED" && !ticket.resolvedAt
        ? { resolvedAt: now }
        : {}),
      ...(patch.status === "CLOSED" ? { closedAt: now } : {}),
      // Reopening clears the resolution stamps, so "resolved this month" counts
      // tickets that actually stayed resolved.
      ...(patch.status &&
      ["OPEN", "IN_PROGRESS", "WAITING"].includes(patch.status)
        ? { resolvedAt: null, closedAt: null }
        : {}),
    },
  });

  await audit(session, {
    action: "ticket.updated",
    entityType: "Ticket",
    entityId: ticketId,
    summary: `#${ticket.number} updated`,
    before: {
      status: ticket.status,
      assigneeId: ticket.assigneeId,
      priority: ticket.priority,
    },
    after: patch,
  });

  if (patch.status === "RESOLVED") {
    const userId = await userIdForEmployee(ticket.requesterId);
    if (userId) {
      await notify({
        orgId: session.org.id,
        userId,
        type: "TICKET_UPDATED",
        title: `#${ticket.number} was resolved`,
        body: ticket.subject,
        linkUrl: `/helpdesk/${ticketId}`,
      });
    }
    await emitWebhook(session.org.id, "ticket.resolved", {
      ticketId,
      number: ticket.number,
      subject: ticket.subject,
    });
  }

  if (patch.assigneeId) {
    const userId = await userIdForEmployee(patch.assigneeId);
    if (userId && userId !== session.user.id) {
      await notify({
        orgId: session.org.id,
        userId,
        type: "TICKET_UPDATED",
        title: `#${ticket.number} was assigned to you`,
        body: ticket.subject,
        linkUrl: `/helpdesk/${ticketId}`,
      });
    }
  }

  revalidatePath("/helpdesk");
  revalidatePath(`/helpdesk/${ticketId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

const queueSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the queue").max(60),
  description: z.string().trim().max(300).optional(),
  slaHours: z.string().optional(),
  defaultAssigneeId: z.string().optional(),
});

export async function saveTicketCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "ticket.category.manage");

  const parsed = queueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, name, description } = parsed.data;
  const slaHours = parsed.data.slaHours ? Number(parsed.data.slaHours) : 24;

  if (!Number.isInteger(slaHours) || slaHours < 1 || slaHours > 720) {
    return {
      fieldErrors: { slaHours: "Give a whole number of hours, 1 to 720." },
    };
  }

  const db = orgDb(session.org.id);
  const clash = await db.ticketCategory.findFirst({
    where: { name, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { fieldErrors: { name: "That queue already exists." } };

  const data = {
    name,
    description: description || null,
    slaHours,
    defaultAssigneeId: parsed.data.defaultAssigneeId || null,
  };

  if (id) {
    await db.ticketCategory.update({ where: { id }, data });
  } else {
    await db.ticketCategory.create({
      data: { orgId: session.org.id, ...data },
    });
  }

  await audit(session, {
    action: "ticket.category.saved",
    entityType: "TicketCategory",
    entityId: id ?? null,
    summary: `${id ? "Updated" : "Added"} queue ${name} (${slaHours}h SLA)`,
  });

  revalidatePath("/helpdesk");
  return { success: true };
}

export async function deleteTicketCategoryAction(
  id: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "ticket.category.manage");

  const db = orgDb(session.org.id);
  const category = await db.ticketCategory.findFirst({
    where: { id },
    include: { _count: { select: { tickets: true } } },
  });
  if (!category) return { error: "That queue no longer exists." };

  if (category._count.tickets > 0) {
    await db.ticketCategory.update({ where: { id }, data: { isActive: false } });
    return {
      error: `${category.name} has ${category._count.tickets} ticket${
        category._count.tickets === 1 ? "" : "s"
      }, so it has been hidden from new ones instead of deleted.`,
    };
  }

  await db.ticketCategory.delete({ where: { id } });

  await audit(session, {
    action: "ticket.category.deleted",
    entityType: "TicketCategory",
    entityId: id,
    summary: `Deleted queue ${category.name}`,
  });

  revalidatePath("/helpdesk");
  return { success: true };
}
