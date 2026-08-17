"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { emitWebhook } from "../webhooks";
import { toDateOnly, today } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Recruitment (PRD §8.8).
 *
 * The one rule that shapes this file: a candidate's stage is the single source
 * of truth for where they are, and everything that looks like a stage change
 * goes through `moveCandidateAction`. Scheduling an interview does not quietly
 * advance them; sending an offer does. Keeping those explicit is what makes the
 * funnel report trustworthy — a pipeline that drifts because two code paths
 * disagree is worse than no pipeline at all.
 */

// ---------------------------------------------------------------------------
// Job postings
// ---------------------------------------------------------------------------

const jobSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Name the role").max(140),
  departmentId: z.string().optional(),
  locationId: z.string().optional(),
  employmentType: z.enum([
    "FULL_TIME",
    "PART_TIME",
    "CONTRACT",
    "INTERN",
    "CONSULTANT",
  ]),
  openings: z.coerce.number().int().min(1).max(500),
  description: z
    .string()
    .trim()
    .min(30, "Say what the job is — this is the public advert")
    .max(20_000),
  requirements: z.string().trim().max(10_000).optional(),
  minCtc: z.string().optional(),
  maxCtc: z.string().optional(),
  hiringManagerId: z.string().optional(),
  recruiterId: z.string().optional(),
  closesOn: z.string().optional(),
  isPublic: z.string().optional(),
  status: z.enum(["DRAFT", "OPEN", "ON_HOLD", "CLOSED", "FILLED"]),
});

export async function saveJobAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "job.manage");

  const parsed = jobSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const minCtc = input.minCtc ? Number(input.minCtc) : null;
  const maxCtc = input.maxCtc ? Number(input.maxCtc) : null;
  if (minCtc !== null && maxCtc !== null && minCtc > maxCtc) {
    return {
      fieldErrors: { maxCtc: "The top of the band can't be below the bottom." },
    };
  }

  const slug = await uniqueSlug(session.org.id, input.title, input.id);

  const data = {
    title: input.title,
    slug,
    departmentId: input.departmentId || null,
    locationId: input.locationId || null,
    employmentType: input.employmentType,
    openings: input.openings,
    description: input.description,
    requirements: input.requirements || null,
    minCtc,
    maxCtc,
    hiringManagerId: input.hiringManagerId || null,
    recruiterId: input.recruiterId || null,
    closesOn: input.closesOn ? toDateOnly(new Date(input.closesOn)) : null,
    isPublic: input.isPublic === "on",
    status: input.status,
  };

  let jobId: string;

  if (input.id) {
    const existing = await db.jobPosting.findFirst({ where: { id: input.id } });
    if (!existing) return { error: "That job no longer exists." };

    await db.jobPosting.update({
      where: { id: input.id },
      data: {
        ...data,
        // The publish stamp is set once, the first time it goes live, so
        // "posted 3 weeks ago" doesn't reset every time someone fixes a typo.
        ...(input.status === "OPEN" && !existing.publishedAt
          ? { publishedAt: new Date() }
          : {}),
      },
    });
    jobId = input.id;
  } else {
    const created = await db.jobPosting.create({
      data: {
        orgId: session.org.id,
        ...data,
        createdById: session.user.id,
        publishedAt: input.status === "OPEN" ? new Date() : null,
      },
    });
    jobId = created.id;
  }

  await audit(session, {
    action: input.id ? "job.updated" : "job.created",
    entityType: "JobPosting",
    entityId: jobId,
    summary: `${input.id ? "Updated" : "Created"} "${input.title}" (${input.status.toLowerCase()})`,
  });

  revalidatePath("/hiring");
  revalidatePath(`/hiring/jobs/${jobId}`);
  redirect(`/hiring/jobs/${jobId}`);
}

