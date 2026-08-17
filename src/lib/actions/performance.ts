"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, notifyMany, userIdForEmployee } from "../notifications";
import { emitWebhook } from "../webhooks";
import { canReachEmployee, getReportingSubtree } from "../scope";
import { toDateOnly } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Performance (PRD §8.9).
 *
 * The design decision that matters here is that a review *cycle* generates its
 * reviews rather than people creating them ad hoc. Opening a cycle writes one
 * self-review and one manager review per participating employee, in a
 * transaction. That is what makes "who still owes a review?" a query instead of
 * a spreadsheet, and it is why a cycle can only be opened once.
 */

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

const goalSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(5, "What is the goal?").max(200),
  description: z.string().trim().max(2000).optional(),
  level: z.enum(["COMPANY", "DEPARTMENT", "INDIVIDUAL"]),
  ownerId: z.string().optional(),
  departmentId: z.string().optional(),
  parentId: z.string().optional(),
  metric: z.string().trim().max(120).optional(),
  targetValue: z.string().optional(),
  currentValue: z.string().optional(),
  unit: z.string().trim().max(20).optional(),
  weight: z.coerce.number().int().min(1).max(100),
  startDate: z.string().min(1, "When does it start?"),
  dueDate: z.string().min(1, "When is it due?"),
  status: z.enum(["DRAFT", "ACTIVE", "AT_RISK", "ACHIEVED", "MISSED", "CANCELLED"]),
  cycleId: z.string().optional(),
});

export async function saveGoalAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "goal.manage");

  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const startDate = toDateOnly(new Date(input.startDate));
  const dueDate = toDateOnly(new Date(input.dueDate));

  if (dueDate < startDate) {
    return { fieldErrors: { dueDate: "The due date can't be before the start." } };
  }

  if (input.level === "INDIVIDUAL" && !input.ownerId) {
    return { fieldErrors: { ownerId: "An individual goal needs an owner." } };
  }
  if (input.level === "DEPARTMENT" && !input.departmentId) {
    return {
      fieldErrors: { departmentId: "A department goal needs a department." },
    };
  }

  const db = orgDb(session.org.id);

  // A manager may set goals for their own line, not for the company.
  if (!can(session, "goal.read.all") && input.ownerId) {
    const reachable = await canReachEmployee(session, "goal.read", input.ownerId);
    if (!reachable) {
      return { fieldErrors: { ownerId: "That person isn't in your reporting line." } };
    }
  }

  const data = {
    title: input.title,
    description: input.description || null,
    level: input.level,
    ownerId: input.level === "INDIVIDUAL" ? (input.ownerId ?? null) : null,
    departmentId: input.level === "DEPARTMENT" ? (input.departmentId ?? null) : null,
    parentId: input.parentId || null,
    metric: input.metric || null,
    targetValue: input.targetValue ? Number(input.targetValue) : null,
    currentValue: input.currentValue ? Number(input.currentValue) : null,
    unit: input.unit || null,
    weight: input.weight,
    startDate,
    dueDate,
    status: input.status,
    cycleId: input.cycleId || null,
    progress: progressFrom(input.currentValue, input.targetValue),
  };

  let goalId: string;

  if (input.id) {
    // A goal cannot be its own parent, and a two-step cycle is just as broken.
    if (input.parentId === input.id) {
      return { fieldErrors: { parentId: "A goal can't roll up into itself." } };
    }
    await db.goal.update({ where: { id: input.id }, data });
    goalId = input.id;
  } else {
    const created = await db.goal.create({
      data: { orgId: session.org.id, ...data },
    });
    goalId = created.id;

    if (data.ownerId && data.ownerId !== session.employee?.id) {
      const userId = await userIdForEmployee(data.ownerId);
      if (userId) {
        await notify({
          orgId: session.org.id,
          userId,
          type: "GOAL_ASSIGNED",
          title: "A goal was set for you",
          body: input.title,
          linkUrl: "/performance",
        });
      }
    }
  }

  await audit(session, {
    action: input.id ? "goal.updated" : "goal.created",
    entityType: "Goal",
    entityId: goalId,
    summary: `${input.id ? "Updated" : "Set"} goal "${input.title}"`,
  });

  revalidatePath("/performance");
  return { success: true };
}

/**
 * Updating progress on a goal you own.
 *
 * Separate from the full editor because it is a different act: the owner moves
 * the number weekly, and making them open a form with fifteen fields to change
 * one of them is how progress stops getting updated.
 */
