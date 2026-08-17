"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notifyMany, userIdForEmployee } from "../notifications";
import { toDateOnly, today } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Learning and development (PRD §8.10).
 *
 * Quiz grading happens on the server, from the stored `correctIndex`, and the
 * answer key is never sent to a learner's browser (see `getEnrollment`). That
 * is the only way a pass mark on a compliance course means anything — and
 * compliance training that can be passed by reading the page source is worse
 * than no record at all, because it produces a certificate saying otherwise.
 */

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

const lessonSchema = z.object({
  title: z.string().trim().min(2).max(160),
  contentType: z.enum(["VIDEO", "PDF", "LINK", "TEXT"]),
  contentUrl: z.string().trim().max(2000).optional(),
  body: z.string().trim().max(40_000).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(600),
});

const questionSchema = z.object({
  prompt: z.string().trim().min(5).max(500),
  options: z.array(z.string().trim().min(1).max(200)).min(2).max(6),
  correctIndex: z.coerce.number().int().min(0).max(5),
  explanation: z.string().trim().max(500).optional(),
});

const courseSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Name the course").max(160),
  summary: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(2).max(60),
  isMandatory: z.string().optional(),
  passingScore: z.coerce.number().int().min(0).max(100),
  lessons: z.string().min(1, "Add at least one lesson"),
  questions: z.string().optional(),
  intent: z.string().optional(),
});

export async function saveCourseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "course.manage");

  const parsed = courseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  let lessons: z.infer<typeof lessonSchema>[];
  try {
    lessons = z.array(lessonSchema).min(1).parse(JSON.parse(input.lessons));
  } catch {
    return { fieldErrors: { lessons: "Every lesson needs a title and a length." } };
  }

  let questions: z.infer<typeof questionSchema>[] = [];
  if (input.questions) {
    try {
      questions = z.array(questionSchema).parse(JSON.parse(input.questions));
    } catch {
      return {
        fieldErrors: {
          questions:
            "Every question needs a prompt, at least two options, and a marked answer.",
        },
      };
    }

    for (const [index, question] of questions.entries()) {
      if (question.correctIndex >= question.options.length) {
        return {
          fieldErrors: {
            questions: `Question ${index + 1} marks an answer that isn't one of its options.`,
          },
        };
      }
    }
  }

  const db = orgDb(session.org.id);
  const publishing = input.intent === "publish";
  const slug = await uniqueSlug(session.org.id, input.title, input.id);

  const data = {
    title: input.title,
    slug,
    summary: input.summary || null,
    description: input.description || null,
    category: input.category,
    isMandatory: input.isMandatory === "on",
    passingScore: input.passingScore,
    durationMinutes: lessons.reduce((sum, l) => sum + l.durationMinutes, 0),
  };

  const courseId = await rawDb.$transaction(async (tx) => {
    let id: string;

    if (input.id) {
      const existing = await tx.course.findFirst({
        where: { id: input.id, orgId: session.org.id },
      });
      if (!existing) throw new Error("gone");

      await tx.course.update({
        where: { id: input.id },
        data: {
          ...data,
          ...(publishing
            ? {
                status: "PUBLISHED" as const,
                publishedAt: existing.publishedAt ?? new Date(),
              }
            : {}),
        },
      });
      id = input.id;
    } else {
      const created = await tx.course.create({
        data: {
          orgId: session.org.id,
          ...data,
          createdById: session.user.id,
          status: publishing ? "PUBLISHED" : "DRAFT",
          publishedAt: publishing ? new Date() : null,
        },
      });
      id = created.id;
    }

    // Lessons and questions are replaced wholesale. Enrollments track lessons
    // by id in `lessonsCompleted`, so this does reset progress on a course
    // whose content changed — which is the honest outcome: someone who finished
    // the old version has not seen the new one.
    await tx.courseLesson.deleteMany({ where: { courseId: id } });
    await tx.quizQuestion.deleteMany({ where: { courseId: id } });

    await tx.courseLesson.createMany({
      data: lessons.map((lesson, index) => ({
        orgId: session.org.id,
        courseId: id,
        title: lesson.title,
        contentType: lesson.contentType,
        contentUrl: lesson.contentUrl || null,
        body: lesson.body || null,
        durationMinutes: lesson.durationMinutes,
        sortdex: index,
      })),
    });

    if (questions.length > 0) {
      await tx.quizQuestion.createMany({
        data: questions.map((question, index) => ({
          orgId: session.org.id,
          courseId: id,
          prompt: question.prompt,
          options: question.options,
          correctIndex: question.correctIndex,
          explanation: question.explanation || null,
          sortdex: index,
        })),
      });
    }

    return id;
  }).catch((error: Error) => {
    if (error.message === "gone") return "gone" as const;
    throw error;
  });

  if (courseId === "gone") return { error: "That course no longer exists." };

  await audit(session, {
    action: publishing ? "course.published" : "course.saved",
    entityType: "Course",
    entityId: courseId,
    summary: `${input.id ? "Updated" : "Created"} "${input.title}" — ${lessons.length} lessons, ${questions.length} questions`,
  });

  revalidatePath("/learning");
  revalidatePath(`/learning/${courseId}`);
  redirect(`/learning/${courseId}`);
}