/**
 * A URL-safe, per-organisation-unique slug for the careers page.
 *
 * Collisions get a numeric suffix rather than an error: two "Senior Engineer"
 * openings a year apart is normal, and making a recruiter invent a distinct
 * title to satisfy a database constraint would be the tail wagging the dog.
 */
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
      .slice(0, 60) || "role";

  for (let suffix = 0; suffix < 100; suffix++) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const clash = await rawDb.jobPosting.findFirst({
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

export async function deleteJobAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "job.manage");

  const db = orgDb(session.org.id);
  const job = await db.jobPosting.findFirst({
    where: { id },
    include: { _count: { select: { candidates: true } } },
  });
  if (!job) return { error: "That job no longer exists." };

  if (job._count.candidates > 0) {
    return {
      error: `${job._count.candidates} candidate${
        job._count.candidates === 1 ? " has" : "s have"
      } applied. Close the role instead — deleting it would erase their applications.`,
    };
  }

  await db.jobPosting.delete({ where: { id } });

  await audit(session, {
    action: "job.deleted",
    entityType: "JobPosting",
    entityId: id,
    summary: `Deleted "${job.title}"`,
  });

  revalidatePath("/hiring");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Candidates
// ---------------------------------------------------------------------------

const candidateSchema = z.object({
  id: z.string().optional(),
  jobPostingId: z.string().min(1, "Which role is this for?"),
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("That isn't an email address"),
  phone: z.string().trim().max(40).optional(),
  currentCompany: z.string().trim().max(120).optional(),
  currentCtc: z.string().optional(),
  expectedCtc: z.string().optional(),
  noticePeriodDays: z.string().optional(),
  skills: z.string().optional(),
  source: z.string().trim().max(40).optional(),
  resumeUrl: z.string().optional(),
  resumeText: z.string().max(200_000).optional(),
  ownerId: z.string().optional(),
});

const MAX_RESUME_BYTES = 4 * 1024 * 1024;

export async function saveCandidateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "candidate.manage");

  const parsed = candidateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  if (input.resumeUrl && input.resumeUrl.length > MAX_RESUME_BYTES) {
    return { fieldErrors: { resumeUrl: "That file is over 4 MB." } };
  }

  const db = orgDb(session.org.id);

  const job = await db.jobPosting.findFirst({
    where: { id: input.jobPostingId },
    select: { id: true, title: true, recruiterId: true },
  });
  if (!job) return { fieldErrors: { jobPostingId: "Unknown role." } };

  const clash = await db.candidate.findFirst({
    where: {
      jobPostingId: job.id,
      email: input.email,
      ...(input.id ? { NOT: { id: input.id } } : {}),
    },
  });
  if (clash) {
    return {
      fieldErrors: {
        email: "Someone has already applied for this role with that address.",
      },
    };
  }

  const data = {
    jobPostingId: job.id,
    firstName: input.firstName,
    lastName: input.lastName || "",
    email: input.email,
    phone: input.phone || null,
    currentCompany: input.currentCompany || null,
    currentCtc: input.currentCtc ? Number(input.currentCtc) : null,
    expectedCtc: input.expectedCtc ? Number(input.expectedCtc) : null,
    noticePeriodDays: input.noticePeriodDays
      ? Number(input.noticePeriodDays)
      : null,
    skills: input.skills
      ? input.skills.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40)
      : [],
    source: input.source || "direct",
    resumeUrl: input.resumeUrl || null,
    resumeText: input.resumeText || null,
    ownerId: input.ownerId || job.recruiterId || session.employee?.id || null,
  };

  let candidateId: string;

  if (input.id) {
    await db.candidate.update({ where: { id: input.id }, data });
    candidateId = input.id;
  } else {
    const created = await db.candidate.create({
      data: { orgId: session.org.id, ...data },
    });
    candidateId = created.id;

    await emitWebhook(session.org.id, "candidate.created", {
      candidateId,
      jobId: job.id,
      name: `${data.firstName} ${data.lastName}`.trim(),
    });
  }

  await audit(session, {
    action: input.id ? "candidate.updated" : "candidate.created",
    entityType: "Candidate",
    entityId: candidateId,
    summary: `${input.id ? "Updated" : "Added"} ${data.firstName} ${data.lastName} for "${job.title}"`,
  });

  revalidatePath(`/hiring/jobs/${job.id}`);
  revalidatePath(`/hiring/candidates/${candidateId}`);
  return { success: true };
}

