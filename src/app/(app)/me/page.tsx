import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, UserRound } from "lucide-react";

import { requireAuth, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  currentLeaveYear,
  getLeaveBalances,
  getMyLeaveRequests,
} from "@/lib/queries/leave";
import {
  getMonthSummary,
  getMonthlyAttendance,
  getTodayRecord,
} from "@/lib/queries/attendance";
import {
  formatDate,
  formatDateRange,
  formatDuration,
  formatTime,
} from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { CheckInCard } from "@/components/attendance/check-in-card";
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import { BalanceCards, formatDays } from "@/components/leave/balance-cards";
import { CancelLeaveButton } from "@/components/leave/decision-buttons";
import {
  ApprovalStatusBadge,
  AttendanceStatusBadge,
} from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "My space" };

/**
 * "My space" — everything an employee needs without going through HR.
 *
 * Ordered by how often it's touched: check in, then leave (balances and the
 * request button), then this month's attendance, then the profile. An employee
 * opens this page dozens of times a month and almost always for the top two.
 */
export default async function MySpacePage() {
  const session = await requireAuth();

  if (!session.employee) {
    return (
      <PageShell className="max-w-3xl">
        <PageHeader title="My space" />
        <div className="surface">
          <EmptyState
            icon={UserRound}
            title="No employee record linked to your account"
            description="Your login exists but isn't attached to an employee record yet, so there's no attendance or leave to show. An HR admin can link them from the People screen."
          />
        </div>
      </PageShell>
    );
  }

  const employeeId = session.employee.id;
  const db = orgDb(session.org.id);
  const { year } = currentLeaveYear(session);

  const [
    todayRecord,
    employee,
    balances,
    requests,
    monthSummary,
    monthRecords,
  ] = await Promise.all([
    getTodayRecord(session, employeeId),
    db.employee.findFirst({
      where: { id: employeeId },
      include: {
        shift: true,
        department: true,
        designation: true,
        location: true,
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    getLeaveBalances(session, employeeId, year),
    getMyLeaveRequests(session, employeeId, 8),
    getMonthSummary(session, employeeId),
    getMonthlyAttendance(session, employeeId),
  ]);

  const canApply = can(session, "leave.request");

  return (
    <PageShell>
      <PageHeader
        title="My space"
        description={`${employee?.designation?.title ?? "Employee"}${
          employee?.department ? ` · ${employee.department.name}` : ""
        } · ${session.employee.employeeCode}`}
        actions={
          <LinkButton href={`/people/${employeeId}`} variant="outline">
            <UserRound className="size-4" aria-hidden="true" />
            My profile
          </LinkButton>
        }
      />

      <CheckInCard
        checkInAt={todayRecord?.checkInAt?.toISOString() ?? null}
        checkOutAt={todayRecord?.checkOutAt?.toISOString() ?? null}
        workedMinutes={todayRecord?.workedMinutes ?? 0}
        timezone={session.org.timezone}
        shiftLabel={
          employee?.shift
            ? `${employee.shift.name} · ${employee.shift.startTime}–${employee.shift.endTime}`
            : null
        }
        isLate={todayRecord?.isLate ?? false}
      />

      <StatRow>
        <StatTile
          label="Present this month"
          value={monthSummary.present}
          detail={`of ${monthSummary.expected} working days`}
          tone="positive"
        />
        <StatTile
          label="Attendance"
          value={`${monthSummary.attendanceRate}%`}
          detail={monthSummary.late > 0 ? `${monthSummary.late} late` : "on time"}
          tone={monthSummary.attendanceRate >= 90 ? "positive" : "warning"}
        />
        <StatTile
          label="Average day"
          value={formatDuration(monthSummary.averageMinutes)}
          detail="worked, excluding breaks"
        />
        <StatTile
          label="Leave taken"
          value={monthSummary.onLeave}
          detail="days this month"
          tone="info"
        />
      </StatRow>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Leave balances
            <span className="text-muted-foreground ml-2 font-normal">
              {year}–{String(year + 1).slice(2)}
            </span>
          </h2>
          {canApply && balances.length > 0 && (
            <ApplyLeaveDialog balances={balances} />
          )}
        </div>
        <BalanceCards balances={balances} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold">Your leave requests</h2>
          <div className="surface overflow-hidden">
            {requests.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="No requests yet"
                description="When you apply for leave it will show up here with its status."
              />
            ) : (
              <ul className="divide-y">
                {requests.map((request) => {
                  const cancellable =
                    request.status === "PENDING" ||
                    (request.status === "APPROVED" &&
                      request.endDate >= new Date());

                  return (
                    <li key={request.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              {request.leaveType.name}
                            </p>
                            <ApprovalStatusBadge status={request.status} />
                          </div>
                          <p className="text-muted-foreground mt-1 text-sm tabular-nums">
                            {formatDateRange(request.startDate, request.endDate)}
                            {" · "}
                            {formatDays(Number(request.days))}
                          </p>
                          <p className="text-muted-foreground measure mt-1 text-xs">
                            {request.reason}
                          </p>
                          {request.decisionNote && (
                            <p className="bg-muted measure mt-2 rounded-md px-2.5 py-1.5 text-xs">
                              <span className="font-medium">
                                {request.approver
                                  ? `${request.approver.firstName}:`
                                  : "Note:"}
                              </span>{" "}
                              {request.decisionNote}
                            </p>
                          )}
                        </div>

                        {cancellable && (
                          <CancelLeaveButton requestId={request.id} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold">This month&apos;s attendance</h2>
          <div className="surface max-h-[28rem] overflow-auto">
            <Table>
              <TableHeader className="bg-card sticky top-0">
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>In</TableHead>
                  <TableHead>Out</TableHead>
                  <TableHead>Worked</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="text-sm tabular-nums whitespace-nowrap">
                      {formatDate(record.date)}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {record.checkInAt
                        ? formatTime(record.checkInAt, session.org.timezone)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {record.checkOutAt
                        ? formatTime(record.checkOutAt, session.org.timezone)
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">
                      {record.workedMinutes
                        ? formatDuration(record.workedMinutes)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <AttendanceStatusBadge status={record.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <section className="surface p-5">
        <h2 className="mb-4 text-sm font-semibold">Your details</h2>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Work email" value={employee?.workEmail} />
          <Field label="Phone" value={employee?.phone} />
          <Field
            label="Reports to"
            value={
              employee?.manager
                ? `${employee.manager.firstName} ${employee.manager.lastName}`
                : "—"
            }
          />
          <Field label="Location" value={employee?.location?.name} />
          <Field
            label="Joined"
            value={employee ? formatDate(employee.dateOfJoining) : undefined}
          />
          <Field
            label="Emergency contact"
            value={
              employee?.emergencyContactName
                ? `${employee.emergencyContactName}${
                    employee.emergencyContactPhone
                      ? ` · ${employee.emergencyContactPhone}`
                      : ""
                  }`
                : undefined
            }
          />
        </dl>
        <p className="text-muted-foreground mt-5 text-xs">
          Something wrong?{" "}
          <Link
            href={`/people/${employeeId}/edit`}
            className="text-brand underline-offset-4 hover:underline"
          >
            Update your details
          </Link>
          . Job details and compensation are managed by HR.
        </p>
      </section>
    </PageShell>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-1 text-sm">{value || "—"}</dd>
    </div>
  );
}
