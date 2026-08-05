import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireAuth, can } from "@/lib/auth";
import {
  getEmployee,
  getManagerOptions,
  getOrgOptions,
} from "@/lib/queries/employees";
import { canReachEmployee } from "@/lib/scope";
import { PageHeader, PageShell } from "@/components/page-header";
import { EmployeeForm } from "@/components/people/employee-form";

export const metadata: Metadata = { title: "Edit employee" };

export default async function EditEmployeePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  const isSelf = session.employee?.id === id;
  const inScope = await canReachEmployee(session, "employee.read", id);

  const allowed =
    (isSelf && can(session, "employee.update.self")) ||
    (can(session, "employee.update") && inScope);

  if (!allowed) redirect("/denied");

  const [employee, options, managers] = await Promise.all([
    getEmployee(session, id),
    getOrgOptions(session),
    getManagerOptions(session),
  ]);

  if (!employee) notFound();

  return (
    <PageShell className="max-w-5xl">
      <Link
        href={`/people/${id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {employee.firstName} {employee.lastName}
      </Link>

      <PageHeader
        title="Edit employee"
        description={
          can(session, "employee.update")
            ? "Changes to job details, compensation and bank information are recorded in the audit log."
            : "You can update your own contact and personal details. Job details are managed by HR."
        }
      />

      <div className="surface p-6">
        <EmployeeForm
          mode="edit"
          values={{
            id: employee.id,
            firstName: employee.firstName,
            lastName: employee.lastName,
            workEmail: employee.workEmail,
            personalEmail: employee.personalEmail ?? undefined,
            employeeCode: employee.employeeCode,
            phone: employee.phone ?? undefined,
            dateOfBirth: employee.dateOfBirth?.toISOString().slice(0, 10),
            gender: employee.gender ?? undefined,
            bloodGroup: employee.bloodGroup ?? undefined,
            dateOfJoining: employee.dateOfJoining.toISOString().slice(0, 10),
            departmentId: employee.departmentId ?? undefined,
            designationId: employee.designationId ?? undefined,
            locationId: employee.locationId ?? undefined,
            managerId: employee.managerId ?? undefined,
            shiftId: employee.shiftId ?? undefined,
            employmentType: employee.employmentType,
            addressLine1: employee.addressLine1 ?? undefined,
            city: employee.city ?? undefined,
            state: employee.state ?? undefined,
            postalCode: employee.postalCode ?? undefined,
            emergencyContactName: employee.emergencyContactName ?? undefined,
            emergencyContactPhone: employee.emergencyContactPhone ?? undefined,
            emergencyContactRelation:
              employee.emergencyContactRelation ?? undefined,
            ctcAnnual: employee.ctcAnnual
              ? String(employee.ctcAnnual)
              : undefined,
            bankName: employee.bankName ?? undefined,
            bankIfsc: employee.bankIfsc ?? undefined,
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
            locations: options.locations.map((l) => ({ id: l.id, label: l.name })),
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
          canSeeCompensation={can(session, "employee.compensation.read") && inScope}
          canSeeSensitive={can(session, "employee.sensitive.read") && inScope}
          canInvite={can(session, "user.invite")}
          currency={session.org.currency}
        />
      </div>
    </PageShell>
  );
}
