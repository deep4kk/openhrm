"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notifyMany } from "../notifications";
import { notifyChat } from "../webhooks";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Engagement (PRD §8.20).
 *
 * Anonymity is the load-bearing promise here, and it is kept at the point of
 * writing: `submitSurveyAction` sets `employeeId` to null on an anonymous
 * survey rather than storing it and hiding it. Nothing downstream can undo
 * that, which is the only version of the promise worth making.
 */

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

const announcementSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Give it a headline").max(160),
  body: z.string().trim().min(10, "Say something").max(20_000),
  audience: z.enum(["ALL", "DEPARTMENT", "LOCATION"]),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  isPinned: z.string().optional(),
});

export async function saveAnnouncementAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "announcement.manage");

  const parsed = announcementSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  if (input.audience === "DEPARTMENT" && !input.departmentId) {
    return { fieldErrors: { departmentId: "Choose a department." } };
  }
  if (input.audience === "LOCATION" && !input.locationId) {
    return { fieldErrors: { locationId: "Choose a location." } };
  }

  const db = orgDb(session.org.id);

  const data = {
    title: input.title,
    body: input.body,
    audience: input.audience,
    departmentId: input.audience === "DEPARTMENT" ? input.departmentId! : null,
    locationId: input.audience === "LOCATION" ? input.locationId! : null,
    isPinned: input.isPinned === "on",
  };

  let announcementId: string;
  const isNew = !input.id;

  if (input.id) {
    await db.announcement.update({ where: { id: input.id }, data });
    announcementId = input.id;
  } else {
    const created = await db.announcement.create({
      data: { orgId: session.org.id, ...data, authorId: session.user.id },
    });
    announcementId = created.id;
  }

  await audit(session, {
    action: "announcement.published",
    entityType: "Announcement",
    entityId: announcementId,
    summary: `${isNew ? "Published" : "Edited"} "${input.title}" to ${input.audience.toLowerCase()}`,
  });

  // Only a new announcement notifies. Fixing a typo should not re-ping the
  // entire company, which is how people learn to ignore the bell.
  if (isNew) {
    const recipients = await db.user.findMany({
      where: {
        status: "ACTIVE",
        ...(data.departmentId
          ? { employee: { departmentId: data.departmentId } }
          : {}),
        ...(data.locationId ? { employee: { locationId: data.locationId } } : {}),
      },
      select: { id: true },
    });

    await notifyMany(
      recipients.map((user) => ({
        orgId: session.org.id,
        userId: user.id,
        type: "ANNOUNCEMENT" as const,
        title: input.title,
        body: input.body.slice(0, 140),
        linkUrl: "/engagement",
      })),
    );

    await notifyChat(session.org.id, `📣 ${input.title}`);
  }

  revalidatePath("/engagement");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteAnnouncementAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "announcement.manage");

  const db = orgDb(session.org.id);
  const announcement = await db.announcement.findFirst({ where: { id } });
  if (!announcement) return { error: "That announcement no longer exists." };

  await db.announcement.delete({ where: { id } });

  revalidatePath("/engagement");
  revalidatePath("/dashboard");
  return { success: true };
}

/**
 * Reacting to an announcement.
 *
 * Toggling: the unique index on (announcementId, userId) means one reaction per
 * person, and pressing the same emoji again removes it. Reactions are the
 * cheapest signal that anyone read the thing, which is otherwise unknowable.
 */
export async function reactToAnnouncementAction(
  announcementId: string,
  emoji: string,
): Promise<FormState> {
  const session = await requireAuth();

  const allowed = ["👍", "🎉", "❤️", "👏"];
  if (!allowed.includes(emoji)) return { error: "Unknown reaction." };

  const db = orgDb(session.org.id);
  const announcement = await db.announcement.findFirst({
    where: { id: announcementId },
  });
  if (!announcement) return { error: "That announcement no longer exists." };

  const existing = await db.announcementReaction.findFirst({
    where: { announcementId, userId: session.user.id },
  });

  if (existing?.emoji === emoji) {
    await db.announcementReaction.delete({ where: { id: existing.id } });
  } else if (existing) {
    await db.announcementReaction.update({
      where: { id: existing.id },
      data: { emoji },
    });
  } else {
    await db.announcementReaction.create({
      data: {
        orgId: session.org.id,
        announcementId,
        userId: session.user.id,
        emoji,
      },
    });
  }

  revalidatePath("/engagement");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Surveys
// ---------------------------------------------------------------------------

const questionSchema = z.object({
  prompt: z.string().trim().min(3).max(300),
  type: z.enum(["RATING_5", "SCALE_10", "SINGLE_CHOICE", "MULTI_CHOICE", "TEXT"]),
  options: z.array(z.string().trim().max(120)).default([]),
  required: z.boolean().default(true),
});

const surveySchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Name the survey").max(160),
  description: z.string().trim().max(1000).optional(),
  kind: z.enum(["POLL", "SURVEY", "ENPS"]),
  isAnonymous: z.string().optional(),
  closesAt: z.string().optional(),
  questions: z.string().min(1, "Add at least one question"),
  intent: z.string().optional(),
});