export async function updateGoalProgressAction(
  goalId: string,
  currentValue: number | null,
  progress: number,
  status?: "ACTIVE" | "AT_RISK" | "ACHIEVED" | "MISSED",
): Promise<FormState> {
  const session = await requireAuth();

  const db = orgDb(session.org.id);
  const goal = await db.goal.findFirst({ where: { id: goalId } });
  if (!goal) return { error: "That goal no longer exists." };

  const isOwner = goal.ownerId === session.employee?.id;
  if (!isOwner) await assertPermission(session, "goal.manage");

  if (progress < 0 || progress > 100) {
    return { error: "Progress runs from 0 to 100." };
  }

  await db.goal.update({
    where: { id: goalId },
    data: {
      currentValue,
      progress: Math.round(progress),
      ...(status ? { status } : {}),
    },
  });

  revalidatePath("/performance");
  revalidatePath("/me");
  return { success: true };
}

export async function deleteGoalAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "goal.manage");

  const db = orgDb(session.org.id);
  const goal = await db.goal.findFirst({
    where: { id },
    include: { _count: { select: { children: true } } },
  });
  if (!goal) return { error: "That goal no longer exists." };

  if (goal._count.children > 0) {
    return {
      error: `${goal._count.children} goal${
        goal._count.children === 1 ? "" : "s"
      } roll up into this one. Detach them first.`,
    };
  }

  await db.goal.delete({ where: { id } });

  await audit(session, {
    action: "goal.deleted",
    entityType: "Goal",
    entityId: id,
    summary: `Deleted goal "${goal.title}"`,
  });

  revalidatePath("/performance");
  return { success: true };
}

function progressFrom(current?: string, target?: string): number {
  const c = Number(current);
  const t = Number(target);
  if (!Number.isFinite(c) || !Number.isFinite(t) || t === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((c / t) * 100)));
}

// ---------------------------------------------------------------------------
// Review cycles
// ---------------------------------------------------------------------------

const cycleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name the cycle").max(120),
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
  selfReviewDueOn: z.string().min(1),
  managerReviewDueOn: z.string().min(1),
  ratingScaleMax: z.coerce.number().int().min(3).max(10),
  includesPeerFeedback: z.string().optional(),
  instructions: z.string().trim().max(2000).optional(),
});

export async function saveReviewCycleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "review.cycle.manage");

  const parsed = cycleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const periodStart = toDateOnly(new Date(input.periodStart));
  const periodEnd = toDateOnly(new Date(input.periodEnd));

  if (periodEnd < periodStart) {
    return { fieldErrors: { periodEnd: "The period ends before it starts." } };
  }

  const db = orgDb(session.org.id);
  const clash = await db.reviewCycle.findFirst({
    where: { name: input.name, ...(input.id ? { NOT: { id: input.id } } : {}) },
  });
  if (clash) return { fieldErrors: { name: "A cycle with that name exists." } };

  const data = {
    name: input.name,
    periodStart,
    periodEnd,
    selfReviewDueOn: toDateOnly(new Date(input.selfReviewDueOn)),
    managerReviewDueOn: toDateOnly(new Date(input.managerReviewDueOn)),
    ratingScaleMax: input.ratingScaleMax,
    includesPeerFeedback: input.includesPeerFeedback === "on",
    instructions: input.instructions || null,
  };

  let cycleId: string;
  if (input.id) {
    await db.reviewCycle.update({ where: { id: input.id }, data });
    cycleId = input.id;
  } else {
    const created = await db.reviewCycle.create({
      data: { orgId: session.org.id, ...data },
    });
    cycleId = created.id;
  }

  await audit(session, {
    action: "review.cycle.created",
    entityType: "ReviewCycle",
    entityId: cycleId,
    summary: `${input.id ? "Updated" : "Created"} review cycle "${input.name}"`,
  });

  revalidatePath("/performance");
  revalidatePath(`/performance/cycles/${cycleId}`);
  return { success: true };
}

/**
 * Moving a cycle to its next phase.
 *
 * DRAFT → SELF_REVIEW is the one that does real work: it materialises every
 * review the cycle needs. Everything after that is a status change plus a
 * round of notifications.
 */
