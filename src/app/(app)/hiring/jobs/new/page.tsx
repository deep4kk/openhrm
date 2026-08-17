import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { PageHeader, PageShell } from "@/components/page-header";
import { JobForm } from "@/components/hiring/job-form";

export const metadata: Metadata = { title: "New role" };

export default async function NewJobPage() {
  const session = await requirePermission("job.manage");
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
        href="/hiring"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Hiring
      </Link>

      <PageHeader
        title="New role"
        description="Save it as a draft while it's being agreed, then open it — that's the moment it appears on the careers page."
      />

      <JobForm
        currency={session.org.currency}
        departments={departments}
        locations={locations}
        employees={employees.map((e) => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
        }))}
      />
    </PageShell>
  );
}
