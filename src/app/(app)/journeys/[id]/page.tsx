import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { getJourney, progressOf } from "@/lib/queries/journeys";
import { formatDate, today } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { PersonAvatar } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { JourneyTasks } from "@/components/journeys/journey-tasks";
import { CancelJourneyButton } from "@/components/journeys/cancel-journey-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(
    "journey.read.all",
    "journey.manage",
    "journey.read.self",
  );
  const { id } = await params;
  const journey = await getJourney(session, id);
  return {
    title: journey
      ? `${journey.employee.firstName} ${journey.employee.lastName} — ${journey.name}`
      : "Checklist",
  };
}

/**
 * One journey, task by task.
 *
 * Grouped by owning team rather than by date, because the people working it are
 * IT, Finance and HR — each of whom scans for their own rows first. The header
 * carries the anchor date and the overall count so the answer to "are we going
 * to be ready for Monday?" is visible without reading the list.
 */
export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "journey.read.all",
    "journey.manage",
    "journey.read.self",
  );

  const { id } = await params;
  const journey = await getJourney(session, id);
  if (!journey) notFound();

  const mayManage = can(session, "journey.manage");
  const progress = progressOf(journey.tasks);
  const now = today();

  // Who a task can be reassigned to. Only fetched for people who may reassign —
  // an employee reading their own checklist has no use for a staff directory.
  const assignable = mayManage
    ? await orgDb(session.org.id).employee.findMany({
        where: { status: { not: "EXITED" } },
        orderBy: [{ firstName: "asc" }],
        select: { id: true, firstName: true, lastName: true },
      })
    : [];

  // A task is actionable by its assignee, by the subject of the checklist, or
  // by anyone who runs journeys. Anyone else gets a read-only list.
  const canComplete =
    mayManage ||
    (can(session, "task.complete") &&
      (journey.employeeId === session.employee?.id ||
        journey.tasks.some((t) => t.assigneeId === session.employee?.id)));

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/journeys"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Onboarding &amp; exits
      </Link>

      <div className="surface flex flex-wrap items-start gap-4 p-5">
        <PersonAvatar
          firstName={journey.employee.firstName}
          lastName={journey.employee.lastName}
          avatarUrl={journey.employee.avatarUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={`${journey.employee.firstName} ${journey.employee.lastName}`}
            description={[
              journey.employee.designation?.title,
              journey.employee.department?.name,
              journey.employee.employeeCode,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              mayManage && journey.status !== "COMPLETED" ? (
                <CancelJourneyButton id={journey.id} name={journey.name} />
              ) : undefined
            }
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <span className="font-medium">{journey.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {journey.kind === "ONBOARDING" ? "Joins" : "Last working day"}{" "}
              {formatDate(journey.anchorDate)}
            </span>
            {journey.status === "COMPLETED" && (
              <StatusBadge label="Complete" tone="positive" />
            )}
            {journey.status === "CANCELLED" && (
              <StatusBadge label="Cancelled" tone="neutral" />
            )}
            {progress.overdue > 0 && (
              <StatusBadge label={`${progress.overdue} overdue`} tone="critical" />
            )}
          </div>

          <ProgressBar
            className="mt-3 max-w-md"
            percent={progress.percent}
            label={`${progress.done} of ${progress.total} done`}
            tone={
              progress.overdue > 0
                ? "critical"
                : progress.percent === 100
                  ? "positive"
                  : "brand"
            }
          />
        </div>
      </div>

      <JourneyTasks
        canManage={mayManage}
        canComplete={canComplete && journey.status !== "CANCELLED"}
        assignable={assignable.map((e) => ({
          id: e.id,
          name: `${e.firstName} ${e.lastName}`,
        }))}
        tasks={journey.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          status: task.status,
          dueLabel: formatDate(task.dueDate),
          isOverdue:
            task.status === "PENDING" && !!task.dueDate && task.dueDate < now,
          note: task.note,
          assignee: task.assignee
            ? {
                id: task.assignee.id,
                name: `${task.assignee.firstName} ${task.assignee.lastName}`,
              }
            : null,
        }))}
      />
    </PageShell>
  );
}
