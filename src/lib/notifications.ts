import "server-only";

import { rawDb } from "./db";
import type { NotificationType } from "@/generated/prisma/enums";

/**
 * In-app notifications.
 *
 * Kept deliberately thin and event-shaped: `notify()` takes an event and a
 * recipient, and every module calls it rather than writing rows itself. When
 * Phase 2 adds payroll and Phase 4 adds Slack/Teams webhooks, they hook in here
 * instead of threading delivery logic through business code.
 *
 * Writes never throw — a failed notification must not undo the approval that
 * produced it.
 */

interface NotifyInput {
  orgId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  linkUrl?: string;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    await rawDb.notification.create({
      data: {
        orgId: input.orgId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        linkUrl: input.linkUrl ?? null,
      },
    });
  } catch (error) {
    console.error("[notifications] failed to create notification", error);
  }
}

/** Fan-out to several people — announcements, team-wide reminders. */
export async function notifyMany(
  inputs: NotifyInput[],
): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await rawDb.notification.createMany({
      data: inputs.map((i) => ({
        orgId: i.orgId,
        userId: i.userId,
        type: i.type,
        title: i.title,
        body: i.body ?? null,
        linkUrl: i.linkUrl ?? null,
      })),
    });
  } catch (error) {
    console.error("[notifications] failed to create notifications", error);
  }
}

/**
 * Finds the user account attached to an employee, if any.
 * Employees created by HR may not have logged in yet — those simply receive no
 * in-app notification, and the email path covers them.
 */
export async function userIdForEmployee(
  employeeId: string,
): Promise<string | null> {
  const employee = await rawDb.employee.findUnique({
    where: { id: employeeId },
    select: { userId: true },
  });
  return employee?.userId ?? null;
}

export async function unreadCount(userId: string): Promise<number> {
  return rawDb.notification.count({
    where: { userId, readAt: null },
  });
}

export async function recentNotifications(userId: string, take = 12) {
  return rawDb.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

export async function markRead(userId: string, id: string): Promise<void> {
  await rawDb.notification.updateMany({
    where: { id, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string): Promise<void> {
  await rawDb.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