export async function saveSurveyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "survey.manage");

  const parsed = surveySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  let questions: z.infer<typeof questionSchema>[];
  try {
    questions = z.array(questionSchema).min(1).parse(JSON.parse(input.questions));
  } catch {
    return { fieldErrors: { questions: "Every question needs a prompt." } };
  }

  for (const [index, question] of questions.entries()) {
    if (
      (question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE") &&
      question.options.filter((o) => o.trim()).length < 2
    ) {
      return {
        fieldErrors: {
          questions: `Question ${index + 1} is a choice question and needs at least two options.`,
        },
      };
    }
  }

  const db = orgDb(session.org.id);
  const opening = input.intent === "open";

  const data = {
    title: input.title,
    description: input.description || null,
    kind: input.kind,
    isAnonymous: input.isAnonymous === "on",
    closesAt: input.closesAt ? new Date(input.closesAt) : null,
  };

  const surveyId = await rawDb.$transaction(async (tx) => {
    let id: string;

    if (input.id) {
      const existing = await tx.survey.findFirst({
        where: { id: input.id, orgId: session.org.id },
        include: { _count: { select: { responses: true } } },
      });
      if (!existing) throw new Error("gone");

      // Once answers exist the questions are frozen: editing them would make
      // the stored answers refer to prompts nobody was actually asked.
      if (existing._count.responses > 0) throw new Error("answered");

      await tx.survey.update({
        where: { id: input.id },
        data: {
          ...data,
          ...(opening ? { status: "OPEN" as const, opensAt: new Date() } : {}),
        },
      });
      id = input.id;
    } else {
      const created = await tx.survey.create({
        data: {
          orgId: session.org.id,
          ...data,
          createdById: session.user.id,
          status: opening ? "OPEN" : "DRAFT",
          opensAt: opening ? new Date() : null,
        },
      });
      id = created.id;
    }

    await tx.surveyQuestion.deleteMany({ where: { surveyId: id } });
    await tx.surveyQuestion.createMany({
      data: questions.map((question, index) => ({
        orgId: session.org.id,
        surveyId: id,
        prompt: question.prompt,
        type: question.type,
        options: question.options.filter((o) => o.trim()),
        required: question.required,
        sortdex: index,
      })),
    });

    return id;
  }).catch((error: Error) => {
    if (error.message === "gone") return "gone" as const;
    if (error.message === "answered") return "answered" as const;
    throw error;
  });

  if (surveyId === "gone") return { error: "That survey no longer exists." };
  if (surveyId === "answered") {
    return {
      error:
        "People have already answered this survey, so its questions can't be changed. Close it and run a new one.",
    };
  }

  await audit(session, {
    action: opening ? "survey.opened" : "survey.created",
    entityType: "Survey",
    entityId: surveyId,
    summary: `${input.id ? "Updated" : "Created"} survey "${input.title}"`,
  });

  if (opening) {
    const users = await db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    await notifyMany(
      users.map((user) => ({
        orgId: session.org.id,
        userId: user.id,
        type: "SURVEY_OPEN" as const,
        title: `Survey open: ${input.title}`,
        body: data.isAnonymous
          ? "Anonymous — your answers are not linked to you."
          : "Your answers are attributed to you.",
        linkUrl: `/engagement/surveys/${surveyId}`,
      })),
    );
  }

  revalidatePath("/engagement");
  redirect(`/engagement/surveys/${surveyId}`);
}

