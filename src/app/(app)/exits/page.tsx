import type { Metadata } from "next";
import Link from "next/link";
import { DoorOpen } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { exitSummary, listResignations } from "@/lib/queries/exits";
import { formatDate, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { ProgressBar } from "@/components/progress-bar";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "Exits" };

const RESIGNATION_STATUS = {
  SUBMITTED: { label: "Awaiting decision", tone: "warning" as const },
  ACCEPTED: { label: "On notice", tone: "info" as const },
  REJECTED: { label: "Declined", tone: "neutral" as const },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" as const },
  COMPLETED: { label: "Left", tone: "neutral" as const },
};

/**
 * Everyone on their way out.
 *
 * Each row carries three independent progress signals — clearance, settlement,
 * exit interview — because an exit is not done until all three are, and a
 * single status field would hide which one is holding it up.
 */
export default async function ExitsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requirePermission(
    "exit.read.all",
    "exit.manage",
    "settlement.manage",
  );

  const filters = await searchParams;

  const [resignations, summary] = await Promise.all([
    listResignations(session, { status: filters.status ?? "live" }),
    exitSummary(session),
  ]);

  const now = today();

  return (
    <PageShell>
      <PageHeader
        title="Exits"
        description="Resignations, clearance, exit interviews and final settlements."
      />

      {summary && (
        <StatRow>
          <StatTile
            label="Awaiting decision"
            value={summary.pending}
            detail="resignations to accept or decline"
            tone={summary.pending > 0 ? "warning" : "neutral"}
          />
          <StatTile
            label="On notice"
            value={summary.accepted}
            detail={`${summary.leavingSoon} leaving within 30 days`}
            tone="info"
          />
          <StatTile
            label="Unsettled"
            value={summary.unsettled}
            detail="full & final not yet paid"
            tone={summary.unsettled > 0 ? "critical" : "positive"}
          />
          <StatTile
            label="Left this year"
            value={summary.thisYear}
            detail="completed exits"
          />
        </StatRow>
      )}

      <FilterBar
        searchKey={null}
        count={resignations.length}
        countNoun={["exit", "exits"]}
        selects={[
          {
            key: "status",
            label: "Filter by status",
            options: [
              { value: "live", label: "In progress" },
              { value: "all", label: "Everything" },
              { value: "SUBMITTED", label: "Awaiting decision" },
              { value: "ACCEPTED", label: "On notice" },
              { value: "COMPLETED", label: "Completed" },
              { value: "WITHDRAWN", label: "Withdrawn" },
            ],
          },
        ]}
      />

      <div className="surface overflow-hidden">
        {resignations.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="Nobody is leaving"
            description="When someone resigns it lands here, with their clearance checklist, exit interview and final settlement all in one place."
          />
        ) : (
          <ul className="divide-y">
            {resignations.map((resignation) => {
              const status =
                RESIGNATION_STATUS[
                  resignation.status as keyof typeof RESIGNATION_STATUS
                ];

              const tasks = resignation.clearance?.tasks ?? [];
              const cleared = tasks.filter(
                (t) => t.status === "DONE" || t.status === "SKIPPED",
              ).length;
              const overdue = tasks.filter(
                (t) => t.status === "PENDING" && t.dueDate && t.dueDate < now,
              ).length;

              const lastDay =
                resignation.lastWorkingDayApproved ??
                resignation.lastWorkingDayRequested;

              return (
                <li key={resignation.id}>
                  <Link
                    href={`/exits/${resignation.id}`}
                    className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                  >
                    <div className="min-w-[13rem] flex-1">
                      <PersonCell
                        firstName={resignation.employee.firstName}
                        lastName={resignation.employee.lastName}
                        avatarUrl={resignation.employee.avatarUrl}
                        secondary={
                          resignation.employee.designation?.title ??
                          resignation.employee.employeeCode
                        }
                      />
                    </div>

                    <div className="min-w-[8rem]">
                      <p className="text-sm tabular-nums">{formatDate(lastDay)}</p>
                      <p className="text-muted-foreground text-xs">
                        {resignation.lastWorkingDayApproved
                          ? "last working day"
                          : "requested"}
                      </p>
                    </div>

                    <div className="min-w-[9rem] flex-1">
                      {tasks.length > 0 ? (
                        <ProgressBar
                          percent={(cleared / tasks.length) * 100}
                          label={`${cleared}/${tasks.length} cleared`}
                          tone={
                            overdue > 0
                              ? "critical"
                              : cleared === tasks.length
                                ? "positive"
                                : "brand"
                          }
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          No clearance list
                        </span>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {resignation.settlement && (
                        <StatusBadge
                          label={
                            resignation.settlement.status === "PAID"
                              ? `F&F ${formatMoney(resignation.settlement.netPayable, session.org.currency)}`
                              : `F&F ${resignation.settlement.status.toLowerCase()}`
                          }
                          tone={
                            resignation.settlement.status === "PAID"
                              ? "positive"
                              : "warning"
                          }
                        />
                      )}
                      {resignation.exitInterview?.submittedAt && (
                        <StatusBadge label="Interviewed" tone="neutral" />
                      )}
                      <StatusBadge label={status.label} tone={status.tone} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