export async function moveCandidateAction(
  candidateId: string,
  stage: "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER" | "HIRED" | "REJECTED",
  rejectionReason?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "candidate.manage");

  const db = orgDb(session.org.id);
  const candidate = await db.candidate.findFirst({
    where: { id: candidateId },
    include: { job: { select: { id: true, title: true, recruiterId: true } } },
  });
  if (!candidate) return { error: "That candidate no longer exists." };

  if (stage === "REJECTED" && !rejectionReason?.trim()) {
    return { error: "Record why — the next recruiter reading this will need it." };
  }

  // HIRED is set by converting an accepted offer, never by dragging a card.
  // Otherwise the employee record and the pipeline disagree about who joined.
  if (stage === "HIRED" && candidate.stage !== "OFFER") {
    return {
      error:
        "Move them through an offer first — hiring happens when an offer is accepted and converted.",
    };
  }

  await db.candidate.update({
    where: { id: candidateId },
    data: {
      stage,
      rejectionReason:
        stage === "REJECTED" ? (rejectionReason?.trim() ?? null) : null,
    },
  });

  await audit(session, {
    action: "candidate.moved",
    entityType: "Candidate",
    entityId: candidateId,
    summary: `${candidate.firstName} ${candidate.lastName}: ${candidate.stage} → ${stage}`,
  });

  if (candidate.ownerId && candidate.ownerId !== session.employee?.id) {
    const userId = await userIdForEmployee(candidate.ownerId);
    if (userId) {
      await notify({
        orgId: session.org.id,
        userId,
        type: "CANDIDATE_MOVED",
        title: `${candidate.firstName} ${candidate.lastName} → ${stage.toLowerCase()}`,
        body: candidate.job.title,
        linkUrl: `/hiring/candidates/${candidateId}`,
      });
    }
  }

  revalidatePath(`/hiring/jobs/${candidate.jobPostingId}`);
  revalidatePath(`/hiring/candidates/${candidateId}`);
  return { success: true };
}

