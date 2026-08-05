import type { Metadata } from "next";
import { CalendarCheck } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { getPendingApprovals } from "@/lib/queries/leave";
import { formatDate, formatDateRange, formatRelative } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { DecisionButtons } from "@/components/leave/decision-buttons";
import { formatDays } from "@/components/leave/balance-cards";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Leave approvals" };

export default async function LeaveApprovalsPage() {
  const session = await requirePermission(
    "leave.approve.team",
    "leave.approve.all",
  );

  const requests = await getPendingApprovals(session);

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        title="Waiting on you"
        description={
          requests.length === 0
            ? "Nothing needs a decision right now."
            : `${requests.length} leave ${requests.length === 1 ? "request needs" : "requests need"} your decision.`
        }
      />

      {requests.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={CalendarCheck}
            title="All caught up"
            description="When someone on your team applies for leave, it will appear here and you'll get a notification."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((request) => {
            const startsIn = Math.round(
              (request.startDate.getTime() - Date.now()) / 86_400_000,
            );
            const urgent = startsIn <= 2;

            return (
              <li key={request.id} className="surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <PersonCell
                    firstName={request.employee.firstName}
                    lastName={request.employee.lastName}
                    avatarUrl={request.employee.avatarUrl}
                    secondary={
                      request.employee.designation?.title ??
                      request.employee.employeeCode
                    }
                  />

                  <DecisionButtons
                    requestId={request.id}
                    employeeName={request.employee.firstName}
                  />
                </div>

                <dl className="mt-4 grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground text-xs">Leave type</dt>
                    <dd className="mt-1 text-sm font-medium">
                      {request.leaveType.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Dates</dt>
                    <dd className="mt-1 flex items-center gap-2 text-sm">
                      <span>
                        {formatDateRange(request.startDate, request.endDate)}
                      </span>
                      {urgent && (
                        <StatusBadge
                          label={startsIn <= 0 ? "Starts today" : "Starts soon"}
                          tone="warning"
                        />
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground text-xs">Duration</dt>
                    <dd className="mt-1 text-sm tabular-nums">
                      {formatDays(Number(request.days))}
                      {request.isHalfDay && " (half day)"}
                    </dd>
                  </div>

                  <div className="sm:col-span-3">
                    <dt className="text-muted-foreground text-xs">Reason</dt>
                    <dd className="measure mt-1 text-sm">{request.reason}</dd>
                  </div>

                  {request.contactDuringLeave && (
                    <div className="sm:col-span-3">
                      <dt className="text-muted-foreground text-xs">
                        Contact while away
                      </dt>
                      <dd className="mt-1 text-sm">
                        {request.contactDuringLeave}
                      </dd>
                    </div>
                  )}
                </dl>

                <p className="text-muted-foreground mt-3 text-xs">
                  Requested {formatRelative(request.createdAt)} ·{" "}
                  {formatDate(request.createdAt)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
