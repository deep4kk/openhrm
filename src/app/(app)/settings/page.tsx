import type { Metadata } from "next";
import {
  Award,
  Building2,
  CalendarOff,
  Clock,
  MapPin,
  Network,
  Palmtree,
  ShieldCheck,
} from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { MONTHS, WEEKDAYS } from "@/lib/locale";
import { PageHeader, PageShell } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import { Field, ManageLink, Panel } from "@/components/settings/panel";

export const metadata: Metadata = { title: "Settings" };

/**
 * Organisation settings.
 *
 * A read-first view: what is configured right now, in one place, so an admin
 * can answer "what are our leave rules?" without clicking through six screens.
 * Editing lives behind the individual sections — and each "Manage" link appears
 * only when the viewer holds the permission that section requires, so the
 * overview never offers a door that opens onto /denied.
 */
export default async function SettingsPage() {
  const session = await requirePermission(
    "org.read",
    "org.update",
    "structure.manage",
    "role.manage",
    "leave.type.manage",
  );

  const db = orgDb(session.org.id);

  const [
    org,
    departments,
    designations,
    locations,
    shifts,
    leaveTypes,
    holidays,
    roles,
    userCounts,
  ] = await Promise.all([
    db.organization.findFirst({ where: { id: session.org.id } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.designation.findMany({ orderBy: { level: "desc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.shift.findMany({ orderBy: { name: "asc" } }),
    db.leaveType.findMany({ orderBy: { sortdex: "asc" } }),
    db.holiday.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: "asc" },
      take: 8,
    }),
    db.role.findMany({ orderBy: { isSystem: "desc" } }),
    db.user.groupBy({ by: ["roleId"], _count: { _all: true } }),
  ]);

  const usersByRole = new Map(
    userCounts.map((row) => [row.roleId, row._count._all]),
  );

  const mayManageStructure = can(session, "structure.manage");

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title="Settings"
        description="How this organisation is configured. Everything here shapes what the rest of the app calculates."
      />

      <Panel
        icon={Building2}
        title="Organisation"
        action={
          can(session, "org.update") && (
            <ManageLink href="/settings/organisation" label="Edit profile" />
          )
        }
      >
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Name" value={org?.name} />
          <Field label="Identifier" value={org?.slug} mono />
          <Field label="Industry" value={org?.industry} />
          <Field label="Country" value={org?.country} />
          <Field label="Currency" value={org?.currency} />
          <Field label="Timezone" value={org?.timezone} />
          <Field
            label="Leave year starts"
            value={MONTHS[(org?.fiscalYearStartMonth ?? 1) - 1]?.label}
          />
          <Field
            label="Working days"
            value={(org?.workingDays ?? [])
              .map((d) => WEEKDAYS.find((w) => w.value === d)?.short)
              .filter(Boolean)
              .join(", ")}
          />
          <Field
            label="Created"
            value={org ? formatDate(org.createdAt) : undefined}
          />
        </dl>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          icon={Network}
          title="Departments"
          count={departments.length}
          action={
            mayManageStructure && (
              <ManageLink href="/settings/structure" label="Manage" />
            )
          }
        >
          <ul className="flex flex-wrap gap-2">
            {departments.map((d) => (
              <li key={d.id}>
                <span className="bg-muted inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs">
                  {d.name}
                  <span className="text-muted-foreground font-mono text-[10px]">
                    {d.code}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          icon={Award}
          title="Designations"
          count={designations.length}
          action={
            mayManageStructure && (
              <ManageLink href="/settings/structure" label="Manage" />
            )
          }
        >
          <ul className="flex flex-wrap gap-2">
            {designations.map((d) => (
              <li key={d.id}>
                <span className="bg-muted rounded-md px-2 py-1 text-xs">
                  {d.title}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          icon={MapPin}
          title="Locations"
          count={locations.length}
          action={
            mayManageStructure && (
              <ManageLink href="/settings/locations" label="Manage" />
            )
          }
        >
          <ul className="space-y-2.5">
            {locations.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{l.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {[l.city, l.state].filter(Boolean).join(", ") || l.country}
                    {" · "}
                    {l.timezone}
                  </p>
                </div>
                {l.isHeadquarters && <StatusBadge label="HQ" tone="info" />}
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          icon={Clock}
          title="Shifts"
          count={shifts.length}
          action={
            can(session, "shift.manage") && (
              <ManageLink href="/settings/shifts" label="Manage" />
            )
          }
        >
          <ul className="space-y-2.5">
            {shifts.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm">{s.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {s.startTime}–{s.endTime} · {s.breakMinutes}m break ·{" "}
                    {s.graceMinutes}m grace
                  </p>
                </div>
                {s.isDefault && <StatusBadge label="Default" tone="neutral" />}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel
        icon={Palmtree}
        title="Leave types"
        count={leaveTypes.length}
        description="These rules drive every balance in the system."
        action={
          can(session, "leave.type.manage") && (
            <ManageLink href="/settings/leave-types" label="Manage" />
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium">Type</th>
                <th className="px-3 py-2 text-left font-medium">Accrual</th>
                <th className="px-3 py-2 text-left font-medium">Carry forward</th>
                <th className="px-3 py-2 text-left font-medium">Notice</th>
                <th className="px-3 py-2 text-left font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((type) => (
                <tr key={type.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">{type.name}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-[11px]">
                      {type.code}
                    </span>
                    {type.applicableGender && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({type.applicableGender.toLowerCase()} only)
                      </span>
                    )}
                    {!type.isActive && (
                      <StatusBadge
                        label="Inactive"
                        tone="warning"
                        className="ml-2"
                      />
                    )}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 tabular-nums">
                    {type.accrualFrequency === "NONE"
                      ? `${Number(type.openingBalance)} days upfront`
                      : `${Number(type.accrualAmount)}/month`}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 tabular-nums">
                    {type.carryForward
                      ? type.carryForwardCap
                        ? `up to ${Number(type.carryForwardCap)} days`
                        : "unlimited"
                      : "expires"}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 tabular-nums">
                    {type.minNoticeDays > 0
                      ? `${type.minNoticeDays} days`
                      : "none"}
                  </td>
                  <td className="px-3 py-2.5">
                    {type.isPaid ? (
                      <StatusBadge label="Paid" tone="positive" />
                    ) : (
                      <StatusBadge label="Unpaid" tone="neutral" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          icon={CalendarOff}
          title="Upcoming holidays"
          action={
            can(session, "holiday.manage") && (
              <ManageLink href="/settings/holidays" label="Manage" />
            )
          }
        >
          {holidays.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No holidays scheduled for the rest of the year.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {holidays.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-sm">{h.name}</span>
                  <span className="text-muted-foreground flex items-center gap-2 text-xs tabular-nums">
                    {h.isOptional && (
                      <StatusBadge label="Optional" tone="neutral" />
                    )}
                    {formatDate(h.date)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          icon={ShieldCheck}
          title="Roles"
          count={roles.length}
          description="What each role can do is listed in full on the About page."
        >
          <ul className="space-y-2.5">
            {roles.map((role) => (
              <li
                key={role.id}
                className="flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm">{role.name}</p>
                  <p className="text-muted-foreground text-xs tabular-nums">
                    {role.permissions.length} permissions ·{" "}
                    {usersByRole.get(role.id) ?? 0} user
                    {(usersByRole.get(role.id) ?? 0) === 1 ? "" : "s"}
                  </p>
                </div>
                {role.isSystem && (
                  <StatusBadge label="Built in" tone="neutral" />
                )}
              </li>
            ))}
          </ul>

          {can(session, "role.manage") && (
            <div className="mt-4 border-t pt-4">
              <LinkButton href="/about#permissions" variant="outline" size="sm">
                See the permission matrix
              </LinkButton>
            </div>
          )}
        </Panel>
      </div>
    </PageShell>
  );
}
