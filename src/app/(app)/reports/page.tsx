import type { Metadata } from "next";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  headcountByDepartment,
  headcountSummary,
} from "@/lib/queries/employees";
import { getAttendanceTrend } from "@/lib/queries/attendance";
import { currentLeaveYear } from "@/lib/queries/leave";
import { PageHeader, PageShell } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { AttendanceTrend } from "@/components/charts/attendance-trend";
import { DepartmentBars } from "@/components/charts/department-bars";

export const metadata: Metadata = { title: "Reports" };

/**
 * Reports.
 *
 * Deliberately a short page of questions people actually ask — headcount,
 * where everyone sits, how attendance is trending, how much leave is being
 * used — rather than a chart wall. Anything that needs slicing goes to the
 * report builder, linked at the top.
 */
export default async function ReportsPage() {
  const session = await requirePermission("report.read.org", "report.read.team");
  const orgWide = can(session, "report.read.org");
  const mayBuild = can(session, "report.build");

  const db = orgDb(session.org.id);
  const { year } = currentLeaveYear(session);

  const [summary, byDepartment, trend, genderSplit, leaveUsage, tenure] =
    await Promise.all([
      headcountSummary(session),
      headcountByDepartment(session),
      getAttendanceTrend(session, 14),
      db.employee.groupBy({
        by: ["gender"],
        where: { status: { not: "EXITED" } },
        _count: { _all: true },
      }),
      db.leaveBalance.groupBy({
        by: ["leaveTypeId"],
        where: { year },
        _sum: { used: true, accrued: true },
      }),
      db.employee.findMany({
        where: { status: { not: "EXITED" } },
        select: { dateOfJoining: true },
      }),
    ]);

  const leaveTypes = await db.leaveType.findMany({
    where: { id: { in: leaveUsage.map((l) => l.leaveTypeId) } },
    select: { id: true, name: true },
  });
  const typeName = new Map(leaveTypes.map((t) => [t.id, t.name]));

  const total = genderSplit.reduce((sum, g) => sum + g._count._all, 0);
  const women =
    genderSplit.find((g) => g.gender === "FEMALE")?._count._all ?? 0;

  const now = Date.now();
  const medianTenureMonths = median(
    tenure.map((t) =>
      Math.round((now - t.dateOfJoining.getTime()) / (30.44 * 86_400_000)),
    ),
  );

  return (
    <PageShell>
      <PageHeader
        title="Reports"
        description={
          orgWide
            ? "Headcount, attendance and leave across the organisation."
            : "Headcount and attendance for your team."
        }
      />

      <StatRow>
        <StatTile
          label="Headcount"
          value={summary.active}
          detail={`${summary.joinedThisMonth} joined this month`}
        />
        <StatTile
          label="Women"
          value={total > 0 ? `${Math.round((women / total) * 100)}%` : "—"}
          detail={`${women} of ${total} recorded`}
        />
        <StatTile
          label="Median tenure"
          value={
            medianTenureMonths >= 12
              ? `${(medianTenureMonths / 12).toFixed(1)}y`
              : `${medianTenureMonths}m`
          }
          detail="time at the company"
        />
        <StatTile
          label="Exits this year"
          value={summary.exitedThisYear}
          detail={summary.notice > 0 ? `${summary.notice} on notice` : "none on notice"}
          tone={summary.notice > 0 ? "warning" : "neutral"}
        />
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-5">
        <section className="surface p-5 lg:col-span-3">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Attendance trend</h2>
            <p className="text-muted-foreground text-xs">
              Last two weeks, working days only.
            </p>
          </div>
          <AttendanceTrend data={trend} />
        </section>

        <section className="surface p-5 lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Headcount by department</h2>
            <p className="text-muted-foreground text-xs">
              {summary.active} people across {byDepartment.length} departments.
            </p>
          </div>
          <DepartmentBars data={byDepartment} />
        </section>
      </div>

      <section className="surface p-5">
        <div className="mb-4">
          <h2 className="text-sm font-semibold">Leave usage</h2>
          <p className="text-muted-foreground text-xs">
            Days taken against days accrued, leave year {year}–
            {String(year + 1).slice(2)}.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 pr-4 text-left font-medium">Leave type</th>
                <th className="px-3 py-2 text-right font-medium">Accrued</th>
                <th className="px-3 py-2 text-right font-medium">Taken</th>
                <th className="px-3 py-2 text-right font-medium">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {leaveUsage.map((row) => {
                const accrued = Number(row._sum.accrued ?? 0);
                const used = Number(row._sum.used ?? 0);
                const pct = accrued > 0 ? Math.round((used / accrued) * 100) : 0;

                return (
                  <tr key={row.leaveTypeId} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">
                      {typeName.get(row.leaveTypeId) ?? "Unknown"}
                    </td>
                    <td className="text-muted-foreground px-3 py-2.5 text-right tabular-nums">
                      {accrued.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {used.toFixed(1)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      <span className="inline-flex items-center gap-2">
                        <span className="bg-muted h-1.5 w-16 overflow-hidden rounded-full">
                          <span
                            className="bg-chart-1 block h-full"
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </span>
                        {pct}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </PageShell>
  );
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1]! + sorted[mid]!) / 2)
    : sorted[mid]!;
}