export async function advanceCycleAction(
  cycleId: string,
  status: "SELF_REVIEW" | "MANAGER_REVIEW" | "CALIBRATION" | "CLOSED",
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "review.cycle.manage");

  const db = orgDb(session.org.id);
  const cycle = await db.reviewCycle.findFirst({
    where: { id: cycleId },
    include: { _count: { select: { reviews: true } } },
  });
  if (!cycle) return { error: "That cycle no longer exists." };

  if (status === "SELF_REVIEW" && cycle._count.reviews === 0) {
    const created = await openCycle(session.org.id, cycleId);
    if (created === 0) {
      return {
        error: "There is nobody active to review. Add employees first.",
      };
    }
  }

  await db.reviewCycle.update({ where: { id: cycleId }, data: { status } });

  await audit(session, {
    action: "review.cycle.advanced",
    entityType: "ReviewCycle",
    entityId: cycleId,
    summary: `"${cycle.name}" → ${status.toLowerCase().replace("_", " ")}`,
  });

  // Everyone with something to do in the new phase hears about it.
  if (status === "SELF_REVIEW" || status === "MANAGER_REVIEW") {
    const reviews = await db.performanceReview.findMany({
      where: {
        cycleId,
        status: "PENDING",
        kind: status === "SELF_REVIEW" ? "SELF" : "MANAGER",
      },
      select: { employeeId: true, reviewerId: true },
    });

    const employeeIds = reviews
      .map((r) => (status === "SELF_REVIEW" ? r.employeeId : r.reviewerId))
      .filter((id): id is string => Boolean(id));

    const users = await Promise.all(employeeIds.map(userIdForEmployee));

    await notifyMany(
      users
        .filter((id): id is string => Boolean(id))
        .map((userId) => ({
          orgId: session.org.id,
          userId,
          type: "REVIEW_DUE" as const,
          title:
            status === "SELF_REVIEW"
              ? `Your self-review for ${cycle.name} is open`
              : `Manager reviews for ${cycle.name} are open`,
          body: "Due dates are on the cycle.",
          linkUrl: `/performance/cycles/${cycleId}`,
        })),
    );
  }

  revalidatePath("/performance");
  revalidatePath(`/performance/cycles/${cycleId}`);
  return { success: true };
}

/**
 * Materialises the cycle's reviews.
 *
 * One self-review per active employee, plus one manager review for everyone who
 * has a manager. Peer reviews are not generated — who reviews whom is a
 * judgement call, so the cycle flag turns the option on and reviews are added
 * by hand.
 */
