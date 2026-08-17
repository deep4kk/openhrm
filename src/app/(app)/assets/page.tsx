import type { Metadata } from "next";
import Link from "next/link";
import { Laptop } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { assetSummary, listAssetCategories, listAssets } from "@/lib/queries/assets";
import {
  saveAssetCategoryAction,
  deleteAssetCategoryAction,
} from "@/lib/actions/assets";
import { formatDate } from "@/lib/dates";
import { formatCompactMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { ExportButton } from "@/components/export-button";
import { StatusBadge } from "@/components/status-badge";
import { PersonCell } from "@/components/people/person-avatar";
import { Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";
import { AssetDialog } from "@/components/assets/asset-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Assets" };

const STATUS_TONE = {
  AVAILABLE: { label: "Available", tone: "neutral" as const },
  ASSIGNED: { label: "Issued", tone: "info" as const },
  IN_REPAIR: { label: "In repair", tone: "warning" as const },
  RETIRED: { label: "Retired", tone: "neutral" as const },
  LOST: { label: "Lost", tone: "critical" as const },
};

/**
 * The asset register.
 *
 * One table, sorted so unissued kit floats to the top — because the question
 * that brings someone here is almost always "do we have a spare laptop for the
 * person starting Monday?", and the answer is a row count, not a search.
 */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string }>;
}) {
  const session = await requirePermission("asset.read.all", "asset.manage");
  const filters = await searchParams;
  const mayManage = can(session, "asset.manage");

  const [assets, categories, summary, locations] = await Promise.all([
    listAssets(session, {
      q: filters.q,
      status: filters.status,
      categoryId: filters.category,
    }),
    listAssetCategories(session),
    assetSummary(session),
    orgDb(session.org.id).location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Assets"
        description="Every laptop, phone, access card and SIM the company owns, and who is holding it."
        actions={
          mayManage && (
            <AssetDialog
              categories={categories.map((c) => ({ id: c.id, name: c.name }))}
              locations={locations}
            />
          )
        }
      />

      <StatRow>
        <StatTile label="Assets" value={summary.total} detail="on the register" />
        <StatTile
          label="Issued"
          value={summary.assigned}
          detail={`${summary.available} available`}
          tone="info"
        />
        <StatTile
          label="Needs attention"
          value={summary.attention}
          detail={
            summary.warrantyExpiring > 0
              ? `${summary.warrantyExpiring} warranties ending soon`
              : "in repair or lost"
          }
          tone={summary.attention > 0 ? "warning" : "positive"}
        />
        <StatTile
          label="Book value"
          value={formatCompactMoney(summary.bookValue, session.org.currency)}
          detail={`from ${formatCompactMoney(summary.purchaseTotal, session.org.currency)} spent`}
        />
      </StatRow>

      <FilterBar
        searchPlaceholder="Search name, tag or serial"
        searchLabel="Search assets"
        count={assets.length}
        countNoun={["asset", "assets"]}
        selects={[
          {
            key: "status",
            label: "Filter by status",
            options: [
              { value: "all", label: "Any status" },
              { value: "AVAILABLE", label: "Available" },
              { value: "ASSIGNED", label: "Issued" },
              { value: "IN_REPAIR", label: "In repair" },
              { value: "RETIRED", label: "Retired" },
              { value: "LOST", label: "Lost" },
            ],
            width: "w-[9.5rem]",
          },
          {
            key: "category",
            label: "Filter by category",
            options: [
              { value: "all", label: "All categories" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ],
          },
        ]}
      />

      <div className="surface overflow-hidden">
        {assets.length === 0 ? (
          <EmptyState
            icon={Laptop}
            title="Nothing on the register"
            description={
              mayManage
                ? "Add the first laptop or access card. Issuing it to someone puts it on their record and on their exit clearance."
                : "Nothing matches those filters."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Asset</TableHead>
                  <TableHead>Tag</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Held by</TableHead>
                  <TableHead>Since</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assets.map((asset) => {
                  const open = asset.assignments[0];
                  const status =
                    STATUS_TONE[asset.status as keyof typeof STATUS_TONE];

                  return (
                    <TableRow key={asset.id}>
                      <TableCell>
                        <Link
                          href={`/assets/${asset.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {asset.name}
                        </Link>
                        <p className="text-muted-foreground text-xs">
                          {[asset.make, asset.model].filter(Boolean).join(" ") ||
                            asset.location?.name ||
                            "—"}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {asset.assetTag}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {asset.category?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        {open ? (
                          <PersonCell
                            firstName={open.employee.firstName}
                            lastName={open.employee.lastName}
                            avatarUrl={open.employee.avatarUrl}
                            secondary={open.employee.employeeCode}
                            size="xs"
                          />
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                        {open ? formatDate(open.issuedOn) : "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge label={status.label} tone={status.tone} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <ExportButton
          filename={`assets-${new Date().toISOString().slice(0, 10)}.csv`}
          rows={[
            [
              "Tag",
              "Name",
              "Category",
              "Make",
              "Model",
              "Serial",
              "Status",
              "Held by",
              "Issued on",
              "Purchase cost",
            ],
            ...assets.map((asset) => {
              const open = asset.assignments[0];
              return [
                asset.assetTag,
                asset.name,
                asset.category?.name ?? "",
                asset.make ?? "",
                asset.model ?? "",
                asset.serialNumber ?? "",
                asset.status,
                open ? `${open.employee.firstName} ${open.employee.lastName}` : "",
                open ? formatDate(open.issuedOn) : "",
                asset.purchaseCost ? String(asset.purchaseCost) : "",
              ];
            }),
          ]}
        />
      </div>

      {mayManage && (
        <Panel
          title="Categories"
          count={categories.length}
          description="Depreciation life drives the book-value estimate above. It is straight-line and approximate — not a fixed-asset ledger."
        >
          <RecordEditor
            canManage
            noun="category"
            addLabel="Add category"
            emptyMessage="No categories yet."
            saveAction={saveAssetCategoryAction}
            deleteAction={deleteAssetCategoryAction}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              {
                name: "depreciationYears",
                label: "Depreciation life (years)",
                type: "number",
                hint: "Leave blank for things that don't depreciate, like access cards.",
              },
            ]}
            records={categories.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: `${c._count.assets} asset${
                c._count.assets === 1 ? "" : "s"
              }${c.depreciationYears ? ` · ${c.depreciationYears}-year life` : ""}`,
              values: {
                name: c.name,
                depreciationYears: c.depreciationYears
                  ? String(c.depreciationYears)
                  : "",
              },
            }))}
          />
        </Panel>
      )}
    </PageShell>
  );
}
