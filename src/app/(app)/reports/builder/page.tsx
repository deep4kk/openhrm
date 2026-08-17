import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { datasetsFor, getDataset, runReport } from "@/lib/reports/datasets";
import { PageHeader, PageShell } from "@/components/page-header";
import { ReportBuilder } from "@/components/reports/report-builder";

export const metadata: Metadata = { title: "Report builder" };

/**
 * The builder.
 *
 * The whole definition lives in the query string — dataset, columns, filters —
 * so a report is shareable and bookmarkable before anyone saves it, and the
 * back button does the obvious thing.
 */
export default async function ReportBuilderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission("report.build");
  const params = await searchParams;

  const datasets = datasetsFor(session);

  // A saved report seeds the builder; the query string then overrides it, so
  // running a saved report and tweaking one filter does not need a new save.
  const saved = params.report
    ? await orgDb(session.org.id).savedReport.findFirst({
        where: { id: params.report },
      })
    : null;

  const datasetKey =
    params.dataset ?? saved?.dataset ?? datasets[0]?.key ?? "employees";
  const dataset = getDataset(datasetKey);

  const columns = params.columns
    ? params.columns.split(",").filter(Boolean)
    : (saved?.columns ?? dataset?.columns.slice(0, 6).map((c) => c.key) ?? []);

  const filters: Record<string, string> = {
    ...((saved?.filters as Record<string, string> | undefined) ?? {}),
  };
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith("f_") && value) filters[key.slice(2)] = value;
  }

  // Only run when the URL actually asks for it — landing on the builder from
  // the menu should show the controls, not fire a 2,000-row query.
  const shouldRun = Boolean(params.dataset || params.report);
  const results = shouldRun
    ? await runReport(session, { dataset: datasetKey, columns, filters })
    : null;

  return (
    <PageShell>
      <Link
        href="/reports"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Reports
      </Link>

      <PageHeader
        title="Report builder"
        description="Pick a dataset, choose columns, filter, export. Everything you can build here is scoped to what you are already allowed to see."
      />

      <ReportBuilder
        datasets={datasets.map((d) => ({
          key: d.key,
          label: d.label,
          description: d.description,
          columns: d.columns,
          filters: d.filters,
        }))}
        initial={{ dataset: datasetKey, columns, filters }}
        results={results}
        savedReport={
          saved
            ? {
                id: saved.id,
                name: saved.name,
                description: saved.description ?? "",
                isShared: saved.isShared,
                isMine: saved.createdById === session.user.id,
              }
            : null
        }
      />
    </PageShell>
  );
}
