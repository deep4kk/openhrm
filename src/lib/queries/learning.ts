import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { today } from "../dates";

/**
 * Learning reads (PRD §8.10).
 *
 * Enrollment is the centre of gravity, not the course: "who still owes POSH
 * training" is the question a compliance-minded HR manager asks, and "what
 * courses exist" is the one they ask once a year. So the queries here return
 * completion state first and the library second.
 */

export async function listCourses(
  session: AuthContext,
  filters: { status?: string; q?: string } = {},
) {
  const db = orgDb(session.org.id);
  const mayManage = can(session, "course.manage");

  return db.course.findMany({
    where: {
      // Learners only see what has been published.
      ...(mayManage ? {} : { status: "PUBLISHED" }),
      ...(filters.status && filters.status !== "all" && mayManage
        ? { status: filters.status as "PUBLISHED" }
        : {}),
      ...(filters.q
        ? { title: { contains: filters.q, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ isMandatory: "desc" }, { title: "asc" }],
    include: {
      _count: { select: { lessons: true, questions: true, enrollments: true } },
      enrollments: {
        where: session.employee ? { employeeId: session.employee.id } : { id: "" },
        select: { id: true, status: true, progress: true, dueOn: true, score: true },
      },
    },
  });
}

export async function getCourse(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  const mayManage = can(session, "course.manage");

  const course = await db.course.findFirst({
    where: { id },
    include: {
      lessons: { orderBy: { sortdex: "asc" } },
      questions: { orderBy: { sortdex: "asc" } },
      enrollments: {
        orderBy: { assignedAt: "desc" },
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
        },
      },
    },
  });

  if (!course) return null;
  if (!mayManage && course.status !== "PUBLISHED") return null;

  return course;
}

/**
 * One person's enrollment, with the course attached.
 *
 * The correct answers are stripped unless the caller manages courses — the
 * learner is about to take the quiz, and shipping the answer key to their
 * browser would make the pass mark meaningless.
 */
export async function getEnrollment(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  const enrollment = await db.courseEnrollment.findFirst({
    where: { id },
    include: {
      course: {
        include: {
          lessons: { orderBy: { sortdex: "asc" } },
          questions: { orderBy: { sortdex: "asc" } },
        },
      },
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!enrollment) return null;

  const isMine = enrollment.employeeId === session.employee?.id;
  const mayTrack = can(session, "enrollment.read.all") || can(session, "course.manage");
  if (!isMine && !mayTrack) return null;

  const withAnswers = can(session, "course.manage");

  return {
    ...enrollment,
    course: {
      ...enrollment.course,
      questions: enrollment.course.questions.map((question) => ({
        ...question,
        correctIndex: withAnswers ? question.correctIndex : -1,
        explanation: withAnswers ? question.explanation : null,
      })),
    },
    isMine,
  };
}

/** Everything assigned to the signed-in employee. */
export async function getMyEnrollments(session: AuthContext, take?: number) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.courseEnrollment.findMany({
    where: { employeeId: session.employee.id },
    orderBy: [{ status: "asc" }, { dueOn: "asc" }],
    ...(take ? { take } : {}),
    include: {
      course: {
        select: {
          id: true,
          title: true,
          summary: true,
          category: true,
          isMandatory: true,
          durationMinutes: true,
          _count: { select: { lessons: true, questions: true } },
        },
      },
    },
  });
}

/**
 * Completion across the organisation.
 *
 * Overdue is computed here rather than trusted from the stored status, because
 * the status only changes when someone touches the row — a course that quietly
 * passed its due date last week is overdue whether or not anything wrote that
 * down.
 */
export async function learningSummary(session: AuthContext) {
  const db = orgDb(session.org.id);
  if (!can(session, "enrollment.read.all") && !can(session, "course.manage")) {
    return null;
  }

  const now = today();

  const [enrollments, courses] = await Promise.all([
    db.courseEnrollment.findMany({
      select: { status: true, dueOn: true, completedAt: true },
    }),
    db.course.count({ where: { status: "PUBLISHED" } }),
  ]);

  const completed = enrollments.filter((e) => e.completedAt !== null).length;
  const overdue = enrollments.filter(
    (e) => !e.completedAt && e.dueOn && e.dueOn < now,
  ).length;

  return {
    published: courses,
    assigned: enrollments.length,
    completed,
    overdue,
    completionRate:
      enrollments.length === 0
        ? 0
        : Math.round((completed / enrollments.length) * 100),
  };
}

/** Who is not yet enrolled on a course — the list the assign dialog offers. */
export async function unassignedFor(session: AuthContext, courseId: string) {
  const db = orgDb(session.org.id);

  const [employees, enrolled] = await Promise.all([
    db.employee.findMany({
      where: { status: { not: "EXITED" } },
      orderBy: [{ firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        departmentId: true,
        department: { select: { name: true } },
      },
    }),
    db.courseEnrollment.findMany({
      where: { courseId },
      select: { employeeId: true },
    }),
  ]);

  const taken = new Set(enrolled.map((e) => e.employeeId));
  return employees.filter((e) => !taken.has(e.id));
}
