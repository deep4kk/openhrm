import type { Metadata } from "next";
import Link from "next/link";
import { Briefcase, ExternalLink, Plus } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { hiringSummary, listJobs } from "@/lib/queries/hiring";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { LinkButton } from "@/components/link-button";
import { JobStatusBadge } from "@/components/hiring/hiring-bits";

export const metadata: Metadata = { title: "Hiring" };

/**
 * Open roles, with their pipelines summarised on each row.
 *
 * The number that matters on this screen is not "how many candidates" but "how
 * many are actually moving" — so each row breaks its pipeline into stages
 * rather than showing one total. A role with forty applicants and nobody in
 * interview is a role in trouble, and a single count hides that completely.
 */
export default async function HiringPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requirePermission("job.read", "job.manage", "candidate.read");
  const filters = await searchParams;

  const [jobs, summary] = await Promise.all([
    listJobs(session, { q: filters.q, status: filters.status ?? "live" }),
    hiringSummary(session),
  ]);

  const mayManage = can(session, "job.manage");

  return (
    <PageShell>
      <PageHeader
        title="Hiring"
        description="Open roles, their pipelines, and where each candidate has got to."
        actions={
          <>
            <LinkButton
              href={`/careers/${session.org.slug}`}
              variant="outline"
              target="_blank"
            >
              <ExternalLink className="size-4" aria-hidden />
              Careers page
            </LinkButton>
            {mayManage && (
              <LinkButton href="/hiring/jobs/new">
                <Plus className="size-4" aria-hidden />
                New role
              </LinkButton>
            )}
          </>
        }
      />

      <StatRow>
        <StatTile
          label="Open roles"
          value={summary.openRoles}
          detail={`${summary.openings} position${summary.openings === 1 ? "" : "s"} to fill`}
        />
        <StatTile
          label="In the pipeline"
          value={summary.inPipeline}
          detail={`${summary.interviewing} interviewing`}
          tone="info"
        />
        <StatTile
          label="Offers out"
          value={summary.offersOut}
          detail="awaiting an answer"
          tone={summary.offersOut > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Median time to hire"
          value={
            summary.medianDaysToHire === null
              ? "—"
              : `${summary.medianDaysToHire}d`
          }
          detail={`${summary.hired} hired all time`}
          tone="positive"
        />
      </StatRow>

      <FilterBar
        searchPlaceholder="Search job titles"
        searchLabel="Search roles"
        count={jobs.length}
        countNoun={["role", "roles"]}
        selects={[
          {
            key: "status",
            label: "Filter by status",
            options: [
              { value: "live", label: "Live roles" },
              { value: "all", label: "Everything" },
              { value: "DRAFT", label: "Draft" },
              { value: "OPEN", label: "Open" },
              { value: "ON_HOLD", label: "On hold" },
              { value: "CLOSED", label: "Closed" },
              { value: "FILLED", label: "Filled" },
            ],
          },
        ]}
      />

      <div className="surface overflow-hidden">
        {jobs.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No roles open"
            description={
              mayManage
                ? "Post a role and it appears on your public careers page. Applications land straight in the pipeline."
                : "Nothing is being recruited for right now."
            }
            action={
              mayManage ? (
                <LinkButton href="/hiring/jobs/new">Post the first role</LinkButton>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y">
            {jobs.map((job) => {
              const stages = countStages(job.candidates);
              return (
                <li key={job.id}>
                  <Link
                    href={`/hiring/jobs/${job.id}`}
                    className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                  >
                    <div className="min-w-[14rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{job.title}</p>
                        <JobStatusBadge status={job.status} />
                        {!job.isPublic && (
                          <span className="text-muted-foreground text-xs">
                            internal
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {[
                          job.department?.name,
                          job.location?.name,
                          `${job.openings} opening${job.openings === 1 ? "" : "s"}`,
                          job.recruiter
                            ? `${job.recruiter.firstName} recruiting`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>

                    <dl className="flex shrink-0 gap-4 text-xs">
                      <Stage label="Applied" value={stages.APPLIED} />
                      <Stage label="Screening" value={stages.SCREENING} />
                      <Stage label="Interview" value={stages.INTERVIEW} />
                      <Stage label="Offer" value={stages.OFFER} />
                      <Stage label="Hired" value={stages.HIRED} />
                    </dl>

                    <span className="text-muted-foreground w-24 shrink-0 text-right text-xs tabular-nums">
                      {job.publishedAt
                        ? formatDate(job.publishedAt)
                        : "not posted"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}

function Stage({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <dt className="text-muted-foreground text-[10px]">{label}</dt>
      <dd
        className={
          value > 0
            ? "text-sm font-medium tabular-nums"
            : "text-muted-foreground/50 text-sm tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function countStages(candidates: { stage: string }[]) {
  const counts = {
    APPLIED: 0,
    SCREENING: 0,
    INTERVIEW: 0,
    OFFER: 0,
    HIRED: 0,
    REJECTED: 0,
  };
  for (const candidate of candidates) {
    if (candidate.stage in counts) {
      counts[candidate.stage as keyof typeof counts] += 1;
    }
  }
  return counts;
}
