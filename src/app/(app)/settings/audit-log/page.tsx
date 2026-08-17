import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { formatRelative } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { FilterBar } from "@/components/filter-bar";
import { ExportButton } from "@/components/export-button";
import { StatusBadge } from "@/components/status-badge";
import { ScrollText } from "lucide-react";

export const metadata: Metadata = { title: "Audit log" };

/** Actions that change who can do what, or expose data. Flagged in the list. */
const SENSITIVE_PREFIXES = [
  "role.",
  "user.role",
  "user.suspended",
  "apikey.",
  "webhook.",
  "employee.sensitive",
  "employee.compensation",
  "payroll.",
  "settlement.",
  "data.exported",
];

/**
 * The audit trail (PRD §8.18, §8.28).
 *
 * Append-only: nothing in the application updates or deletes rows in this
 * table, and there is no UI here that could. Reads are filtered rather than
 * paginated into oblivion, because the question is usually "what happened to
 * this employee record" rather than "show me everything".
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string }>;
}) {
  const session = await requirePermission("audit.read");
  const filters = await searchParams;

  const entries = await orgDb(session.org.id).auditLog.findMany({
    where: {
      ...(filters.entity && filters.entity !== "all"
        ? { entityType: filters.entity }
        : {}),
      ...(filters.q
        ? {
            OR: [
              { summary: { contains: filters.q, mode: "insensitive" as const } },
              { actorLabel: { contains: filters.q, mode: "insensitive" as const } },
              { action: { contains: filters.q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 250,
  });

  const entityTypes = Array.from(
    new Set(entries.map((entry) => entry.entityType)),
  ).sort();

  return (
    <PageShell className="max-w-5xl">
      <BackToSettings />

      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Nothing in the application can edit or delete these rows — the table is written to and read from, never updated."
      />

      <FilterBar
        searchPlaceholder="Search actor, action or summary"
        searchLabel="Search the audit log"
        count={entries.length}
        countNoun={["entry", "entries"]}
        selects={[
          {
            key: "entity",
            label: "Filter by record type",
            options: [
              { value: "all", label: "All records" },
              ...entityTypes.map((type) => ({ value: type, label: type })),
            ],
          },
        ]}
      />

      <div className="surface overflow-hidden">
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Nothing logged"
            description="Consequential actions — permission changes, salary edits, data exports — are recorded here as they happen."
          />
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => {
              const sensitive = SENSITIVE_PREFIXES.some((prefix) =>
                entry.action.startsWith(prefix),
              );

              return (
                <li key={entry.id} className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="text-xs">{entry.action}</code>
                      {sensitive && (
                        <StatusBadge label="Sensitive" tone="warning" />
                      )}
                    </div>
                    <p className="mt-0.5 text-sm">
                      {entry.summary ?? `${entry.entityType} ${entry.entityId ?? ""}`}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {entry.actorLabel}
                      {entry.ipAddress && ` · ${entry.ipAddress}`}
                    </p>
                  </div>

                  <time
                    className="text-muted-foreground shrink-0 text-xs tabular-nums"
                    dateTime={entry.createdAt.toISOString()}
                  >
                    {formatRelative(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {entries.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Showing the most recent {entries.length}
            {entries.length === 250 && " — narrow the filters to see further back"}
            .
          </p>
          <ExportButton
            filename={`audit-log-${new Date().toISOString().slice(0, 10)}.csv`}
            rows={[
              ["When", "Actor", "Action", "Record", "Id", "Summary", "IP"],
              ...entries.map((entry) => [
                entry.createdAt.toISOString(),
                entry.actorLabel,
                entry.action,
                entry.entityType,
                entry.entityId ?? "",
                entry.summary ?? "",
                entry.ipAddress ?? "",
              ]),
            ]}
          />
        </div>
      )}
    </PageShell>
  );
}