export async function rateCandidateAction(
  candidateId: string,
  rating: number,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "candidate.manage");

  if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
    return { error: "Ratings run from 1 to 5." };
  }

  const db = orgDb(session.org.id);
  const candidate = await db.candidate.findFirst({ where: { id: candidateId } });
  if (!candidate) return { error: "That candidate no longer exists." };

  await db.candidate.update({
    where: { id: candidateId },
    data: { rating: rating === 0 ? null : rating },
  });

  revalidatePath(`/hiring/jobs/${candidate.jobPostingId}`);
  revalidatePath(`/hiring/candidates/${candidateId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

const interviewSchema = z.object({
  candidateId: z.string().min(1),
  title: z.string().trim().min(3, "Name the round").max(120),
  round: z.coerce.number().int().min(1).max(12),
  scheduledAt: z.string().min(1, "When is it?"),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  mode: z.enum(["video", "phone", "onsite"]),
  meetingUrl: z.string().trim().max(500).optional(),
  interviewerId: z.string().optional(),
});

export async function scheduleInterviewAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "interview.manage");

  const parsed = interviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const candidate = await db.candidate.findFirst({
    where: { id: input.candidateId },
    include: { job: { select: { id: true, title: true } } },
  });
  if (!candidate) return { error: "That candidate no longer exists." };

  const scheduledAt = new Date(input.scheduledAt);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { fieldErrors: { scheduledAt: "That isn't a valid date and time." } };
  }

  const interview = await db.interview.create({
    data: {
      orgId: session.org.id,
      candidateId: candidate.id,
      title: input.title,
      round: input.round,
      scheduledAt,
      durationMinutes: input.durationMinutes,
      mode: input.mode,
      meetingUrl: input.meetingUrl || null,
      interviewerId: input.interviewerId || null,
    },
  });

  // Scheduling an interview for someone still in screening moves them, because
  // that is unambiguously what has happened. This is the one implicit stage
  // change in the module, and it only ever moves forward by one step.
  if (candidate.stage === "APPLIED" || candidate.stage === "SCREENING") {
    await db.candidate.update({
      where: { id: candidate.id },
      data: { stage: "INTERVIEW" },
    });
  }

  await audit(session, {
    action: "interview.scheduled",
    entityType: "Interview",
    entityId: interview.id,
    summary: `Round ${input.round} for ${candidate.firstName} ${candidate.lastName} — ${input.title}`,
  });

  if (input.interviewerId) {
    const userId = await userIdForEmployee(input.interviewerId);
    if (userId) {
      await notify({
        orgId: session.org.id,
        userId,
        type: "INTERVIEW_SCHEDULED",
        title: `Interview: ${candidate.firstName} ${candidate.lastName}`,
        body: `${input.title} · ${candidate.job.title}`,
        linkUrl: `/hiring/candidates/${candidate.id}`,
      });
    }
  }

  revalidatePath(`/hiring/candidates/${candidate.id}`);
  revalidatePath(`/hiring/jobs/${candidate.jobPostingId}`);
  return { success: true };
}

const feedbackSchema = z.object({
  interviewId: z.string().min(1),
  outcome: z.enum(["STRONG_YES", "YES", "NO", "STRONG_NO"]),
  score: z.coerce.number().int().min(1).max(5).optional(),
  feedback: z
    .string()
    .trim()
    .min(20, "A sentence or two — a bare score tells the next round nothing")
    .max(5000),
});

export async function submitInterviewFeedbackAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "interview.feedback", "interview.manage");

  const parsed = feedbackSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const db = orgDb(session.org.id);
  const interview = await db.interview.findFirst({
    where: { id: parsed.data.interviewId },
    include: { candidate: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!interview) return { error: "That interview no longer exists." };

  // An interviewer scores their own rounds. Recruiters may fill in for anyone —
  // interviews get conducted on phones and written up by the coordinator.
  const isInterviewer = interview.interviewerId === session.employee?.id;
  if (!isInterviewer) {
    await assertPermission(session, "interview.manage");
  }

  await db.interview.update({
    where: { id: interview.id },
    data: {
      outcome: parsed.data.outcome,
      score: parsed.data.score ?? null,
      feedback: parsed.data.feedback,
      submittedAt: new Date(),
    },
  });

  await audit(session, {
    action: "interview.feedback.submitted",
    entityType: "Interview",
    entityId: interview.id,
    summary: `Scored ${interview.candidate.firstName} ${interview.candidate.lastName}: ${parsed.data.outcome}`,
  });

  revalidatePath(`/hiring/candidates/${interview.candidateId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

const offerSchema = z.object({
  candidateId: z.string().min(1),
  annualCtc: z.coerce.number().positive("What are we offering?").max(1_000_000_000),
  joiningDate: z.string().min(1, "When would they start?"),
  designation: z.string().trim().max(120).optional(),
  expiresOn: z.string().optional(),
  letterBody: z.string().trim().max(20_000).optional(),
});

export async function createOfferAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "offer.manage");

  const parsed = offerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const candidate = await db.candidate.findFirst({
    where: { id: input.candidateId },
    include: { job: { select: { id: true, title: true } } },
  });
  if (!candidate) return { error: "That candidate no longer exists." };

  const live = await db.offer.findFirst({
    where: {
      candidateId: candidate.id,
      status: { in: ["DRAFT", "SENT", "ACCEPTED"] },
    },
  });
  if (live) {
    return {
      error: "There is already a live offer for this candidate. Withdraw it first.",
    };
  }

  const offer = await db.offer.create({
    data: {
      orgId: session.org.id,
      candidateId: candidate.id,
      annualCtc: input.annualCtc,
      joiningDate: toDateOnly(new Date(input.joiningDate)),
      designation: input.designation || candidate.job.title,
      expiresOn: input.expiresOn ? toDateOnly(new Date(input.expiresOn)) : null,
      letterBody: input.letterBody || null,
      createdById: session.user.id,
      status: "DRAFT",
    },
  });

  await db.candidate.update({
    where: { id: candidate.id },
    data: { stage: "OFFER" },
  });

  await audit(session, {
    action: "offer.created",
    entityType: "Offer",
    entityId: offer.id,
    summary: `Drafted an offer for ${candidate.firstName} ${candidate.lastName} — ${input.annualCtc}`,
  });

  revalidatePath(`/hiring/candidates/${candidate.id}`);
  revalidatePath(`/hiring/jobs/${candidate.jobPostingId}`);
  return { success: true };
}

export async function decideOfferAction(
  offerId: string,
  status: "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN",
  reason?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "offer.manage");

  const db = orgDb(session.org.id);
  const offer = await db.offer.findFirst({
    where: { id: offerId },
    include: {
      candidate: {
        select: { id: true, firstName: true, lastName: true, jobPostingId: true },
      },
    },
  });
  if (!offer) return { error: "That offer no longer exists." };

  await db.offer.update({
    where: { id: offerId },
    data: {
      status,
      ...(status === "SENT" ? { sentAt: new Date() } : {}),
      ...(status === "ACCEPTED" || status === "DECLINED"
        ? { respondedAt: new Date() }
        : {}),
      ...(status === "DECLINED" ? { declineReason: reason?.trim() || null } : {}),
    },
  });

  // A declined or withdrawn offer sends the candidate back out of the pipeline;
  // an accepted one waits at OFFER until it is converted to an employee.
  if (status === "DECLINED" || status === "WITHDRAWN") {
    await db.candidate.update({
      where: { id: offer.candidateId },
      data: {
        stage: "REJECTED",
        rejectionReason:
          reason?.trim() ||
          (status === "DECLINED" ? "Declined our offer" : "Offer withdrawn"),
      },
    });
  }

  await audit(session, {
    action: "offer.decided",
    entityType: "Offer",
    entityId: offerId,
    summary: `Offer for ${offer.candidate.firstName} ${offer.candidate.lastName} → ${status.toLowerCase()}`,
  });

  revalidatePath(`/hiring/candidates/${offer.candidateId}`);
  revalidatePath(`/hiring/jobs/${offer.candidate.jobPostingId}`);
  return { success: true };
}

