import "server-only";

import { orgDb, rawDb } from "../db";
import type { AuthContext } from "../auth";

/**
 * Recruitment reads (PRD §8.8).
 *
 * The pipeline is the centre of this module, so the queries are shaped around
 * it: a job carries its candidates grouped by stage, and the counts come back
 * with the job rather than as a second round trip, because a board that renders
 * before its numbers arrive flickers on every load.
 */

export const STAGES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "HIRED",
  "REJECTED",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

/** The columns the kanban board shows. Hired and rejected live off-board. */
export const BOARD_STAGES: Stage[] = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
];

export async function listJobs(
  session: AuthContext,
  filters: { status?: string; q?: string } = {},
) {
  const db = orgDb(session.org.id);

  return db.jobPosting.findMany({
    where: {
      ...(filters.status && filters.status !== "all"
        ? filters.status === "live"
          ? { status: { in: ["OPEN", "ON_HOLD"] } }
          : { status: filters.status as "OPEN" }
        : {}),
      ...(filters.q
        ? { title: { contains: filters.q, mode: "insensitive" as const } }
        : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      department: { select: { name: true } },
      location: { select: { name: true } },
      hiringManager: { select: { id: true, firstName: true, lastName: true } },
      recruiter: { select: { id: true, firstName: true, lastName: true } },
      candidates: { select: { stage: true } },
    },
  });
}

export async function getJob(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  return db.jobPosting.findFirst({
    where: { id },
    include: {
      department: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
      hiringManager: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
      recruiter: {
        select: { id: true, firstName: true, lastName: true, avatarUrl: true },
      },
      candidates: {
        orderBy: [{ rating: "desc" }, { appliedAt: "asc" }],
        include: {
          owner: { select: { id: true, firstName: true, lastName: true } },
          interviews: {
            orderBy: { scheduledAt: "asc" },
            select: {
              id: true,
              round: true,
              scheduledAt: true,
              outcome: true,
              interviewer: { select: { firstName: true } },
            },
          },
          offers: {
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true, annualCtc: true },
          },
        },
      },
    },
  });
}

export async function getCandidate(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  return db.candidate.findFirst({
    where: { id },
    include: {
      job: {
        select: {
          id: true,
          title: true,
          slug: true,
          department: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      owner: { select: { id: true, firstName: true, lastName: true } },
      interviews: {
        orderBy: [{ round: "asc" }, { scheduledAt: "asc" }],
        include: {
          interviewer: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
            },
          },
        },
      },
      offers: {
        orderBy: { createdAt: "desc" },
        include: { employee: { select: { id: true } } },
      },
    },
  });
}

/** Interviews the signed-in employee is on and has not scored yet. */
export async function myInterviews(session: AuthContext, take = 10) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  return db.interview.findMany({
    where: { interviewerId: session.employee.id, submittedAt: null },
    orderBy: { scheduledAt: "asc" },
    take,
    include: {
      candidate: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          job: { select: { title: true } },
        },
      },
    },
  });
}

/**
 * Hiring headlines.
 *
 * Time-to-hire is measured from the candidate's application to the offer being
 * accepted, on candidates actually hired. It is the only definition that
 * survives contact with reality — measuring from the requisition would mix in
 * how long the role sat unapproved, which is a different problem.
 */
export async function hiringSummary(session: AuthContext) {
  const db = orgDb(session.org.id);

  const [openJobs, byStage, hires] = await Promise.all([
    db.jobPosting.findMany({
      where: { status: "OPEN" },
      select: { openings: true },
    }),
    db.candidate.groupBy({
      by: ["stage"],
      _count: { _all: true },
    }),
    db.offer.findMany({
      where: { status: "ACCEPTED", respondedAt: { not: null } },
      orderBy: { respondedAt: "desc" },
      take: 20,
      select: {
        respondedAt: true,
        candidate: { select: { appliedAt: true } },
      },
    }),
  ]);

  const countOf = (stage: string) =>
    byStage.find((row) => row.stage === stage)?._count._all ?? 0;

  const spans = hires
    .filter((h) => h.respondedAt)
    .map(
      (h) =>
        (h.respondedAt!.getTime() - h.candidate.appliedAt.getTime()) /
        86_400_000,
    );

  return {
    openRoles: openJobs.length,
    openings: openJobs.reduce((sum, job) => sum + job.openings, 0),
    inPipeline:
      countOf("APPLIED") + countOf("SCREENING") + countOf("INTERVIEW") +
      countOf("OFFER"),
    interviewing: countOf("INTERVIEW"),
    offersOut: countOf("OFFER"),
    hired: countOf("HIRED"),
    medianDaysToHire:
      spans.length === 0
        ? null
        : Math.round(
            [...spans].sort((a, b) => a - b)[Math.floor(spans.length / 2)]!,
          ),
  };
}

// ---------------------------------------------------------------------------
// The public careers page
// ---------------------------------------------------------------------------

/**
 * Reads for the unauthenticated careers page.
 *
 * These are the only queries in the app that run without a session, so they use
 * `rawDb` and carry their own predicates. Every one of them pins the
 * organisation by slug and filters to `isPublic` and `OPEN` — a draft
 * requisition with a salary band in it must never be one URL guess away.
 */
export async function publicOrgBySlug(slug: string) {
  return rawDb.organization.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      logoUrl: true,
      website: true,
      industry: true,
      loginTagline: true,
      brandColor: true,
    },
  });
}

export async function publicJobs(orgId: string) {
  return rawDb.jobPosting.findMany({
    where: { orgId, status: "OPEN", isPublic: true },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      title: true,
      slug: true,
      employmentType: true,
      openings: true,
      publishedAt: true,
      department: { select: { name: true } },
      location: { select: { name: true, city: true } },
    },
  });
}

export async function publicJob(orgId: string, slug: string) {
  return rawDb.jobPosting.findFirst({
    where: { orgId, slug, status: "OPEN", isPublic: true },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      requirements: true,
      employmentType: true,
      openings: true,
      publishedAt: true,
      closesOn: true,
      department: { select: { name: true } },
      location: { select: { name: true, city: true, state: true } },
    },
  });
}
