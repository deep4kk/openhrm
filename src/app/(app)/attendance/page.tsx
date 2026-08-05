import type { Metadata } from "next";
import { Clock } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import {
  getTodayBoard,
  getTodaySummary,
} from "@/lib/queries/attendance";
import { formatDuration, formatTime } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { AttendanceStatusBadge, StatusBadge } from "@/components/status-badge";
import { StatTile, StatRow } from "@/components/stat-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const session = await requirePermission(
    "attendance.read.all",
    "attendance.read.team",
  );

  const [board, summary] = await Promise.all([
    getTodayBoard(session),
    getTodaySummary(session),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Attendance"
        description={
          summary.isWorkingDay
            ? "Who's in today, and how the last two weeks have gone."
            : "Today is a weekly off, so the board is quiet."
        }
      />

      <StatRow>
        <StatTile
          label="Present"
          value={summary.present}
          detail={`of ${summary.headcount} people`}
          tone="positive"
        />
        <StatTile label="On leave" value={summary.onLeave} tone="info" />
        <StatTile
          label="Absent"
          value={summary.absent}
          tone={summary.absent > 0 ? "critical" : "neutral"}
        />
        <StatTile
          label="Not marked"
          value={summary.notMarked}
          detail="no record yet"
        />
      </StatRow>

      <section>
        <h2 className="mb-3 text-sm font-semibold">Today</h2>

        <div className="surface overflow-hidden">
          {board.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nobody to show"
              description="Attendance appears here once there are employees in your scope."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[13rem]">Employee</TableHead>
                    <TableHead className="min-w-[8rem]">Department</TableHead>
                    <TableHead className="min-w-[7rem]">Checked in</TableHead>
                    <TableHead className="min-w-[7rem]">Checked out</TableHead>
                    <TableHead className="min-w-[6rem]">Worked</TableHead>
                    <TableHead className="min-w-[7rem]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {board.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <PersonCell
                          firstName={employee.firstName}
                          lastName={employee.lastName}
                          avatarUrl={employee.avatarUrl}
                          secondary={employee.designation?.title}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {employee.department?.name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        <span className="flex items-center gap-1.5">
                          {employee.today?.checkInAt
                            ? formatTime(
                                employee.today.checkInAt,
                                session.org.timezone,
                              )
                            : "—"}
                          {employee.today?.isLate && (
                            <StatusBadge label="Late" tone="warning" />
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {employee.today?.checkOutAt
                          ? formatTime(
                              employee.today.checkOutAt,
                              session.org.timezone,
                            )
                          : employee.today?.checkInAt
                            ? "still in"
                            : "—"}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {employee.today?.workedMinutes
                          ? formatDuration(employee.today.workedMinutes)
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {employee.today ? (
                          <AttendanceStatusBadge
                            status={employee.today.status}
                          />
                        ) : (
                          <StatusBadge label="No record" tone="neutral" />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}
