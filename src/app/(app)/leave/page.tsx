import type { Metadata } from "next";
import { CalendarDays, Inbox } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import {
  currentLeaveYear,
  getLeaveBalances,
  getPendingApprovals,
  getWhoIsOut,
  listLeaveRequests,
} from "@/lib/queries/leave";
import { formatDate, formatDateRange } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { ApprovalStatusBadge } from "@/components/status-badge";
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog";
import { BalanceCards, formatDays } from "@/components/leave/balance-cards";
import { LinkButton } from "@/components/link-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Leave" };

export default async function LeavePage() {
  const session = await requirePermission(
    "leave.read.all",
    "leave.read.team",
    "leave.approve.team",
  );

  const canApply = can(session, "leave.request") && Boolean(session.employee);
  const canApprove =
    can(session, "leave.approve.team") || can(session, "leave.approve.all");

  const { year } = currentLeaveYear(session);

  const [requests, pending, whoIsOut, myBalances] = await Promise.all([
    listLeaveRequests(session, { take: 40 }),
    canApprove ? getPendingApprovals(session) : Promise.resolve([]),
    getWhoIsOut(session),
    session.employee
      ? getLeaveBalances(session, session.employee.id, year)
      : Promise.resolve([]),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Leave"
        description={`Requests, balances and who's away. Leave year ${year}–${String(year + 1).slice(2)}.`}
        actions={
          <div className="flex items-center gap-2">
            {canApprove && (
              <LinkButton
                href="/leave/approvals"
                variant={pending.length > 0 ? "default" : "outline"}
              >
                <Inbox className="size-4" aria-hidden="true" />
                {pending.length > 0
                  ? `${pending.length} to review`
                  : "Approvals"}
              </LinkButton>
            )}
            {canApply && myBalances.length > 0 && (
              <ApplyLeaveDialog balances={myBalances} />
            )}
          </div>
        }
      />

      {/* Away today — the question a manager actually opens this page to answer. */}
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
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {whoIsOut.map((leave) => (
              <li
                key={leave.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <PersonCell
                  firstName={leave.employee.firstName}
                  lastName={leave.employee.lastName}
                  avatarUrl={leave.employee.avatarUrl}
                  secondary={leave.employee.department?.name}
                  size="sm"
                />
                <div className="text-right">
                  <p className="text-xs font-medium">{leave.leaveType.name}</p>
                  <p className="text-muted-foreground text-[11px]">
                    back {formatDate(new Date(leave.endDate.getTime() + 86_400_000))}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {session.employee && myBalances.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Your balances</h2>
          <BalanceCards balances={myBalances} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          {can(session, "leave.read.all") ? "All requests" : "Team requests"}
        </h2>

        <div className="surface overflow-hidden">
          {requests.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No leave requests yet"
              description="Requests will appear here as soon as someone applies."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="min-w-[13rem]">Employee</TableHead>
                    <TableHead className="min-w-[8rem]">Type</TableHead>
                    <TableHead className="min-w-[11rem]">Dates</TableHead>
                    <TableHead className="min-w-[6rem]">Days</TableHead>
                    <TableHead className="min-w-[7rem]">Status</TableHead>
                    <TableHead className="min-w-[9rem]">Decided by</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <PersonCell
                          firstName={request.employee.firstName}
                          lastName={request.employee.lastName}
                          avatarUrl={request.employee.avatarUrl}
                          secondary={request.employee.department?.name}
                          size="sm"
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {request.leaveType.name}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDateRange(request.startDate, request.endDate)}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {formatDays(Number(request.days))}
                      </TableCell>
                      <TableCell>
                        <ApprovalStatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {request.approver
                          ? `${request.approver.firstName} ${request.approver.lastName}`
                          : "—"}
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
