import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, Mail, Phone } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { getCandidate } from "@/lib/queries/hiring";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { Field } from "@/components/settings/panel";
import { StageBadge } from "@/components/hiring/hiring-bits";
import { CandidateRating } from "@/components/hiring/candidate-rating";
import { InterviewPanel } from "@/components/hiring/interview-panel";
import { OfferPanel } from "@/components/hiring/offer-panel";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission("candidate.read", "candidate.manage");
  const { id } = await params;
  const candidate = await getCandidate(session, id);
  return {
    title: candidate
      ? `${candidate.firstName} ${candidate.lastName}`.trim()
      : "Candidate",
  };
}

/**
 * One candidate, end to end.
 *
 * Everything a hiring decision needs on one page: what they told us, what each
 * interviewer thought, and what we offered. The scorecards are shown in full
 * rather than summarised to a verdict, because the sentence an interviewer
 * wrote is the thing that changes a debrief — the "yes/no" almost never does.
 */
export default async function CandidatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("candidate.read", "candidate.manage");
  const { id } = await params;

  const candidate = await getCandidate(session, id);
  if (!candidate) notFound();

  const mayManage = can(session, "candidate.manage");
  const name = `${candidate.firstName} ${candidate.lastName}`.trim();

  const interviewers =
    can(session, "interview.manage")
      ? await orgDb(session.org.id).employee.findMany({
          where: { status: { not: "EXITED" } },
          orderBy: [{ firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true },
        })
      : [];

  return (
    <PageShell className="max-w-5xl">
      <Link
        href={`/hiring/jobs/${candidate.jobPostingId}`}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {candidate.job.title}
      </Link>

      <div className="surface flex flex-wrap items-start gap-4 p-5">
        <PersonAvatar
          firstName={candidate.firstName}
          lastName={candidate.lastName}
          size="lg"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{name}</h1>
            <StageBadge stage={candidate.stage} />
          </div>

          <p className="text-muted-foreground mt-1 text-sm">
            {candidate.currentCompany ?? "No current employer recorded"}
            {" · applied "}
            {formatRelative(candidate.appliedAt)}
            {" via "}
            {candidate.source}
          </p>

          <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
            <a
              href={`mailto:${candidate.email}`}
              className="hover:text-foreground inline-flex items-center gap-1.5"
            >
              <Mail className="size-3.5" aria-hidden />
              {candidate.email}
            </a>
            {candidate.phone && (
              <a
                href={`tel:${candidate.phone}`}
                className="hover:text-foreground inline-flex items-center gap-1.5"
              >
                <Phone className="size-3.5" aria-hidden />
                {candidate.phone}
              </a>
            )}
            {candidate.resumeUrl && (
              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
              >
                Resume
                <ExternalLink className="size-3" aria-hidden />
              </a>
            )}
          </div>

          {candidate.skills.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {candidate.skills.map((skill) => (
                <li
                  key={skill}
                  className="bg-muted rounded-md px-2 py-0.5 text-xs"
                >
                  {skill}
                </li>
              ))}
            </ul>
          )}
        </div>

        <CandidateRating
          candidateId={candidate.id}
          rating={candidate.rating}
          canRate={mayManage}
        />
      </div>

      {candidate.rejectionReason && (
        <div className="surface p-4">
          <p className="text-muted-foreground text-xs">Why we passed</p>
          <p className="measure mt-1 text-sm">{candidate.rejectionReason}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-6">
          <InterviewPanel
            candidateId={candidate.id}
            candidateName={name}
            canSchedule={can(session, "interview.manage")}
            canGiveFeedback={
              can(session, "interview.feedback") || can(session, "interview.manage")
            }
            interviewers={interviewers.map((i) => ({
              id: i.id,
              name: `${i.firstName} ${i.lastName}`,
            }))}
            interviews={candidate.interviews.map((interview) => ({
              id: interview.id,
              round: interview.round,
              title: interview.title,
              scheduledLabel: `${formatDate(interview.scheduledAt)}, ${interview.scheduledAt.toLocaleTimeString(
                "en-GB",
                { hour: "2-digit", minute: "2-digit", timeZone: session.org.timezone },
              )}`,
              durationMinutes: interview.durationMinutes,
              mode: interview.mode,
              meetingUrl: interview.meetingUrl,
              outcome: interview.outcome,
              score: interview.score,
              feedback: interview.feedback,
              interviewerName: interview.interviewer
                ? `${interview.interviewer.firstName} ${interview.interviewer.lastName}`
                : null,
              isMine: interview.interviewerId === session.employee?.id,
            }))}
          />

          {can(session, "offer.manage") && (
            <OfferPanel
              candidateId={candidate.id}
              candidateName={name}
              suggestedDesignation={candidate.job.title}
              currency={session.org.currency}
              canManage
              canCreateEmployee={can(session, "employee.create")}
              offers={candidate.offers.map((offer) => ({
                id: offer.id,
                status: offer.status,
                annualCtc: Number(offer.annualCtc),
                designation: offer.designation,
                joiningLabel: formatDate(offer.joiningDate),
                expiresLabel: offer.expiresOn ? formatDate(offer.expiresOn) : null,
                sentLabel: offer.sentAt ? formatDate(offer.sentAt) : null,
                respondedLabel: offer.respondedAt
                  ? formatDate(offer.respondedAt)
                  : null,
                declineReason: offer.declineReason,
                convertedEmployeeId: offer.employeeId,
              }))}
            />
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Details</h2>
            <dl className="space-y-3">
              <Field label="Role" value={candidate.job.title} />
              <Field
                label="Department"
                value={candidate.job.department?.name}
              />
              <Field
                label="Owner"
                value={
                  candidate.owner
                    ? `${candidate.owner.firstName} ${candidate.owner.lastName}`
                    : null
                }
              />
              <Field
                label="Current CTC"
                value={
                  candidate.currentCtc
                    ? formatMoney(candidate.currentCtc, session.org.currency)
                    : null
                }
              />
              <Field
                label="Expected CTC"
                value={
                  candidate.expectedCtc
                    ? formatMoney(candidate.expectedCtc, session.org.currency)
                    : null
                }
              />
              <Field
                label="Notice period"
                value={
                  candidate.noticePeriodDays
                    ? `${candidate.noticePeriodDays} days`
                    : null
                }
              />
              <Field label="Applied" value={formatDate(candidate.appliedAt)} />
            </dl>
          </div>

          {candidate.resumeText && (
            <details className="surface p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Resume text
              </summary>
              <p className="text-muted-foreground mt-3 max-h-96 overflow-y-auto text-xs whitespace-pre-wrap">
                {candidate.resumeText}
              </p>
            </details>
          )}
        </aside>
      </div>
    </PageShell>
  );
}
