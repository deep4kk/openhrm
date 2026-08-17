import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { getReviewCycle } from "@/lib/queries/performance";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import {
  AdvanceCycleButton,
  CycleDialog,
} from "@/components/performance/cycle-controls";
import { CycleStatusBadge } from "@/components/performance/goal-bits";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(
    "review.cycle.manage",
    "review.read.all",
    "review.read.team",
    "review.participate",
  );
  const { id } = await params;
  const cycle = await getReviewCycle(session, id);
  return { title: cycle?.name ?? "Review cycle" };
}

/**
 * One cycle, and who has filed what.
 *
 * Grouped by employee rather than listed as reviews, because the question is
 * "is Priya's appraisal complete?" — which needs her self-review and her
 * manager's side next to each other, not thirty rows sorted by submission time.
 */
export default async function ReviewCyclePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "review.cycle.manage",
    "review.read.all",
    "review.read.team",
    "review.participate",
  );

  const { id } = await params;
  const cycle = await getReviewCycle(session, id);
  if (!cycle) notFound();

  const mayRun = can(session, "review.cycle.manage");

  // One row per employee, carrying their reviews of each kind.
  const byEmployee = new Map<
    string,
    {
      employee: (typeof cycle.reviews)[number]["employee"];
      reviews: typeof cycle.reviews;
    }
  >();

  for (const review of cycle.reviews) {
    const entry = byEmployee.get(review.employeeId) ?? {
      employee: review.employee,
      reviews: [] as typeof cycle.reviews,
    };
    entry.reviews.push(review);
    byEmployee.set(review.employeeId, entry);
  }

  const submitted = cycle.reviews.filter((r) => r.status === "SUBMITTED").length;

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/performance"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Performance
      </Link>

      <PageHeader
        title={cycle.name}
        description={`${formatDate(cycle.periodStart)} – ${formatDate(cycle.periodEnd)} · rated out of ${cycle.ratingScaleMax}`}
        actions={
          mayRun && (
            <>
              <CycleDialog
                cycle={{
                  id: cycle.id,
                  name: cycle.name,
                  periodStart: iso(cycle.periodStart),
                  periodEnd: iso(cycle.periodEnd),
                  selfReviewDueOn: iso(cycle.selfReviewDueOn),
                  managerReviewDueOn: iso(cycle.managerReviewDueOn),
                  ratingScaleMax: String(cycle.ratingScaleMax),
                  includesPeerFeedback: cycle.includesPeerFeedback,
                  instructions: cycle.instructions ?? "",
                }}
              />
              <AdvanceCycleButton cycleId={cycle.id} status={cycle.status} />
            </>
          )
        }
      />

      <div className="surface space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <CycleStatusBadge status={cycle.status} />
          <span className="text-muted-foreground text-xs tabular-nums">
            Self-reviews due {formatDate(cycle.selfReviewDueOn)} · manager reviews
            due {formatDate(cycle.managerReviewDueOn)}
          </span>
          {cycle.includesPeerFeedback && (
            <StatusBadge label="360° enabled" tone="info" />
          )}
        </div>

        <ProgressBar
          percent={
            cycle.reviews.length === 0
              ? 0
              : (submitted / cycle.reviews.length) * 100
          }
          label={`${submitted} of ${cycle.reviews.length} submitted`}
          tone={
            cycle.reviews.length > 0 && submitted === cycle.reviews.length
              ? "positive"
              : "brand"
          }
        />

        {cycle.instructions && (
          <p className="text-muted-foreground measure border-t pt-4 text-sm">
            {cycle.instructions}
          </p>
        )}
      </div>

      {cycle.reviews.length === 0 ? (
        <div className="surface text-muted-foreground p-8 text-center text-sm">
          {mayRun
            ? "Nothing has been generated yet. Open self-reviews to create a review for every active employee."
            : "This cycle hasn't started yet."}
        </div>
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {Array.from(byEmployee.values()).map(({ employee, reviews }) => (
            <li key={employee.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-[13rem] flex-1">
                <PersonCell
                  firstName={employee.firstName}
                  lastName={employee.lastName}
                  avatarUrl={employee.avatarUrl}
                  secondary={employee.department?.name ?? employee.employeeCode}
                  size="sm"
                />
              </div>

              <ul className="flex flex-wrap gap-2">
                {reviews.map((review) => (
                  <li key={review.id}>
                    <Link
                      href={`/performance/reviews/${review.id}`}
                      className="hover:bg-muted focus-visible:ring-ring inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors outline-none focus-visible:ring-3"
                    >
                      <span className="font-medium">
                        {review.kind === "SELF"
                          ? "Self"
                          : review.kind === "MANAGER"
                            ? `Manager${review.reviewer ? ` · ${review.reviewer.firstName}` : ""}`
                            : `Peer${review.reviewer ? ` · ${review.reviewer.firstName}` : ""}`}
                      </span>
                      {review.status === "SUBMITTED" ? (
                        <StatusBadge
                          label={
                            review.overallRating
                              ? `${review.overallRating}/${cycle.ratingScaleMax}`
                              : "In"
                          }
                          tone="positive"
                        />
                      ) : (
                        <StatusBadge label="Pending" tone="warning" />
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}

function iso(value: Date): string {
  return value.toISOString().slice(0, 10);
}
