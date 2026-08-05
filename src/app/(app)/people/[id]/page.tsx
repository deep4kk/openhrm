import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Pencil, Phone } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { getEmployee } from "@/lib/queries/employees";
import { canReachEmployee } from "@/lib/scope";
import { maskTail, decryptFieldSafe } from "@/lib/crypto";
import { formatDate } from "@/lib/dates";
import { PageShell } from "@/components/page-header";
import { PersonAvatar } from "@/components/people/person-avatar";
import { SensitivePanel } from "@/components/people/sensitive-panel";
import { EmployeeStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(
    "employee.read.all",
    "employee.read.team",
    "employee.read.self",
    "directory.read",
  );
  const { id } = await params;
  const employee = await getEmployee(session, id);
  return {
    title: employee
      ? `${employee.firstName} ${employee.lastName}`
      : "Employee",
  };
}

export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "employee.read.all",
    "employee.read.team",
    "employee.read.self",
    "directory.read",
  );

  const { id } = await params;
  const employee = await getEmployee(session, id);
  if (!employee) notFound();

  const isSelf = session.employee?.id === id;
  const inFullScope = await canReachEmployee(session, "employee.read", id);

  // Someone with only directory access sees the public card, not the record.
  const fullRecord = isSelf || inFullScope;

  const canEdit =
    (isSelf && can(session, "employee.update.self")) ||
    (can(session, "employee.update") && inFullScope);
  const showCompensation =
    can(session, "employee.compensation.read") && inFullScope;
  const showSensitive = can(session, "employee.sensitive.read") && inFullScope;

  const fullName = `${employee.firstName} ${employee.lastName}`.trim();

  return (
    <PageShell className="max-w-5xl">
      <Link
        href="/people"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        People
      </Link>

      {/* Identity block */}
      <div className="surface p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <PersonAvatar
            firstName={employee.firstName}
            lastName={employee.lastName}
            avatarUrl={employee.avatarUrl}
            size="lg"
          />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold tracking-tight">{fullName}</h1>
              <EmployeeStatusBadge status={employee.status} />
            </div>

            <p className="text-muted-foreground mt-1 text-sm">
              {employee.designation?.title ?? "No designation"}
              {employee.department && ` · ${employee.department.name}`}
            </p>

            <div className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              <a
                href={`mailto:${employee.workEmail}`}
                className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
              >
                <Mail className="size-3.5" aria-hidden="true" />
                {employee.workEmail}
              </a>
              {employee.phone && (
                <a
                  href={`tel:${employee.phone}`}
                  className="hover:text-foreground inline-flex items-center gap-1.5 transition-colors"
                >
                  <Phone className="size-3.5" aria-hidden="true" />
                  {employee.phone}
                </a>
              )}
              <span className="font-mono text-xs">{employee.employeeCode}</span>
            </div>
          </div>

          {canEdit && (
            <LinkButton
              variant="outline"
              href={`/people/${employee.id}/edit`}
            >
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </LinkButton>
          )}
        </div>
      </div>

      {!fullRecord && (
        <p className="text-muted-foreground text-sm">
          You&apos;re seeing the directory card. Full records are visible to HR
          and to {employee.firstName}&apos;s reporting line.
        </p>
      )}

      {fullRecord && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Panel title="Job">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field label="Department" value={employee.department?.name} />
                <Field label="Designation" value={employee.designation?.title} />
                <Field
                  label="Employment type"
                  value={titleCase(employee.employmentType)}
                />
                <Field label="Location" value={employee.location?.name} />
                <Field
                  label="Joined"
                  value={formatDate(employee.dateOfJoining)}
                />
                <Field
                  label="Shift"
                  value={
                    employee.shift
                      ? `${employee.shift.name} · ${employee.shift.startTime}–${employee.shift.endTime}`
                      : undefined
                  }
                />
                <Field
                  label="Notice period"
                  value={`${employee.noticePeriodDays} days`}
                />
                {employee.dateOfExit && (
                  <Field label="Exit date" value={formatDate(employee.dateOfExit)} />
                )}
              </dl>
            </Panel>

            <Panel title="Personal">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                <Field
                  label="Date of birth"
                  value={
                    employee.dateOfBirth ? formatDate(employee.dateOfBirth) : undefined
                  }
                />
                <Field label="Gender" value={titleCase(employee.gender)} />
                <Field label="Blood group" value={employee.bloodGroup} />
                <Field label="Personal email" value={employee.personalEmail} />
                <Field
                  label="Address"
                  value={
                    [employee.addressLine1, employee.city, employee.state, employee.postalCode]
                      .filter(Boolean)
                      .join(", ") || undefined
                  }
                  className="sm:col-span-2"
                />
              </dl>
            </Panel>

            <Panel title="Emergency contact">
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                <Field label="Name" value={employee.emergencyContactName} />
                <Field label="Phone" value={employee.emergencyContactPhone} />
                <Field
                  label="Relationship"
                  value={employee.emergencyContactRelation}
                />
              </dl>
            </Panel>

            {showCompensation && (
              <Panel title="Compensation">
                <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field
                    label="Annual CTC"
                    value={
                      employee.ctcAnnual
                        ? formatMoney(
                            Number(employee.ctcAnnual),
                            session.org.currency,
                          )
                        : undefined
                    }
                  />
                  <Field
                    label="Monthly (gross)"
                    value={
                      employee.ctcAnnual
                        ? formatMoney(
                            Number(employee.ctcAnnual) / 12,
                            session.org.currency,
                          )
                        : undefined
                    }
                  />
                </dl>
              </Panel>
            )}

            {showSensitive && (
              <Panel title="Bank & identity">
                <SensitivePanel
                  employeeId={employee.id}
                  bankName={employee.bankName}
                  ifsc={employee.bankIfsc}
                  maskedAccount={maskTail(
                    decryptFieldSafe(employee.bankAccountNumberEnc),
                  )}
                  maskedPan={maskTail(decryptFieldSafe(employee.panNumberEnc))}
                />
              </Panel>
            )}
          </div>

          <div className="space-y-6">
            <Panel title="Reporting line">
              {employee.manager ? (
                <PersonRow
                  href={`/people/${employee.manager.id}`}
                  firstName={employee.manager.firstName}
                  lastName={employee.manager.lastName}
                  avatarUrl={employee.manager.avatarUrl}
                  secondary={employee.manager.designation?.title ?? "Manager"}
                  caption="Reports to"
                />
              ) : (
                <p className="text-muted-foreground text-sm">
                  No reporting manager set.
                </p>
              )}

              {employee.reports.length > 0 && (
                <div className="mt-5 border-t pt-4">
                  <p className="text-muted-foreground mb-3 text-xs">
                    {employee.reports.length} direct{" "}
                    {employee.reports.length === 1 ? "report" : "reports"}
                  </p>
                  <ul className="space-y-2.5">
                    {employee.reports.map((report) => (
                      <li key={report.id}>
                        <PersonRow
                          href={`/people/${report.id}`}
                          firstName={report.firstName}
                          lastName={report.lastName}
                          avatarUrl={report.avatarUrl}
                          secondary={report.designation?.title ?? null}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            <Panel title="Account">
              {employee.user ? (
                <dl className="space-y-3">
                  <Field label="Role" value={employee.user.role.name} />
                  <Field
                    label="Last signed in"
                    value={
                      employee.user.lastLoginAt
                        ? formatDate(employee.user.lastLoginAt)
                        : "Never"
                    }
                  />
                </dl>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No login yet. They can be invited from the edit screen.
                </p>
              )}
            </Panel>
          </div>
        </div>
      )}
    </PageShell>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-6">
      <h2 className="mb-5 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  className,
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}

function PersonRow({
  href,
  firstName,
  lastName,
  avatarUrl,
  secondary,
  caption,
}: {
  href: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  secondary: string | null;
  caption?: string;
}) {
  return (
    <>
      {caption && (
        <p className="text-muted-foreground mb-2 text-xs">{caption}</p>
      )}
      <Link
        href={href}
        className="hover:bg-accent -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors"
      >
        <PersonAvatar
          firstName={firstName}
          lastName={lastName}
          avatarUrl={avatarUrl}
          size="sm"
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {firstName} {lastName}
          </div>
          {secondary && (
            <div className="text-muted-foreground truncate text-xs">
              {secondary}
            </div>
          )}
        </div>
      </Link>
    </>
  );
}

function titleCase(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
