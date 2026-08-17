"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { addDays, toDateOnly } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Onboarding and offboarding workflow.
 *
 * Starting a journey copies the template's items into real tasks, each with a
 * due date resolved from the anchor (join date, or last working day) plus the
 * template's offset. From that moment the journey is independent of the
 * template: editing "New joiner onboarding" changes what the *next* hire runs
 * through, never what this one already ticked off.
 */

const startSchema = z.object({
  employeeId: z.string().min(1, "Choose who this is for"),
  templateId: z.string().min(1, "Choose a checklist"),
  anchorDate: z.string().min(1, "Set the anchor date"),
});

export async function startJourneyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "journey.manage");

  const parsed = startSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = orgDb(session.org.id);
  const { employeeId, templateId } = parsed.data;
  const anchorDate = toDateOnly(new Date(parsed.data.anchorDate));

  const [employee, template] = await Promise.all([
    db.employee.findFirst({
      where: { id: employeeId },
      select: { id: true, firstName: true, lastName: true, managerId: true },
    }),
    db.checklistTemplate.findFirst({
      where: { id: templateId },
      include: { items: { orderBy: { sortdex: "asc" } } },
    }),
  ]);

  if (!employee) return { fieldErrors: { employeeId: "Unknown employee." } };
  if (!template) return { fieldErrors: { templateId: "Unknown checklist." } };
  if (template.items.length === 0) {
    return { error: "That checklist has no tasks yet. Add some first." };
  }

  const open = await db.checklistInstance.findFirst({
    where: {
      employeeId,
      kind: template.kind,
      status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    },
  });
  if (open) {
    return {
      error: `${employee.firstName} already has an open ${template.kind.toLowerCase()} checklist.`,
    };
  }

  const journey = await rawDb.$transaction(async (tx) => {
    const instance = await tx.checklistInstance.create({
      data: {
        orgId: session.org.id,
        employeeId,
        templateId: template.id,
        kind: template.kind,
        name: template.name,
        anchorDate,
        status: "IN_PROGRESS",
      },
    });

    await tx.checklistTask.createMany({
      data: template.items.map((item, index) => ({
        orgId: session.org.id,
        instanceId: instance.id,
        title: item.title,
        description: item.description,
        category: item.category,
        // The manager's tasks land on the manager. Everything else stays in the
        // HR queue until someone claims it — guessing an owner for "IT setup"
        // from a category string would be worse than leaving it visibly unowned.
        assigneeId: item.category === "Manager" ? employee.managerId : null,
        dueDate: addDays(anchorDate, item.offsetDays),
        sortdex: index,
      })),
    });

    return instance;
  });

  await audit(session, {
    action: "journey.started",
    entityType: "ChecklistInstance",
    entityId: journey.id,
    summary: `Started ${template.name} for ${employee.firstName} ${employee.lastName}`,
  });

  // Tell the manager they picked up tasks, and the employee that theirs began.
  if (employee.managerId) {
    const managerUserId = await userIdForEmployee(employee.managerId);
    if (managerUserId) {
      await notify({
        orgId: session.org.id,
        userId: managerUserId,
        type: "TASK_ASSIGNED",
        title: `${template.name} started for ${employee.firstName}`,
        body: "Some tasks on the checklist are yours.",
        linkUrl: `/journeys/${journey.id}`,
      });
    }
  }

  const employeeUserId = await userIdForEmployee(employeeId);
  if (employeeUserId) {
    await notify({
      orgId: session.org.id,
      userId: employeeUserId,
      type: "TASK_ASSIGNED",
      title: `Your ${template.kind === "ONBOARDING" ? "onboarding" : "exit clearance"} has started`,
      body: template.name,
      linkUrl: `/journeys/${journey.id}`,
    });
  }

  revalidatePath("/journeys");
  redirect(`/journeys/${journey.id}`);
}

// ---------------------------------------------------------------------------
// Working the checklist
// ---------------------------------------------------------------------------

/**
 * Ticking off a task, and keeping the journey's own status honest.
 *
 * The instance status is derived from its tasks rather than set by hand: a
 * checklist with every task done is complete, whether or not anyone remembered
 * to press a second button.
 */
export async function setTaskStatusAction(
  taskId: string,
  status: "PENDING" | "DONE" | "SKIPPED" | "BLOCKED",
  note?: string,
): Promise<FormState> {
  const session = await requireAuth();

  const db = orgDb(session.org.id);
  const task = await db.checklistTask.findFirst({
    where: { id: taskId },
    include: { instance: { select: { id: true, employeeId: true, name: true } } },
  });
  if (!task) return { error: "That task no longer exists." };

  // Three ways to be allowed: you run journeys, it is assigned to you, or it is
  // your own checklist.
  const mine =
    task.assigneeId === session.employee?.id ||
    task.instance.employeeId === session.employee?.id;
  if (!mine) {
    await assertPermission(session, "journey.manage");
  } else if (!can(session, "journey.manage")) {
    await assertPermission(session, "task.complete");
  }

  await rawDb.checklistTask.update({
    where: { id: taskId },
    data: {
      status,
      completedAt: status === "DONE" || status === "SKIPPED" ? new Date() : null,
      note: note?.trim() || task.note,
    },
  });

  await syncJourneyStatus(task.instanceId);

  await audit(session, {
    action: "journey.task.updated",
    entityType: "ChecklistTask",
    entityId: taskId,
    summary: `${task.title} → ${status.toLowerCase()}`,
  });

  revalidatePath(`/journeys/${task.instanceId}`);
  revalidatePath("/journeys");
  revalidatePath("/me");
  return { success: true };
}