async function openCycle(orgId: string, cycleId: string): Promise<number> {
  const employees = await rawDb.employee.findMany({
    where: { orgId, status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: { id: true, managerId: true },
  });

  if (employees.length === 0) return 0;

  const rows = employees.flatMap((employee) => {
    const self = {
      orgId,
      cycleId,
      employeeId: employee.id,
      reviewerId: null,
      kind: "SELF" as const,
    };

    return employee.managerId
      ? [
          self,
          {
            orgId,
            cycleId,
            employeeId: employee.id,
            reviewerId: employee.managerId,
            kind: "MANAGER" as const,
          },
        ]
      : [self];
  });

  await rawDb.performanceReview.createMany({ data: rows });
  return rows.length;
}

const reviewSchema = z.object({
  reviewId: z.string().min(1),
  overallRating: z.string().optional(),
  strengths: z.string().trim().max(5000).optional(),
  improvements: z.string().trim().max(5000).optional(),
  comments: z.string().trim().max(5000).optional(),
  privateNotes: z.string().trim().max(5000).optional(),
});

export async function submitReviewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "review.participate", "review.cycle.manage");

  const parsed = reviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = orgDb(session.org.id);
  const review = await db.performanceReview.findFirst({
    where: { id: parsed.data.reviewId },
    include: {
      cycle: { select: { id: true, name: true, ratingScaleMax: true, status: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!review) return { error: "That review no longer exists." };

  const self = session.employee?.id;
  const mayWrite =
    review.kind === "SELF"
      ? review.employeeId === self
      : review.reviewerId === self;

  if (!mayWrite) {
    return { error: "That review isn't yours to write." };
  }
  if (review.cycle.status === "CLOSED") {
    return { error: "That cycle is closed." };
  }

  const rating = parsed.data.overallRating
    ? Number(parsed.data.overallRating)
    : null;

  if (
    rating !== null &&
    (!Number.isInteger(rating) || rating < 1 || rating > review.cycle.ratingScaleMax)
  ) {
    return {
      fieldErrors: {
        overallRating: `Ratings run from 1 to ${review.cycle.ratingScaleMax}.`,
      },
    };
  }

  await db.performanceReview.update({
    where: { id: review.id },
    data: {
      overallRating: rating,
      strengths: parsed.data.strengths || null,
      improvements: parsed.data.improvements || null,
      comments: parsed.data.comments || null,
      // A self-review has no private half — the author is the subject.
      privateNotes:
        review.kind === "SELF" ? null : parsed.data.privateNotes || null,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  await audit(session, {
    action: "review.submitted",
    entityType: "PerformanceReview",
    entityId: review.id,
    summary: `${review.kind === "SELF" ? "Self-review" : "Manager review"} submitted for ${review.employee.firstName} ${review.employee.lastName} in "${review.cycle.name}"`,
  });

  await emitWebhook(session.org.id, "review.submitted", {
    reviewId: review.id,
    cycleId: review.cycleId,
    employeeId: review.employeeId,
    kind: review.kind,
  });

  // The subject hears when their manager's review lands, never the reverse —
  // a manager does not need pinging that someone completed their self-review.
  if (review.kind === "MANAGER") {
    const userId = await userIdForEmployee(review.employeeId);
    if (userId) {
      await notify({
        orgId: session.org.id,
        userId,
        type: "REVIEW_DUE",
        title: `Your review for ${review.cycle.name} is ready`,
        body: "Your manager has submitted it.",
        linkUrl: `/performance/reviews/${review.id}`,
      });
    }
  }

  revalidatePath(`/performance/reviews/${review.id}`);
  revalidatePath(`/performance/cycles/${review.cycleId}`);
  revalidatePath("/me");
  return { success: true };
}

/** Adds a peer review to an open cycle. */
export async function addPeerReviewAction(
  cycleId: string,
  employeeId: string,
  reviewerId: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "review.cycle.manage");

  const db = orgDb(session.org.id);
  const cycle = await db.reviewCycle.findFirst({ where: { id: cycleId } });
  if (!cycle) return { error: "That cycle no longer exists." };
  if (!cycle.includesPeerFeedback) {
    return { error: "This cycle doesn't include peer feedback." };
  }
  if (employeeId === reviewerId) {
    return { error: "Someone can't be their own peer reviewer." };
  }

  const existing = await db.performanceReview.findFirst({
    where: { cycleId, employeeId, reviewerId, kind: "PEER" },
  });
  if (existing) return { error: "That peer review already exists." };

  await db.performanceReview.create({
    data: {
      orgId: session.org.id,
      cycleId,
      employeeId,
      reviewerId,
      kind: "PEER",
    },
  });

  const userId = await userIdForEmployee(reviewerId);
  if (userId) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "REVIEW_DUE",
      title: "You were asked for peer feedback",
      body: cycle.name,
      linkUrl: `/performance/cycles/${cycleId}`,
    });
  }

  revalidatePath(`/performance/cycles/${cycleId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// 1:1s
// ---------------------------------------------------------------------------

const oneOnOneSchema = z.object({
  id: z.string().optional(),
  employeeId: z.string().min(1, "Who is it with?"),
  scheduledAt: z.string().min(1, "When?"),
  agenda: z.string().trim().max(3000).optional(),
  notes: z.string().trim().max(8000).optional(),
  actionItems: z.string().trim().max(3000).optional(),
  completed: z.string().optional(),
});

export async function saveOneOnOneAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "oneonone.manage");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const parsed = oneOnOneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  // 1:1s are logged by the manager, about their own reports. Anyone can hold a
  // conversation; only the reporting line gets a record of it here.
  const subtree = await getReportingSubtree(session.org.id, session.employee.id);
  if (!subtree.includes(input.employeeId)) {
    return {
      fieldErrors: { employeeId: "You can only log 1:1s with your own reports." },
    };
  }

  const data = {
    employeeId: input.employeeId,
    managerId: session.employee.id,
    scheduledAt: new Date(input.scheduledAt),
    agenda: input.agenda || null,
    notes: input.notes || null,
    actionItems: input.actionItems || null,
    completedAt: input.completed === "on" ? new Date() : null,
  };

  if (input.id) {
    const existing = await db.oneOnOne.findFirst({ where: { id: input.id } });
    if (!existing) return { error: "That 1:1 no longer exists." };
    if (existing.managerId !== session.employee.id) {
      return { error: "That 1:1 isn't yours." };
    }
    await db.oneOnOne.update({ where: { id: input.id }, data });
  } else {
    await db.oneOnOne.create({ data: { orgId: session.org.id, ...data } });
  }

  await audit(session, {
    action: "oneonone.saved",
    entityType: "OneOnOne",
    entityId: input.id ?? null,
    summary: `Logged a 1:1`,
  });

  revalidatePath("/performance/one-on-ones");
  return { success: true };
}
