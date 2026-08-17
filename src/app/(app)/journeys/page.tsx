import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, Settings2 } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import {
  candidatesForJourney,
  listChecklistTemplates,
  listJourneys,
  progressOf,
} from "@/lib/queries/journeys";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { ProgressBar } from "@/components/progress-bar";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import { StartJourneyDialog } from "@/components/journeys/start-journey-dialog";

export const metadata: Metadata = { title: "Onboarding" };

/**
 * Onboarding and offboarding, on one screen.
 *
 * They are the same mechanism pointed in opposite directions, and an HR manager
 * on a Monday morning wants one answer — "what is outstanding?" — not two tabs.
 * Overdue tasks are surfaced at the top of each row because a checklist that is
 * 80% done and two weeks late is not going well, and a percentage alone hides
 * that.
 */
export default async function JourneysPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await requirePermission(
    "journey.read.all",
    "journey.manage",
    "journey.read.self",
  );

  const { show } = await searchParams;
  const includeFinished = show === "all";
  const mayManage = can(session, "journey.manage");

  const [journeys, templates, onboardCandidates, exitCandidates] =
    await Promise.all([
      listJourneys(session, { includeFinished }),
      mayManage ? listChecklistTemplates(session) : Promise.resolve([]),
      mayManage
        ? candidatesForJourney(session, "ONBOARDING")
        : Promise.resolve([]),
      mayManage
        ? candidatesForJourney(session, "OFFBOARDING")
        : Promise.resolve([]),
    ]);

  const rows = journeys.map((journey) => ({
    journey,
    progress: progressOf(journey.tasks),
  }));

  const onboarding = rows.filter((r) => r.journey.kind === "ONBOARDING");
  const offboarding = rows.filter((r) => r.journey.kind === "OFFBOARDING");
  const overdueTotal = rows.reduce((sum, r) => sum + r.progress.overdue, 0);
  const openTasks = rows.reduce(
    (sum, r) => sum + (r.progress.total - r.progress.done),
    0,
  );

  // The dialog needs both lists at once, keyed by the template the user picks.
  const candidateMap = [
    ...onboardCandidates.map((c) => ({
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      detail: c.designation?.title ?? c.employeeCode,
      anchorDate: isoDate(c.dateOfJoining),
    })),
    ...exitCandidates
      .filter((c) => !onboardCandidates.some((o) => o.id === c.id))
      .map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        detail: c.designation?.title ?? c.employeeCode,
        anchorDate: isoDate(c.dateOfExit ?? c.dateOfJoining),
      })),
  ];

  return (
    <PageShell>
      <PageHeader
        title="Onboarding & exits"
        description="Every checklist in flight, and what is still outstanding on each."
        actions={
          mayManage && (
            <>
              <LinkButton href="/journeys/templates" variant="outline">
                <Settings2 className="size-4" aria-hidden />
                Checklists
              </LinkButton>
              <StartJourneyDialog
                candidates={candidateMap}
                templates={templates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  kind: t.kind,
                  taskCount: t.items.length,
                }))}
              />
            </>
          )
        }
      />

      <StatRow>
        <StatTile
          label="Onboarding in progress"
          value={onboarding.filter((r) => r.journey.status !== "COMPLETED").length}
          detail="new joiners"
          tone="info"
        />
        <StatTile
          label="Exits in progress"
          value={offboarding.filter((r) => r.journey.status !== "COMPLETED").length}
          detail="clearances running"
        />
        <StatTile label="Open tasks" value={openTasks} detail="across all checklists" />
        <StatTile
          label="Overdue"
          value={overdueTotal}
          detail={overdueTotal === 0 ? "nothing late" : "tasks past their date"}
          tone={overdueTotal > 0 ? "critical" : "positive"}
        />
      </StatRow>

      <div className="flex items-center gap-3">
        <Link
          href="/journeys"
          className={filterClass(!includeFinished)}
          aria-current={!includeFinished ? "page" : undefined}
        >
          In progress
        </Link>
        <Link
          href="/journeys?show=all"
          className={filterClass(includeFinished)}
          aria-current={includeFinished ? "page" : undefined}
        >
          Everything
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={ClipboardList}
            title="Nothing running"
            description={
              mayManage
                ? "Start a checklist for a new joiner or someone leaving, and every task, owner and due date is laid out from the template."
                : "When HR starts your onboarding or exit checklist it will appear here."
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {onboarding.length > 0 && (
            <JourneySection title="Onboarding" rows={onboarding} />
          )}
          {offboarding.length > 0 && (
            <JourneySection title="Exit clearance" rows={offboarding} />
          )}
        </div>
      )}
    </PageShell>
  );
}

type Row = {
  journey: Awaited<ReturnType<typeof listJourneys>>[number];
  progress: ReturnType<typeof progressOf>;
};

function JourneySection({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold">
        {title}
        <span className="text-muted-foreground ml-2 font-normal tabular-nums">
          {rows.length}
        </span>
      </h2>
      <ul className="surface divide-y overflow-hidden">
        {rows.map(({ journey, progress }) => (
          <li key={journey.id}>
            <Link
              href={`/journeys/${journey.id}`}
              className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
            >
              <div className="min-w-[14rem] flex-1">
                <PersonCell
                  firstName={journey.employee.firstName}
                  lastName={journey.employee.lastName}
                  avatarUrl={journey.employee.avatarUrl}
                  secondary={
                    journey.employee.designation?.title ??
                    journey.employee.employeeCode
                  }
                />
              </div>

              <div className="min-w-[10rem]">
                <p className="text-sm">{journey.name}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {journey.kind === "ONBOARDING" ? "Joins" : "Leaves"}{" "}
                  {formatDate(journey.anchorDate)}
                </p>
              </div>

              <div className="min-w-[10rem] flex-1">
                <ProgressBar
                  percent={progress.percent}
                  label={`${progress.done}/${progress.total}`}
                  tone={
                    progress.overdue > 0
                      ? "critical"
                      : progress.percent === 100
                        ? "positive"
                        : "brand"
                  }
                />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {progress.overdue > 0 && (
                  <StatusBadge
                    label={`${progress.overdue} overdue`}
                    tone="critical"
                  />
                )}
                {journey.status === "COMPLETED" && (
                  <StatusBadge label="Complete" tone="positive" />
                )}
                {journey.status === "CANCELLED" && (
                  <StatusBadge label="Cancelled" tone="neutral" />
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function filterClass(active: boolean): string {
  return active
    ? "text-foreground border-foreground border-b-2 pb-1 text-sm font-medium"
    : "text-muted-foreground hover:text-foreground border-b-2 border-transparent pb-1 text-sm transition-colors";
}

function isoDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}
