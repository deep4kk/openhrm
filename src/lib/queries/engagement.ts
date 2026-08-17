import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { addDays, today } from "../dates";

/**
 * Announcements, surveys and the little human things (PRD §8.20).
 *
 * The rule that governs this whole module: an anonymous survey is anonymous in
 * the database, not merely in the UI. `SurveyResponse.employeeId` is left null
 * on submission, so there is no join anybody could later write — not an admin,
 * not a support engineer with psql, not a subpoena. Every aggregate here is
 * built on that assumption and the schema enforces it.
 */

export async function listAnnouncements(session: AuthContext, take = 20) {
  const db = orgDb(session.org.id);

  // Targeted announcements reach the department or location they name; the
  // filter is applied in the query so a targeted post never reaches the wrong
  // feed even if a page forgets to check.
  const employee = session.employee
    ? await db.employee.findFirst({
        where: { id: session.employee.id },
        select: { departmentId: true, locationId: true },
      })
    : null;

  return db.announcement.findMany({
    where: can(session, "announcement.manage")
      ? {}
      : {
          OR: [
            { audience: "ALL" },
            ...(employee?.departmentId
              ? [
                  {
                    audience: "DEPARTMENT" as const,
                    departmentId: employee.departmentId,
                  },
                ]
              : []),
            ...(employee?.locationId
              ? [
                  {
                    audience: "LOCATION" as const,
                    locationId: employee.locationId,
                  },
                ]
              : []),
          ],
        },
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
    take,
    include: {
      author: { select: { name: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
      reactions: { select: { emoji: true, userId: true } },
    },
  });
}

export async function listSurveys(session: AuthContext) {
  const db = orgDb(session.org.id);
  const mayManage = can(session, "survey.manage");

  return db.survey.findMany({
    where: mayManage ? {} : { status: "OPEN" },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { questions: true, responses: true } },
      responses: session.employee
        ? { where: { employeeId: session.employee.id }, select: { id: true } }
        : false,
    },
  });
}

export async function getSurvey(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  const mayManage = can(session, "survey.manage");

  const survey = await db.survey.findFirst({
    where: { id },
    include: {
      questions: { orderBy: { sortdex: "asc" } },
      _count: { select: { responses: true } },
    },
  });

  if (!survey) return null;
  if (!mayManage && survey.status !== "OPEN") return null;

  return survey;
}

/**
 * Whether the signed-in employee has already answered.
 *
 * On an anonymous survey there is no employee link to check, so this asks a
 * different question: have they got a response row at all? They have not — by
 * design. Repeat submission on anonymous surveys is therefore only prevented
 * within a session, and the UI says so rather than pretending otherwise.
 */
export async function hasResponded(
  session: AuthContext,
  surveyId: string,
): Promise<boolean> {
  if (!session.employee) return false;
  const db = orgDb(session.org.id);

  const response = await db.surveyResponse.findFirst({
    where: { surveyId, employeeId: session.employee.id },
    select: { id: true },
  });
  return response !== null;
}

/**
 * Survey results, aggregated.
 *
 * Free-text answers are returned verbatim but detached from any identity; scale
 * questions come back as a distribution rather than a mean, because an average
 * of 3.2 hides a bimodal team where half are delighted and half are leaving.
 */
export async function surveyResults(session: AuthContext, surveyId: string) {
  const db = orgDb(session.org.id);
  if (!can(session, "survey.manage")) return null;

  const [questions, answers, responseCount] = await Promise.all([
    db.surveyQuestion.findMany({
      where: { surveyId },
      orderBy: { sortdex: "asc" },
    }),
    db.surveyAnswer.findMany({
      where: { question: { surveyId } },
      select: { questionId: true, value: true, numericValue: true },
    }),
    db.surveyResponse.count({ where: { surveyId } }),
  ]);

  const byQuestion = new Map<string, typeof answers>();
  for (const answer of answers) {
    const list = byQuestion.get(answer.questionId) ?? [];
    list.push(answer);
    byQuestion.set(answer.questionId, list);
  }

  return {
    responseCount,
    questions: questions.map((question) => {
      const given = byQuestion.get(question.id) ?? [];

      if (question.type === "TEXT") {
        return {
          question,
          kind: "text" as const,
          texts: given.map((a) => a.value).filter((v): v is string => Boolean(v)),
        };
      }

      if (question.type === "RATING_5" || question.type === "SCALE_10") {
        const max = question.type === "RATING_5" ? 5 : 10;
        const counts = Array.from({ length: max }, (_, i) => ({
          label: String(i + 1),
          count: given.filter((a) => a.numericValue === i + 1).length,
        }));
        const values = given
          .map((a) => a.numericValue)
          .filter((v): v is number => v !== null);

        return {
          question,
          kind: "scale" as const,
          counts,
          average:
            values.length === 0
              ? null
              : Math.round(
                  (values.reduce((s, v) => s + v, 0) / values.length) * 10,
                ) / 10,
          // eNPS: promoters (9–10) minus detractors (0–6), as a percentage.
          nps:
            question.type === "SCALE_10" && values.length > 0
              ? Math.round(
                  ((values.filter((v) => v >= 9).length -
                    values.filter((v) => v <= 6).length) /
                    values.length) *
                    100,
                )
              : null,
        };
      }

      const counts = question.options.map((option) => ({
        label: option,
        count: given.filter((a) => a.value?.split("|").includes(option)).length,
      }));

      return { question, kind: "choice" as const, counts };
    }),
  };
}

/**
 * Birthdays and work anniversaries in the next fortnight.
 *
 * Month-and-day comparison in JavaScript rather than SQL: the date column
 * carries a birth *year* nobody should be shown, and a `DATE_PART` query that
 * wraps December into January is more code than filtering a few hundred rows.
 */
export async function upcomingCelebrations(session: AuthContext, days = 14) {
  const db = orgDb(session.org.id);
  if (!can(session, "directory.read")) return { birthdays: [], anniversaries: [] };

  const employees = await db.employee.findMany({
    where: { status: { in: ["ACTIVE", "ON_LEAVE"] } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      dateOfBirth: true,
      dateOfJoining: true,
      designation: { select: { title: true } },
    },
  });

  const now = today();
  const horizon = addDays(now, days);

  function nextOccurrence(date: Date): Date {
    const candidate = new Date(
      Date.UTC(now.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    return candidate < now
      ? new Date(
          Date.UTC(now.getUTCFullYear() + 1, date.getUTCMonth(), date.getUTCDate()),
        )
      : candidate;
  }

  const birthdays = employees
    .filter((e) => e.dateOfBirth)
    .map((e) => ({ employee: e, on: nextOccurrence(e.dateOfBirth!) }))
    .filter((e) => e.on <= horizon)
    .sort((a, b) => a.on.getTime() - b.on.getTime());

  const anniversaries = employees
    .map((e) => ({
      employee: e,
      on: nextOccurrence(e.dateOfJoining),
      years:
        now.getUTCFullYear() -
        e.dateOfJoining.getUTCFullYear() +
        (nextOccurrence(e.dateOfJoining).getUTCFullYear() > now.getUTCFullYear()
          ? 1
          : 0),
    }))
    .filter((e) => e.on <= horizon && e.years >= 1)
    .sort((a, b) => a.on.getTime() - b.on.getTime());

  return { birthdays, anniversaries };
}
