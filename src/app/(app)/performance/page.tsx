import type { Metadata } from "next";
import Link from "next/link";
import { MessagesSquare, Target } from "lucide-react";

import { requirePermission, can, canAny } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  listGoals,
  listReviewCycles,
  myPendingReviews,
  performanceSummary,
} from "@/lib/queries/performance";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { ProgressBar } from "@/components/progress-bar";
import { PersonCell } from "@/components/people/person-avatar";
import { LinkButton } from "@/components/link-button";
import {
  CycleStatusBadge,
  GoalProgress,
  GoalStatusBadge,
} from "@/components/performance/goal-bits";
import { GoalDialog } from "@/components/performance/goal-dialog";
import { CycleDialog } from "@/components/performance/cycle-controls";

export const metadata: Metadata = { title: "Performance" };

/**
 * Goals and review cycles on one screen.
 *
 * "What you owe" is at the top, above the org-wide picture, because a page that
 * opens on a company OKR tree while the reader's own self-review is three days
 * overdue has its priorities backwards.
 */
export default async function PerformancePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; level?: string }>;
}) {
  const session = await requirePermission(
    "goal.read.all",
    "goal.read.team",
    "goal.read.self",
    "goal.manage",
    "review.cycle.manage",
    "review.read.team",
  );

  const filters = await searchParams;
  const mayManageGoals = can(session, "goal.manage");
  const mayRunCycles = can(session, "review.cycle.manage");

  const [goals, cycles, summary, pending, employees, departments] =
    await Promise.all([
      listGoals(session, {
        status: filters.status ?? "live",
        level: filters.level,
      }),
      canAny(session, "review.cycle.manage", "review.read.all", "review.read.team")
        ? listReviewCycles(session)
        : Promise.resolve([]),
      performanceSummary(session),
      myPendingReviews(session),
      mayManageGoals
        ? orgDb(session.org.id).employee.findMany({
            where: { status: { not: "EXITED" } },
            orderBy: [{ firstName: "asc" }],
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      mayManageGoals
        ? orgDb(session.org.id).department.findMany({
            orderBy: { name: "asc" },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

  const parentOptions = goals
    .filter((g) => g.level !== "INDIVIDUAL")
    .map((g) => ({ id: g.id, name: g.title }));

  return (
    <PageShell>
      <PageHeader
        title="Performance"
        description="Goals, appraisal cycles and 1:1s."
        actions={
          <>
            <LinkButton href="/performance/one-on-ones" variant="outline">
              <MessagesSquare className="size-4" aria-hidden />
              1:1s
            </LinkButton>
            {mayRunCycles && <CycleDialog />}
            {mayManageGoals && (
              <GoalDialog
                employees={employees.map((e) => ({
                  id: e.id,
                  name: `${e.firstName} ${e.lastName}`,
                }))}
                departments={departments}
                parents={parentOptions}
                cycles={cycles.map((c) => ({ id: c.id, name: c.name }))}
              />
            )}
          </>
        }
      />

      {pending.length > 0 && (
        <section className="border-warning/40 bg-warning-subtle rounded-lg border p-4">
          <h2 className="text-sm font-semibold">
            {pending.length} review{pending.length === 1 ? "" : "s"} waiting on you
          </h2>
          <ul className="mt-3 space-y-2">
            {pending.map((review) => (
              <li key={review.id}>
                <Link
                  href={`/performance/reviews/${review.id}`}
                  className="text-sm hover:underline"
                >
                  <span className="font-medium">
                    {review.kind === "SELF"
                      ? "Your self-review"
                      : `${review.employee.firstName} ${review.employee.lastName}`}
                  </span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {review.cycle.name} · due{" "}
                    {formatDate(
                      review.kind === "SELF"
                        ? review.cycle.selfReviewDueOn
                        : review.cycle.managerReviewDueOn,
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {summary && (
        <StatRow>
          <StatTile
            label="Live goals"
            value={summary.liveGoals}
            detail={`${summary.achieved} achieved`}
          />
          <StatTile
            label="At risk"
            value={summary.atRisk}
            detail="flagged or past due"
            tone={summary.atRisk > 0 ? "warning" : "positive"}
          />
          <StatTile
            label="Average progress"
            value={`${summary.averageProgress}%`}
            detail="across live goals"
            tone="info"
          />
          <StatTile
            label={summary.activeCycle ? "Reviews in" : "Review cycle"}
            value={
              summary.activeCycle
                ? `${summary.activeCycle.submitted}/${summary.activeCycle.total}`
                : "—"
            }
            detail={summary.activeCycle?.name ?? "none running"}
          />
        </StatRow>
      )}

      {cycles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Review cycles</h2>
          <ul className="surface divide-y overflow-hidden">
            {cycles.map((cycle) => {
              const submitted = cycle.reviews.filter(
                (r) => r.status === "SUBMITTED",
              ).length;
              return (
                <li key={cycle.id}>
                  <Link
                    href={`/performance/cycles/${cycle.id}`}
                    className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{cycle.name}</p>
                        <CycleStatusBadge status={cycle.status} />
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
                        {formatDate(cycle.periodStart)} –{" "}
                        {formatDate(cycle.periodEnd)}
                      </p>
                    </div>

                    <div className="min-w-[10rem] flex-1">
                      <ProgressBar
                        percent={
                          cycle.reviews.length === 0
                            ? 0
                            : (submitted / cycle.reviews.length) * 100
                        }
                        label={`${submitted}/${cycle.reviews.length} in`}
                        tone={
                          cycle.reviews.length > 0 &&
                          submitted === cycle.reviews.length
                            ? "positive"
                            : "brand"
                        }
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Goals</h2>

        <FilterBar
          searchKey={null}
          count={goals.length}
          countNoun={["goal", "goals"]}
          selects={[
            {
              key: "status",
              label: "Filter by status",
              options: [
                { value: "live", label: "Live" },
                { value: "all", label: "Everything" },
                { value: "ACTIVE", label: "On track" },
                { value: "AT_RISK", label: "At risk" },
                { value: "ACHIEVED", label: "Achieved" },
                { value: "MISSED", label: "Missed" },
              ],
              width: "w-[9rem]",
            },
            {
              key: "level",
              label: "Filter by level",
              options: [
                { value: "all", label: "All levels" },
                { value: "COMPANY", label: "Company" },
                { value: "DEPARTMENT", label: "Department" },
                { value: "INDIVIDUAL", label: "Individual" },
              ],
              width: "w-[10rem]",
            },
          ]}
        />

        <div className="surface mt-3 overflow-hidden">
          {goals.length === 0 ? (
            <EmptyState
              icon={Target}
              title="No goals set"
              description={
                mayManageGoals
                  ? "Start with a company goal, then cascade department and individual goals under it — each one rolls its progress up."
                  : "Nothing has been set for you yet."
              }
            />
          ) : (
            <ul className="divide-y">
              {goals.map((goal) => (
                <li key={goal.id} className="space-y-3 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{goal.title}</p>
                        <GoalStatusBadge status={goal.status} />
                        <span className="text-muted-foreground text-xs">
                          {goal.level.toLowerCase()}
                        </span>
                      </div>
                      {goal.description && (
                        <p className="text-muted-foreground measure mt-0.5 text-xs">
                          {goal.description}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                        Due {formatDate(goal.dueDate)}
                        {goal.parent && ` · rolls into "${goal.parent.title}"`}
                        {goal.children.length > 0 &&
                          ` · ${goal.children.length} goal${
                            goal.children.length === 1 ? "" : "s"
                          } roll up`}
                      </p>
                    </div>

                    {goal.owner ? (
                      <PersonCell
                        firstName={goal.owner.firstName}
                        lastName={goal.owner.lastName}
                        avatarUrl={goal.owner.avatarUrl}
                        secondary={goal.owner.employeeCode}
                        size="xs"
                      />
                    ) : (
                      <span className="text-muted-foreground text-xs">
                        {goal.department?.name ?? "Company-wide"}
                      </span>
                    )}
                  </div>

                  <GoalProgress
                    goalId={goal.id}
                    currentValue={
                      goal.currentValue === null ? null : Number(goal.currentValue)
                    }
                    targetValue={
                      goal.targetValue === null ? null : Number(goal.targetValue)
                    }
                    unit={goal.unit}
                    progress={goal.progress}
                    status={goal.status}
                    canEdit={
                      mayManageGoals || goal.ownerId === session.employee?.id
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </PageShell>
  );
}
