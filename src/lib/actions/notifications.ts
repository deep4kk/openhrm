"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "../auth";
import { markAllRead, markRead } from "../notifications";

export async function markReadAction(id: string): Promise<void> {
  const session = await getSession();
  if (!session) return;
  // Scoped by userId inside markRead, so one user cannot mark another's
  // notification as read by guessing an id.
  await markRead(session.user.id, id);
  revalidatePath("/", "layout");
}

export async function markAllReadAction(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  await markAllRead(session.user.id);
  revalidatePath("/", "layout");
}