/**
 * Turning an accepted offer into an employee.
 *
 * This is the join the schema comment on `Offer.employeeId` describes: it is
 * what makes "time to hire" answerable without anyone reconciling two systems
 * by hand. It writes the employee, links the offer, marks the candidate hired
 * and — if the org has a default onboarding checklist — starts it, all in one
 * transaction, because a half-created joiner is worse than none.
 */
export async function convertOfferAction(offerId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "offer.manage");
  await assertPermission(session, "employee.create");

  const db = orgDb(session.org.id);
  const offer = await db.offer.findFirst({
    where: { id: offerId },
    include: {
      candidate: {
        include: {
          job: {
            select: {
              title: true,
              departmentId: true,
              locationId: true,
              employmentType: true,
              hiringManagerId: true,
            },
          },
        },
      },
    },
  });

  if (!offer) return { error: "That offer no longer exists." };
  if (offer.status !== "ACCEPTED") {
    return { error: "Only an accepted offer can be converted." };
  }
  if (offer.employeeId) {
    return { error: "This offer has already been converted." };
  }

  const { candidate } = offer;

  const existing = await db.employee.findFirst({
    where: { workEmail: candidate.email },
  });
  if (existing) {
    return {
      error: `${candidate.email} is already on an employee record. Link them by hand instead.`,
    };
  }

  const [designation, employeeCode] = await Promise.all([
    db.designation.findFirst({
      where: { title: offer.designation ?? candidate.job.title },
      select: { id: true },
    }),
    nextEmployeeCode(session.org.id),
  ]);

  const result = await rawDb.$transaction(async (tx) => {
    const employee = await tx.employee.create({
      data: {
        orgId: session.org.id,
        employeeCode,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        workEmail: candidate.email,
        personalEmail: candidate.email,
        phone: candidate.phone,
        departmentId: candidate.job.departmentId,
        designationId: designation?.id ?? null,
        locationId: candidate.job.locationId,
        managerId: candidate.job.hiringManagerId,
        employmentType: candidate.job.employmentType,
        // INVITED, not ACTIVE: they have accepted, not arrived. Attendance and
        // leave should not start counting before their first day.
        status: "INVITED",
        dateOfJoining: offer.joiningDate,
        ctcAnnual: offer.annualCtc,
      },
    });

    await tx.offer.update({
      where: { id: offerId },
      data: { employeeId: employee.id },
    });

    await tx.candidate.update({
      where: { id: candidate.id },
      data: { stage: "HIRED" },
    });

    // Onboarding starts itself if there is a default checklist to start.
    const template = await tx.checklistTemplate.findFirst({
      where: { orgId: session.org.id, kind: "ONBOARDING", isActive: true },
      orderBy: { isDefault: "desc" },
      include: { items: { orderBy: { sortdex: "asc" } } },
    });

    if (template && template.items.length > 0) {
      const instance = await tx.checklistInstance.create({
        data: {
          orgId: session.org.id,
          employeeId: employee.id,
          templateId: template.id,
          kind: "ONBOARDING",
          name: template.name,
          anchorDate: offer.joiningDate,
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
          assigneeId:
            item.category === "Manager" ? candidate.job.hiringManagerId : null,
          dueDate: addDaysUtc(offer.joiningDate, item.offsetDays),
          sortdex: index,
        })),
      });
    }

    return employee;
  });

  await audit(session, {
    action: "offer.converted",
    entityType: "Employee",
    entityId: result.id,
    summary: `${candidate.firstName} ${candidate.lastName} hired as ${employeeCode}, joining ${offer.joiningDate.toISOString().slice(0, 10)}`,
  });

  await emitWebhook(session.org.id, "candidate.hired", {
    candidateId: candidate.id,
    employeeId: result.id,
    joiningDate: offer.joiningDate.toISOString().slice(0, 10),
  });

  await emitWebhook(session.org.id, "employee.created", {
    employeeId: result.id,
    employeeCode,
    name: `${candidate.firstName} ${candidate.lastName}`.trim(),
  });

  revalidatePath("/people");
  revalidatePath("/journeys");
  revalidatePath(`/hiring/candidates/${candidate.id}`);
  redirect(`/people/${result.id}`);
}

