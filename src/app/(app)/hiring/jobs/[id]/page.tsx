import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, Pencil } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { getJob } from "@/lib/queries/hiring";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { JobStatusBadge } from "@/components/hiring/hiring-bits";
import { PipelineBoard } from "@/components/hiring/pipeline-board";
import { AddCandidateDialog } from "@/components/hiring/add-candidate-dialog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission("job.read", "job.manage", "candidate.read");
  const { id } = await params;
  const job = await getJob(session, id);
  return { title: job?.title ?? "Role" };
}

/**
 * One role and its pipeline.
 *
 * The board is the page. Everything above it — band, owner, location — is the
 * context a recruiter needs while working the board, compressed into one line
 * each so it never pushes the columns below the fold.
 */
export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "job.read",
    "job.manage",
    "candidate.read",
  );

  const { id } = await params;
  const job = await getJob(session, id);
  if (!job) notFound();

  const mayManageCandidates = can(session, "candidate.manage");

  const owners = mayManageCandidates
    ? await orgDb(session.org.id).employee.findMany({
        where: { status: { not: "EXITED" } },
        orderBy: [{ firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      })
    : [];

  return (
    <PageShell>
      <Link
        href="/hiring"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Hiring
      </Link>

      <PageHeader
        title={job.title}
        description={[
          job.department?.name,
          job.location?.name,
          `${job.openings} opening${job.openings === 1 ? "" : "s"}`,
          job.employmentType.toLowerCase().replace("_", " "),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {job.status === "OPEN" && job.isPublic && (
              <LinkButton
                href={`/careers/${session.org.slug}/${job.slug}`}
                variant="outline"
                target="_blank"
              >
                <ExternalLink className="size-4" aria-hidden />
                View advert
              </LinkButton>
            )}
            {mayManageCandidates && (
              <AddCandidateDialog
                jobId={job.id}
                jobTitle={job.title}
                owners={owners.map((o) => ({
                  id: o.id,
                  name: `${o.firstName} ${o.lastName}`,
                }))}
              />
            )}
            {can(session, "job.manage") && (
              <LinkButton href={`/hiring/jobs/${job.id}/edit`} variant="outline">
                <Pencil className="size-4" aria-hidden />
                Edit
              </LinkButton>
            )}
          </>
        }
      />

      <div className="surface flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
        <JobStatusBadge status={job.status} />
        {(job.minCtc || job.maxCtc) && (
          <span className="tabular-nums">
            {job.minCtc ? formatMoney(job.minCtc, session.org.currency) : "—"}
            {" – "}
            {job.maxCtc ? formatMoney(job.maxCtc, session.org.currency) : "—"}
            <span className="text-muted-foreground ml-1.5 text-xs">
              internal band
            </span>
          </span>
        )}
        {job.hiringManager && (
          <span className="text-muted-foreground text-xs">
            Hiring manager: {job.hiringManager.firstName}{" "}
            {job.hiringManager.lastName}
          </span>
        )}
        {job.recruiter && (
          <span className="text-muted-foreground text-xs">
            Recruiter: {job.recruiter.firstName} {job.recruiter.lastName}
          </span>
        )}
        {job.closesOn && (
          <span className="text-muted-foreground text-xs tabular-nums">
            Closes {formatDate(job.closesOn)}
          </span>
        )}
      </div>

      <PipelineBoard
        canManage={mayManageCandidates}
        candidates={job.candidates.map((candidate) => ({
          id: candidate.id,
          firstName: candidate.firstName,
          lastName: candidate.lastName,
          stage: candidate.stage,
          rating: candidate.rating,
          currentCompany: candidate.currentCompany,
          skills: candidate.skills,
          interviewCount: candidate.interviews.length,
          pendingFeedback: candidate.interviews.filter(
            (i) => i.outcome === "PENDING",
          ).length,
          appliedLabel: `applied ${formatRelative(candidate.appliedAt)}`,
          offerStatus: candidate.offers[0]?.status ?? null,
        }))}
      />
    </PageShell>
  );
}
