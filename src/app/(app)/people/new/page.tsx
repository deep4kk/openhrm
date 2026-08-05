import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import {
  getManagerOptions,
  getOrgOptions,
  nextEmployeeCode,
} from "@/lib/queries/employees";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmployeeForm } from "@/components/people/employee-form";

export const metadata: Metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const session = await requirePermission("employee.create");

  const [options, managers, code] = await Promise.all([
    getOrgOptions(session),
    getManagerOptions(session),
    nextEmployeeCode(session),
  ]);

  return (
    <PageShell className="max-w-5xl">
      <Link
        href="/people"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        People
      </Link>

      <PageHeader
        title="Add employee"
        description="Create the record now; you can fill in the rest later. Only name, work email, code and joining date are required."
      />

      <div className="surface p-6">
        <EmployeeForm
          mode="create"
          values={{
            employeeCode: code,
            dateOfJoining: new Date().toISOString().slice(0, 10),
          }}
          options={{
            departments: options.departments.map((d) => ({
              id: d.id,
              label: d.name,
            })),
            designations: options.designations.map((d) => ({
              id: d.id,
              label: d.title,
            })),
            locations: options.locations.map((l) => ({
              id: l.id,
              label: l.name,
            })),
            shifts: options.shifts.map((s) => ({
              id: s.id,
              label: `${s.name} · ${s.startTime}–${s.endTime}`,
            })),
            managers: managers.map((m) => ({
              id: m.id,
              label: `${m.firstName} ${m.lastName}${
                m.designation ? ` · ${m.designation.title}` : ""
              }`,
            })),
          }}
          canSeeCompensation={can(session, "employee.compensation.read")}
          canSeeSensitive={can(session, "employee.sensitive.read")}
          canInvite={can(session, "user.invite")}
          currency={session.org.currency}
        />
      </div>
    </PageShell>
  );
}