export async function assignTaskAction(
  taskId: string,
  assigneeId: string | null,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "journey.manage");

  const db = orgDb(session.org.id);
  const task = await db.checklistTask.findFirst({ where: { id: taskId } });
  if (!task) return { error: "That task no longer exists." };

  if (assigneeId) {
    const exists = await db.employee.findFirst({ where: { id: assigneeId } });
    if (!exists) return { error: "That person isn't in this organisation." };
  }

  await rawDb.checklistTask.update({
    where: { id: taskId },
    data: { assigneeId },
  });

  if (assigneeId) {
    const userId = await userIdForEmployee(assigneeId);
    if (userId) {
      await notify({
        orgId: session.org.id,
        userId,
        type: "TASK_ASSIGNED",
        title: "A checklist task was assigned to you",
        body: task.title,
        linkUrl: `/journeys/${task.instanceId}`,
      });
    }
  }

  revalidatePath(`/journeys/${task.instanceId}`);
  return { success: true };
}

export async function cancelJourneyAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "journey.manage");

  const db = orgDb(session.org.id);
  const journey = await db.checklistInstance.findFirst({ where: { id } });
  if (!journey) return { error: "That checklist no longer exists." };
  if (journey.status === "COMPLETED") {
    return { error: "A completed checklist can't be cancelled." };
  }

  await db.checklistInstance.update({
    where: { id },
    data: { status: "CANCELLED" },
  });

  await audit(session, {
    action: "journey.cancelled",
    entityType: "ChecklistInstance",
    entityId: id,
    summary: `Cancelled ${journey.name}`,
  });

  revalidatePath("/journeys");
  return { success: true };
}

/** Recomputes an instance's status from the tasks under it. */
async function syncJourneyStatus(instanceId: string): Promise<void> {
  const tasks = await rawDb.checklistTask.findMany({
    where: { instanceId },
    select: { status: true },
  });

  const finished = tasks.every(
    (t) => t.status === "DONE" || t.status === "SKIPPED",
  );
  const started = tasks.some((t) => t.status !== "PENDING");

  await rawDb.checklistInstance.update({
    where: { id: instanceId },
    data: {
      status: finished ? "COMPLETED" : started ? "IN_PROGRESS" : "NOT_STARTED",
      completedAt: finished ? new Date() : null,
    },
  });
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const templateItemSchema = z.object({
  title: z.string().trim().min(3, "Give the task a title").max(200),
  category: z.string().trim().min(1).max(40),
  offsetDays: z.coerce.number().int().min(-180).max(365),
});

const templateSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name the checklist").max(120),
  kind: z.enum(["ONBOARDING", "OFFBOARDING"]),
  description: z.string().trim().max(500).optional(),
  items: z.string().min(1, "Add at least one task"),
});

export async function saveChecklistTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "journey.template.manage");

  const parsed = templateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let items: z.infer<typeof templateItemSchema>[];
  try {
    const raw = JSON.parse(parsed.data.items);
    items = z.array(templateItemSchema).min(1).parse(raw);
  } catch {
    return { fieldErrors: { items: "Add at least one task with a title." } };
  }

  const db = orgDb(session.org.id);
  const { id, name, kind, description } = parsed.data;

  const clash = await db.checklistTemplate.findFirst({
    where: { name, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) {
    return { fieldErrors: { name: "A checklist with that name already exists." } };
  }

  const templateId = await rawDb.$transaction(async (tx) => {
    const template = id
      ? await tx.checklistTemplate.update({
          where: { id },
          data: { name, kind, description: description || null },
        })
      : await tx.checklistTemplate.create({
          data: {
            orgId: session.org.id,
            name,
            kind,
            description: description || null,
          },
        });

    // Items are replaced wholesale rather than diffed. They carry no history —
    // running journeys hold their own copies — so a rewrite is both simpler and
    // exactly what the editor's semantics imply.
    await tx.checklistTemplateItem.deleteMany({ where: { templateId: template.id } });
    await tx.checklistTemplateItem.createMany({
      data: items.map((item, index) => ({
        orgId: session.org.id,
        templateId: template.id,
        title: item.title,
        category: item.category,
        offsetDays: item.offsetDays,
        sortdex: index,
      })),
    });

    return template.id;
  });

  await audit(session, {
    action: "journey.template.saved",
    entityType: "ChecklistTemplate",
    entityId: templateId,
    summary: `${id ? "Updated" : "Created"} checklist "${name}" with ${items.length} tasks`,
  });

  revalidatePath("/journeys/templates");
  return { success: true };
}

export async function deleteChecklistTemplateAction(
  id: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "journey.template.manage");

  const db = orgDb(session.org.id);
  const template = await db.checklistTemplate.findFirst({
    where: { id },
    include: { _count: { select: { instances: true } } },
  });
  if (!template) return { error: "That checklist no longer exists." };

  // Journeys already started keep working — the schema nulls their templateId
  // rather than cascading — but deleting a template that is visibly in use is
  // more often a mistake than an intention, so it is refused rather than done.
  if (template._count.instances > 0) {
    return {
      error: `${template.name} has been used ${template._count.instances} time${
        template._count.instances === 1 ? "" : "s"
      }. Deactivate it instead of deleting it.`,
    };
  }

  await db.checklistTemplate.delete({ where: { id } });

  await audit(session, {
    action: "journey.template.deleted",
    entityType: "ChecklistTemplate",
    entityId: id,
    summary: `Deleted checklist "${template.name}"`,
  });

  revalidatePath("/journeys/templates");
  return { success: true };
}