export async function setSurveyStatusAction(
  surveyId: string,
  status: "OPEN" | "CLOSED",
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "survey.manage");

  const db = orgDb(session.org.id);
  const survey = await db.survey.findFirst({
    where: { id: surveyId },
    include: { _count: { select: { questions: true } } },
  });
  if (!survey) return { error: "That survey no longer exists." };

  if (status === "OPEN" && survey._count.questions === 0) {
    return { error: "Add some questions first." };
  }

  await db.survey.update({
    where: { id: surveyId },
    data: {
      status,
      ...(status === "OPEN" ? { opensAt: survey.opensAt ?? new Date() } : {}),
      ...(status === "CLOSED" ? { closesAt: new Date() } : {}),
    },
  });

  await audit(session, {
    action: status === "OPEN" ? "survey.opened" : "survey.closed",
    entityType: "Survey",
    entityId: surveyId,
    summary: `"${survey.title}" ${status.toLowerCase()}`,
  });

  revalidatePath("/engagement");
  revalidatePath(`/engagement/surveys/${surveyId}`);
  return { success: true };
}

/**
 * Submitting answers.
 *
 * The one line that matters:
 *
 *     employeeId: survey.isAnonymous ? null : session.employee.id
 *
 * On an anonymous survey there is no identity stored — not encrypted, not
 * hashed, not "hidden from the UI". The row genuinely does not know who wrote
 * it, which is what makes the eNPS number worth reading.
 */
export async function submitSurveyAction(
  surveyId: string,
  answers: Record<string, string | number | string[]>,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "survey.respond");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const db = orgDb(session.org.id);
  const survey = await db.survey.findFirst({
    where: { id: surveyId },
    include: { questions: true },
  });
  if (!survey) return { error: "That survey no longer exists." };
  if (survey.status !== "OPEN") return { error: "That survey is closed." };

  if (!survey.isAnonymous) {
    const existing = await db.surveyResponse.findFirst({
      where: { surveyId, employeeId: session.employee.id },
    });
    if (existing) return { error: "You have already answered this survey." };
  }

  for (const question of survey.questions) {
    if (question.required && answers[question.id] === undefined) {
      return { error: "Please answer every required question." };
    }
  }

  await rawDb.$transaction(async (tx) => {
    const response = await tx.surveyResponse.create({
      data: {
        orgId: session.org.id,
        surveyId,
        employeeId: survey.isAnonymous ? null : session.employee!.id,
      },
    });

    await tx.surveyAnswer.createMany({
      data: survey.questions
        .filter((question) => answers[question.id] !== undefined)
        .map((question) => {
          const raw = answers[question.id]!;
          const numeric =
            question.type === "RATING_5" || question.type === "SCALE_10"
              ? Number(raw)
              : null;

          return {
            orgId: session.org.id,
            responseId: response.id,
            questionId: question.id,
            // Multi-choice is stored pipe-joined: a scalar column keeps the
            // aggregate queries simple, and no option may contain a pipe
            // because the editor caps options at plain text.
            value: Array.isArray(raw) ? raw.join("|") : String(raw),
            numericValue:
              numeric !== null && Number.isFinite(numeric) ? numeric : null,
          };
        }),
    });
  });

  await audit(session, {
    action: "survey.responded",
    entityType: "Survey",
    entityId: surveyId,
    // Deliberately does not name the respondent on an anonymous survey — an
    // audit log that says "Priya answered the anonymous survey at 14:03" would
    // undo the whole point.
    summary: survey.isAnonymous
      ? `An anonymous response was recorded for "${survey.title}"`
      : `Responded to "${survey.title}"`,
  }, session.org.id);

  revalidatePath("/engagement");
  revalidatePath(`/engagement/surveys/${surveyId}`);
  return { success: true };
}

export async function deleteSurveyAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "survey.manage");

  const db = orgDb(session.org.id);
  const survey = await db.survey.findFirst({
    where: { id },
    include: { _count: { select: { responses: true } } },
  });
  if (!survey) return { error: "That survey no longer exists." };

  if (survey._count.responses > 0 && can(session, "survey.manage")) {
    return {
      error: `${survey._count.responses} people have answered. Close it instead — deleting would destroy their responses.`,
    };
  }

  await db.survey.delete({ where: { id } });

  revalidatePath("/engagement");
  return { success: true };
}