/** Next free EMP-nnn, matching the format the employee module already uses. */
async function nextEmployeeCode(orgId: string): Promise<string> {
  const latest = await rawDb.employee.findFirst({
    where: { orgId, employeeCode: { startsWith: "EMP" } },
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });

  const current = latest ? Number(latest.employeeCode.replace(/\D/g, "")) : 0;
  return `EMP${String((Number.isFinite(current) ? current : 0) + 1).padStart(3, "0")}`;
}

function addDaysUtc(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

// ---------------------------------------------------------------------------
// Public applications
// ---------------------------------------------------------------------------

const applySchema = z.object({
  jobId: z.string().min(1),
  firstName: z.string().trim().min(1, "Your first name").max(80),
  lastName: z.string().trim().max(80).optional(),
  email: z.string().trim().toLowerCase().email("That isn't an email address"),
  phone: z.string().trim().max(40).optional(),
  currentCompany: z.string().trim().max(120).optional(),
  expectedCtc: z.string().optional(),
  noticePeriodDays: z.string().optional(),
  coverNote: z.string().trim().max(3000).optional(),
  resumeUrl: z.string().optional(),
  resumeText: z.string().max(200_000).optional(),
});

/**
 * An application from the public careers page.
 *
 * The only unauthenticated write in the app, so it is narrow on purpose: it can
 * create exactly one row, on a job that is verified OPEN and public, in the
 * organisation that owns that job. The candidate cannot choose their stage,
 * their owner, or which tenant they land in.
 */
export async function applyToJobAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = applySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  if (input.resumeUrl && input.resumeUrl.length > MAX_RESUME_BYTES) {
    return { fieldErrors: { resumeUrl: "That file is over 4 MB." } };
  }

  const job = await rawDb.jobPosting.findFirst({
    where: { id: input.jobId, status: "OPEN", isPublic: true },
    select: {
      id: true,
      orgId: true,
      title: true,
      recruiterId: true,
      closesOn: true,
    },
  });

  if (!job) {
    return { error: "That role is no longer accepting applications." };
  }
  if (job.closesOn && job.closesOn < today()) {
    return { error: "Applications for that role have closed." };
  }

  const existing = await rawDb.candidate.findFirst({
    where: { jobPostingId: job.id, email: input.email },
    select: { id: true },
  });
  if (existing) {
    return {
      error:
        "You have already applied for this role. We have your application — no need to send it twice.",
    };
  }

  const candidate = await rawDb.candidate.create({
    data: {
      orgId: job.orgId,
      jobPostingId: job.id,
      firstName: input.firstName,
      lastName: input.lastName || "",
      email: input.email,
      phone: input.phone || null,
      currentCompany: input.currentCompany || null,
      expectedCtc: input.expectedCtc ? Number(input.expectedCtc) : null,
      noticePeriodDays: input.noticePeriodDays
        ? Number(input.noticePeriodDays)
        : null,
      resumeUrl: input.resumeUrl || null,
      resumeText: [input.coverNote, input.resumeText]
        .filter(Boolean)
        .join("\n\n---\n\n") || null,
      source: "careers-page",
      stage: "APPLIED",
      ownerId: job.recruiterId,
    },
  });

  await audit(null, {
    action: "candidate.created",
    entityType: "Candidate",
    entityId: candidate.id,
    summary: `${input.firstName} ${input.lastName ?? ""} applied for "${job.title}" through the careers page`,
  }, job.orgId);

  if (job.recruiterId) {
    const userId = await userIdForEmployee(job.recruiterId);
    if (userId) {
      await notify({
        orgId: job.orgId,
        userId,
        type: "CANDIDATE_MOVED",
        title: `New application: ${input.firstName} ${input.lastName ?? ""}`.trim(),
        body: job.title,
        linkUrl: `/hiring/candidates/${candidate.id}`,
      });
    }
  }

  await emitWebhook(job.orgId, "candidate.created", {
    candidateId: candidate.id,
    jobId: job.id,
    source: "careers-page",
  });

  return { success: true };
}
