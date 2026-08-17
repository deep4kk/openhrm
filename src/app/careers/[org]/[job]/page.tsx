import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, MapPin } from "lucide-react";

import { publicJob, publicOrgBySlug } from "@/lib/queries/hiring";
import { renderMarkdown } from "@/lib/documents/markdown";
import { formatDate } from "@/lib/dates";
import { ApplyForm } from "@/components/hiring/apply-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string; job: string }>;
}): Promise<Metadata> {
  const { org: orgSlug, job: jobSlug } = await params;
  const org = await publicOrgBySlug(orgSlug);
  if (!org) return { title: "Role" };

  const job = await publicJob(org.id, jobSlug);
  return {
    title: job ? `${job.title} · ${org.name}` : "Role",
    description: job?.description.slice(0, 160),
  };
}

const TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full time",
  PART_TIME: "Part time",
  CONTRACT: "Contract",
  INTERN: "Internship",
  CONSULTANT: "Consultant",
};

/**
 * One public advert, with the application form beneath it.
 *
 * The form is on the same page rather than behind a "Apply now" route: every
 * extra navigation between reading a job and applying for it loses candidates,
 * and there is nothing on an application form worth a page load of its own.
 *
 * Note what is *not* rendered here — the salary band. It is on the posting for
 * the hiring team's benefit and is deliberately never selected by `publicJob`.
 */
export default async function PublicJobPage({
  params,
}: {
  params: Promise<{ org: string; job: string }>;
}) {
  const { org: orgSlug, job: jobSlug } = await params;

  const org = await publicOrgBySlug(orgSlug);
  if (!org) notFound();

  const job = await publicJob(org.id, jobSlug);
  if (!job) notFound();

  return (
    <div className="space-y-8">
      <Link
        href={`/careers/${org.slug}`}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        All roles
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{job.title}</h1>
        <p className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          {job.department && <span>{job.department.name}</span>}
          {job.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="size-3.5" aria-hidden />
              {[job.location.city, job.location.state]
                .filter(Boolean)
                .join(", ") || job.location.name}
            </span>
          )}
          <span>{TYPE_LABELS[job.employmentType] ?? job.employmentType}</span>
          {job.openings > 1 && <span>{job.openings} openings</span>}
          {job.closesOn && (
            <span className="tabular-nums">
              Applications close {formatDate(job.closesOn)}
            </span>
          )}
        </p>
      </header>

      <article
        className="prose-letter"
        // Escaped before any markup is inserted — see src/lib/documents/markdown.ts.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(job.description) }}
      />

      {job.requirements && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">What we&apos;re looking for</h2>
          <article
            className="prose-letter"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(job.requirements) }}
          />
        </section>
      )}

      <section className="surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Apply</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Takes a minute. We read every application.
        </p>
        <ApplyForm jobId={job.id} jobTitle={job.title} className="mt-6" />
      </section>
    </div>
  );
}
