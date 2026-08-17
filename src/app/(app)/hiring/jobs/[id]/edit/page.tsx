import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { getJob } from "@/lib/queries/hiring";
import { PageHeader, PageShell } from "@/components/page-header";
import { JobForm } from "@/components/hiring/job-form";
import { DeleteJobButton } from "@/components/hiring/delete-job-button";

export const metadata: Metadata = { title: "Edit role" };

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("job.manage");
  const { id } = await params;

  const job = await getJob(session, id);
  if (!job) notFound();

  const db = orgDb(session.org.id);
  const [departments, locations, employees] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.location.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.employee.findMany({
      where: { status: { not: "EXITED" } },
      orderBy: [{ firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  return (
    <PageShell className="max-w-3xl">
      <Link
        href={`/hiring/jobs/${job.id}`}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {job.title}
      </Link>

      <PageHeader title="Edit role" />

      <JobForm
        currency={session.org.currency}
        departments={departments}
        locations={locations}
        employees={employees.map((e) => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
        }))}
        job={{
          id: job.id,
          title: job.title,
          departmentId: job.departmentId ?? "",
          locationId: job.locationId ?? "",
          employmentType: job.employmentType,
          openings: String(job.openings),
          description: job.description,
          requirements: job.requirements ?? "",
          minCtc: job.minCtc ? String(job.minCtc) : "",
          maxCtc: job.maxCtc ? String(job.maxCtc) : "",
          hiringManagerId: job.hiringManagerId ?? "",
          recruiterId: job.recruiterId ?? "",
          closesOn: job.closesOn ? job.closesOn.toISOString().slice(0, 10) : "",
          isPublic: job.isPublic,
          status: job.status,
        }}
      />

      {job.candidates.length === 0 && (
        <div className="flex justify-end border-t pt-4">
          <DeleteJobButton id={job.id} title={job.title} />
        </div>
      )}
    </PageShell>
  );
}