async function uniqueSlug(
  orgId: string,
  title: string,
  excludeId?: string,
): Promise<string> {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "course";

  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const clash = await rawDb.course.findFirst({
      where: {
        orgId,
        slug: candidate,
        ...(excludeId ? { NOT: { id: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (!clash) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function archiveCourseAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "course.manage");

  const db = orgDb(session.org.id);
  const course = await db.course.findFirst({ where: { id } });
  if (!course) return { error: "That course no longer exists." };

  await db.course.update({
    where: { id },
    data: { status: course.status === "ARCHIVED" ? "PUBLISHED" : "ARCHIVED" },
  });

  revalidatePath("/learning");
  revalidatePath(`/learning/${id}`);
  return { success: true };
}

export async function deleteCourseAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "course.manage");

  const db = orgDb(session.org.id);
  const course = await db.course.findFirst({
    where: { id },
    include: { _count: { select: { enrollments: true } } },
  });
  if (!course) return { error: "That course no longer exists." };

  if (course._count.enrollments > 0) {
    return {
      error: `${course._count.enrollments} ${
        course._count.enrollments === 1 ? "person has" : "people have"
      } been assigned this. Archive it instead — deleting would erase their completion records.`,
    };
  }

  await db.course.delete({ where: { id } });

  await audit(session, {
    action: "course.deleted",
    entityType: "Course",
    entityId: id,
    summary: `Deleted course "${course.title}"`,
  });

  revalidatePath("/learning");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Assigning
// ---------------------------------------------------------------------------

export async function assignCourseAction(
  courseId: string,
  employeeIds: string[],
  dueOn?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "enrollment.manage");

  if (employeeIds.length === 0) {
    return { error: "Choose at least one person." };
  }

  const db = orgDb(session.org.id);
  const course = await db.course.findFirst({ where: { id: courseId } });
  if (!course) return { error: "That course no longer exists." };
  if (course.status !== "PUBLISHED") {
    return { error: "Publish the course before assigning it." };
  }

  const due = dueOn ? toDateOnly(new Date(dueOn)) : null;

  // skipDuplicates rather than a pre-check: the unique index on
  // (courseId, employeeId) is the real guarantee, and re-assigning someone who
  // already has it should be a no-op, not an error.
  const result = await db.courseEnrollment.createMany({
    data: employeeIds.map((employeeId) => ({
      orgId: session.org.id,
      courseId,
      employeeId,
      assignedById: session.employee?.id ?? null,
      dueOn: due,
    })),
    skipDuplicates: true,
  });

  await audit(session, {
    action: "course.assigned",
    entityType: "Course",
    entityId: courseId,
    summary: `Assigned "${course.title}" to ${result.count} ${
      result.count === 1 ? "person" : "people"
    }`,
  });

  const userIds = await Promise.all(employeeIds.map(userIdForEmployee));
  await notifyMany(
    userIds
      .filter((id): id is string => Boolean(id))
      .map((userId) => ({
        orgId: session.org.id,
        userId,
        type: "COURSE_ASSIGNED" as const,
        title: `Training assigned: ${course.title}`,
        body: due
          ? `Due ${due.toISOString().slice(0, 10)}`
          : `About ${course.durationMinutes} minutes`,
        linkUrl: "/me/learning",
      })),
  );

  revalidatePath("/learning");
  revalidatePath(`/learning/${courseId}`);
  return { success: true };
}

export async function unassignCourseAction(
  enrollmentId: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "enrollment.manage");

  const db = orgDb(session.org.id);
  const enrollment = await db.courseEnrollment.findFirst({
    where: { id: enrollmentId },
  });
  if (!enrollment) return { error: "That assignment no longer exists." };

  if (enrollment.completedAt) {
    return {
      error: "That course has been completed. Removing it would erase the record.",
    };
  }

  await db.courseEnrollment.delete({ where: { id: enrollmentId } });

  revalidatePath(`/learning/${enrollment.courseId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Taking a course
// ---------------------------------------------------------------------------

export async function completeLessonAction(
  enrollmentId: string,
  lessonId: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "course.read");

  const db = orgDb(session.org.id);
  const enrollment = await db.courseEnrollment.findFirst({
    where: { id: enrollmentId },
    include: { course: { include: { lessons: { select: { id: true } } } } },
  });
  if (!enrollment) return { error: "That assignment no longer exists." };
  if (enrollment.employeeId !== session.employee?.id) {
    return { error: "That course isn't assigned to you." };
  }

  const valid = enrollment.course.lessons.some((l) => l.id === lessonId);
  if (!valid) return { error: "That lesson isn't part of this course." };

  const done = new Set(enrollment.lessonsCompleted);
  done.add(lessonId);

  const total = enrollment.course.lessons.length;
  const progress = total === 0 ? 100 : Math.round((done.size / total) * 100);

  await db.courseEnrollment.update({
    where: { id: enrollmentId },
    data: {
      lessonsCompleted: Array.from(done),
      progress,
      startedAt: enrollment.startedAt ?? new Date(),
      status: progress === 100 ? enrollment.status : "IN_PROGRESS",
    },
  });

  revalidatePath(`/me/learning/${enrollmentId}`);
  revalidatePath("/me/learning");
  return { success: true };
}

/**
 * Submitting the quiz.
 *
 * Answers are graded here against the stored key. A course with no questions
 * completes as soon as its lessons do — a "quiz" of zero questions is not a
 * bar anyone should have to clear.
 */
export async function submitQuizAction(
  enrollmentId: string,
  answers: Record<string, number>,
): Promise<FormState & { score?: number; passed?: boolean }> {
  const session = await requireAuth();
  await assertPermission(session, "course.read");

  const db = orgDb(session.org.id);
  const enrollment = await db.courseEnrollment.findFirst({
    where: { id: enrollmentId },
    include: {
      course: {
        include: {
          questions: { select: { id: true, correctIndex: true } },
          lessons: { select: { id: true } },
        },
      },
    },
  });

  if (!enrollment) return { error: "That assignment no longer exists." };
  if (enrollment.employeeId !== session.employee?.id) {
    return { error: "That course isn't assigned to you." };
  }

  const questions = enrollment.course.questions;
  const correct = questions.filter(
    (question) => answers[question.id] === question.correctIndex,
  ).length;

  const score =
    questions.length === 0
      ? 100
      : Math.round((correct / questions.length) * 100);
  const passed = score >= enrollment.course.passingScore;

  const lessonsDone =
    enrollment.lessonsCompleted.length >= enrollment.course.lessons.length;

  await db.courseEnrollment.update({
    where: { id: enrollmentId },
    data: {
      score,
      attempts: { increment: 1 },
      ...(passed && lessonsDone
        ? {
            status: "COMPLETED" as const,
            completedAt: new Date(),
            progress: 100,
            certificateNumber: certificateNumber(enrollment.id),
          }
        : {}),
    },
  });

  if (passed && lessonsDone) {
    await audit(session, {
      action: "course.completed",
      entityType: "CourseEnrollment",
      entityId: enrollmentId,
      summary: `Completed "${enrollment.course.title}" with ${score}%`,
    });
  }

  revalidatePath(`/me/learning/${enrollmentId}`);
  revalidatePath("/me/learning");
  revalidatePath("/learning");
  return { success: true, score, passed };
}

/**
 * A certificate number that is stable per enrollment and carries the year.
 *
 * Derived rather than sequenced: a gapless counter would need its own row lock
 * on every completion, and nothing here depends on the numbers being
 * consecutive — only on being unique and quotable.
 */
function certificateNumber(enrollmentId: string): string {
  const year = today().getUTCFullYear();
  return `CERT/${year}/${enrollmentId.slice(-8).toUpperCase()}`;
}

/**
 * Refreshing overdue flags.
 *
 * Called from the learning screens rather than a scheduled job, so a
 * self-hosted install with no cron still shows the truth. Cheap: one indexed
 * updateMany over rows that are already wrong.
 */
export async function refreshOverdueEnrollments(orgId: string): Promise<void> {
  await rawDb.courseEnrollment.updateMany({
    where: {
      orgId,
      completedAt: null,
      dueOn: { lt: today() },
      status: { in: ["ASSIGNED", "IN_PROGRESS"] },
    },
    data: { status: "OVERDUE" },
  });
}
