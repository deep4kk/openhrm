import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";

import { publicJobs, publicOrgBySlug } from "@/lib/queries/hiring";
import { formatDate } from "@/lib/dates";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string }>;
}): Promise<Metadata> {
  const { org: slug } = await params;
  const org = await publicOrgBySlug(slug);
  return {
    title: org ? `Careers at ${org.name}` : "Careers",
    description: org?.loginTagline ?? undefined,
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
 * The public list of open roles.
 *
 * Only OPEN and public postings are queried — see the comment on `publicJobs`.
 * There is nothing here that varies per visitor, so it renders as a plain
 * server component with no session lookup at all.
 */
export default async function CareersPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: slug } = await params;
  const org = await publicOrgBySlug(slug);
  if (!org) notFound();

  const jobs = await publicJobs(org.id);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Open roles at {org.name}
        </h1>
        <p className="text-muted-foreground measure mt-2 text-sm">
          {org.loginTagline ??
            `${jobs.length === 0 ? "No" : jobs.length} role${
              jobs.length === 1 ? "" : "s"
            } open right now.`}
        </p>
      </header>

      {jobs.length === 0 ? (
        <div className="surface p-10 text-center">
          <p className="text-sm font-medium">Nothing open at the moment</p>
          <p className="text-muted-foreground mt-1.5 text-sm">
            Check back soon — or write to us if you think you would be a good
            fit anyway.
          </p>
        </div>
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {jobs.map((job) => (
            <li key={job.id}>
              <Link
                href={`/careers/${org.slug}/${job.slug}`}
                className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-5 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{job.title}</p>
                  <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    {job.department && <span>{job.department.name}</span>}
                    {job.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {job.location.city ?? job.location.name}
                      </span>
                    )}
                    <span>{TYPE_LABELS[job.employmentType] ?? job.employmentType}</span>
                    {job.openings > 1 && <span>{job.openings} openings</span>}
                  </p>
                </div>

                {job.publishedAt && (
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    Posted {formatDate(job.publishedAt)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
