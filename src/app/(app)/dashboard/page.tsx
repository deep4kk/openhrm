import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, Megaphone } from "lucide-react";

import { requireAuth, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  getAttendanceTrend,
  getTodayRecord,
  getTodaySummary,
} from "@/lib/queries/attendance";
import {
  headcountByDepartment,
  headcountSummary,
} from "@/lib/queries/employees";
import { getPendingApprovals, getWhoIsOut } from "@/lib/queries/leave";
import { formatDate, formatRelative } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { PersonCell } from "@/components/people/person-avatar";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { AttendanceTrend } from "@/components/charts/attendance-trend";
import { DepartmentBars } from "@/components/charts/department-bars";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const session = await requireAuth();

  const seesOrg = can(session, "report.read.org");
  const canApprove =
    can(session, "leave.approve.team") || can(session, "leave.approve.all");

  const db = orgDb(session.org.id);

  const [
    headcount,
    attendanceToday,
    trend,
    byDepartment,
    whoIsOut,
    pending,
    todayRecord,
    myShift,
    announcements,
  ] = await Promise.all([
    seesOrg ? headcountSummary(session) : Promise.resolve(null),
    can(session, "attendance.read.all") || can(session, "attendance.read.team")
      ? getTodaySummary(session)
      : Promise.resolve(null),
    seesOrg ? getAttendanceTrend(session, 14) : Promise.resolve([]),
    seesOrg ? headcountByDepartment(session) : Promise.resolve([]),
    getWhoIsOut(session),
    canApprove ? getPendingApprovals(session) : Promise.resolve([]),
    session.employee
      ? getTodayRecord(session, session.employee.id)
      : Promise.resolve(null),
    // The shift belongs to the person, not to today's row — otherwise the card
    // reads "no shift assigned" every morning before the first check-in.
    session.employee
      ? db.employee.findFirst({
          where: { id: session.employee.id },
          select: { shift: true },
        })
      : Promise.resolve(null),
    db.announcement.findMany({
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 3,
      include: { author: { select: { name: true } } },
    }),
  ]);

  const firstName = session.employee?.firstName ?? session.user.name.split(" ")[0];

  return (
    <PageShell>
      <PageHeader
        title={`${greeting()}, ${firstName}`}
        description={`${session.org.name} · ${formatDate(new Date())}`}
        actions={
          canApprove && pending.length > 0 ? (
            <LinkButton href="/leave/approvals">
              <Inbox className="size-4" aria-hidden="true" />
              {pending.length} to review
            </LinkButton>
          ) : undefined
        }
      />

      {session.employee && (
        <CheckInCard
          checkInAt={todayRecord?.checkInAt?.toISOString() ?? null}
          checkOutAt={todayRecord?.checkOutAt?.toISOString() ?? null}
          workedMinutes={todayRecord?.workedMinutes ?? 0}
          timezone={session.org.timezone}
          shiftLabel={(() => {
            const shift = todayRecord?.shift ?? myShift?.shift;
            return shift
              ? `${shift.name} · ${shift.startTime}–${shift.endTime}`
              : null;
          })()}
          isLate={todayRecord?.isLate ?? false}
        />
      )}

      {(headcount || attendanceToday) && (
        <StatRow>
          {headcount && (
            <StatTile
              label="Headcount"
              value={headcount.active}
              detail={
                headcount.joinedThisMonth > 0
                  ? `${headcount.joinedThisMonth} joined this month`
                  : "no joiners this month"
              }
            />
          )}
          {attendanceToday && (
            <StatTile
              label="Present today"
              value={attendanceToday.present}
              detail={`of ${attendanceToday.headcount}`}
              tone="positive"
            />
          )}
          <StatTile
            label="Away today"
            value={whoIsOut.length}
            detail="on approved leave"
            tone={whoIsOut.length > 0 ? "info" : "neutral"}
          />
          {canApprove && (
            <StatTile
              label="Awaiting you"
              value={pending.length}
              detail={pending.length === 0 ? "all clear" : "leave requests"}
              tone={pending.length > 0 ? "warning" : "neutral"}
            />
          )}
        </StatRow>
      )}

      {seesOrg && (
        <div className="grid gap-6 lg:grid-cols-5">
          <section className="surface p-5 lg:col-span-3">
            <div className="mb-4">
              <h2 className="text-sm font-semibold">Attendance</h2>
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
                {headcount?.active ?? 0} people across {byDepartment.length}{" "}
                departments.
              </p>
            </div>
            <DepartmentBars data={byDepartment} />
          </section>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="surface p-5">
          <h2 className="mb-4 text-sm font-semibold">
            Away today
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {whoIsOut.length}
            </span>
          </h2>

          {whoIsOut.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Everyone&apos;s in today.
            </p>
          ) : (
            <ul className="space-y-3">
              {whoIsOut.slice(0, 6).map((leave) => (
                <li key={leave.id} className="flex items-center justify-between gap-3">
                  <PersonCell
                    firstName={leave.employee.firstName}
                    lastName={leave.employee.lastName}
                    avatarUrl={leave.employee.avatarUrl}
                    secondary={leave.employee.department?.name}
                    size="sm"
                  />
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {leave.leaveType.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="surface p-5">
          <h2 className="mb-4 text-sm font-semibold">Announcements</h2>

          {announcements.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nothing posted yet.
            </p>
          ) : (
            <ul className="space-y-4">
              {announcements.map((item) => (
                <li key={item.id} className="border-b pb-4 last:border-0 last:pb-0">
                  <div className="flex items-start gap-2">
                    {item.isPinned && (
                      <Megaphone
                        className="text-muted-foreground mt-0.5 size-3.5 shrink-0"
                        aria-label="Pinned"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground measure mt-1 line-clamp-2 text-xs leading-relaxed">
                        {item.body}
                      </p>
                      <p className="text-muted-foreground/70 mt-1.5 text-[11px]">
                        {item.author?.name ?? "OpenHRM"} ·{" "}
                        {formatRelative(item.publishedAt)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {!seesOrg && (
        <p className="text-muted-foreground text-sm">
          Looking for your own payslips, leave and attendance?{" "}
          <Link href="/me" className="text-brand underline-offset-4 hover:underline">
            Go to My space
          </Link>
          .
        </p>
      )}
    </PageShell>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
