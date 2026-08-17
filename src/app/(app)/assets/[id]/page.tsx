import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { getAsset, listAssetCategories } from "@/lib/queries/assets";
import { formatDate, today } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { PersonCell } from "@/components/people/person-avatar";
import { Field } from "@/components/settings/panel";
import { AssetDialog } from "@/components/assets/asset-dialog";
import {
  IssueAssetDialog,
  ReturnAssetDialog,
} from "@/components/assets/issue-return-dialogs";
import { DeleteAssetButton } from "@/components/assets/delete-asset-button";

const STATUS_TONE = {
  AVAILABLE: { label: "Available", tone: "neutral" as const },
  ASSIGNED: { label: "Issued", tone: "info" as const },
  IN_REPAIR: { label: "In repair", tone: "warning" as const },
  RETIRED: { label: "Retired", tone: "neutral" as const },
  LOST: { label: "Lost", tone: "critical" as const },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission("asset.read.all", "asset.manage");
  const { id } = await params;
  const asset = await getAsset(session, id);
  return { title: asset ? `${asset.name} · ${asset.assetTag}` : "Asset" };
}

/**
 * One asset, and everywhere it has been.
 *
 * The assignment history is the point of the page. "Who had this before?" is
 * the question asked when a machine comes back with someone else's files on it,
 * and a register that only stores the current holder cannot answer it.
 */
export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("asset.read.all", "asset.manage");
  const { id } = await params;

  const asset = await getAsset(session, id);
  if (!asset) notFound();

  const mayManage = can(session, "asset.manage");
  const open = asset.assignments.find((a) => !a.returnedOn);
  const status = STATUS_TONE[asset.status as keyof typeof STATUS_TONE];

  const [categories, locations, employees] = await Promise.all([
    listAssetCategories(session),
    orgDb(session.org.id).location.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    mayManage && !open
      ? orgDb(session.org.id).employee.findMany({
          where: { status: { not: "EXITED" } },
          orderBy: [{ firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            designation: { select: { title: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const warrantyLive =
    asset.warrantyEndsOn && asset.warrantyEndsOn >= today();

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/assets"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Assets
      </Link>

      <PageHeader
        title={asset.name}
        description={`${asset.assetTag}${
          asset.category ? ` · ${asset.category.name}` : ""
        }`}
        actions={
          mayManage && (
            <>
              {open ? (
                <ReturnAssetDialog
                  assignmentId={open.id}
                  assetName={asset.name}
                  holderName={`${open.employee.firstName} ${open.employee.lastName}`}
                />
              ) : (
                asset.status !== "RETIRED" &&
                asset.status !== "LOST" && (
                  <IssueAssetDialog
                    assetId={asset.id}
                    assetName={asset.name}
                    employees={employees.map((e) => ({
                      id: e.id,
                      name: `${e.firstName} ${e.lastName}`,
                      detail: e.designation?.title ?? e.employeeCode,
                    }))}
                  />
                )
              )}
              <AssetDialog
                categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                locations={locations}
                asset={{
                  id: asset.id,
                  name: asset.name,
                  assetTag: asset.assetTag,
                  categoryId: asset.categoryId ?? "",
                  serialNumber: asset.serialNumber ?? "",
                  make: asset.make ?? "",
                  model: asset.model ?? "",
                  locationId: asset.locationId ?? "",
                  purchaseDate: isoDate(asset.purchaseDate),
                  purchaseCost: asset.purchaseCost
                    ? String(asset.purchaseCost)
                    : "",
                  warrantyEndsOn: isoDate(asset.warrantyEndsOn),
                  condition: asset.condition,
                  status: asset.status,
                  note: asset.note ?? "",
                }}
              />
            </>
          )
        }
      />

      <div className="surface p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <StatusBadge label={status.label} tone={status.tone} />
          <StatusBadge
            label={`Condition: ${asset.condition.toLowerCase()}`}
            tone={
              asset.condition === "DAMAGED" || asset.condition === "POOR"
                ? "warning"
                : "neutral"
            }
          />
          {asset.warrantyEndsOn && (
            <StatusBadge
              label={
                warrantyLive
                  ? `Warranty to ${formatDate(asset.warrantyEndsOn)}`
                  : "Out of warranty"
              }
              tone={warrantyLive ? "positive" : "neutral"}
            />
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <Field label="Make" value={asset.make} />
          <Field label="Model" value={asset.model} />
          <Field label="Serial number" value={asset.serialNumber} mono />
          <Field label="Location" value={asset.location?.name} />
          <Field
            label="Purchased"
            value={asset.purchaseDate ? formatDate(asset.purchaseDate) : null}
          />
          <Field
            label="Cost"
            value={
              asset.purchaseCost
                ? formatMoney(Number(asset.purchaseCost), session.org.currency)
                : null
            }
          />
        </dl>

        {asset.note && (
          <p className="text-muted-foreground measure mt-4 border-t pt-4 text-sm">
            {asset.note}
          </p>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold">
          Assignment history
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">
            {asset.assignments.length}
          </span>
        </h2>

        {asset.assignments.length === 0 ? (
          <div className="surface text-muted-foreground p-6 text-center text-sm">
            This asset has never been issued.
          </div>
        ) : (
          <ul className="surface divide-y overflow-hidden">
            {asset.assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-start gap-4 p-4"
              >
                <div className="min-w-[12rem] flex-1">
                  <PersonCell
                    firstName={assignment.employee.firstName}
                    lastName={assignment.employee.lastName}
                    avatarUrl={assignment.employee.avatarUrl}
                    secondary={
                      assignment.employee.designation?.title ??
                      assignment.employee.employeeCode
                    }
                    size="sm"
                  />
                </div>

                <div className="text-muted-foreground min-w-[12rem] text-xs tabular-nums">
                  <p>
                    Issued {formatDate(assignment.issuedOn)} in{" "}
                    {assignment.issueCondition.toLowerCase()} condition
                  </p>
                  {assignment.returnedOn ? (
                    <p>
                      Returned {formatDate(assignment.returnedOn)}
                      {assignment.returnCondition &&
                        ` in ${assignment.returnCondition.toLowerCase()} condition`}
                    </p>
                  ) : (
                    <p className="text-foreground font-medium">
                      Still held
                      {assignment.dueOn &&
                        ` · due back ${formatDate(assignment.dueOn)}`}
                    </p>
                  )}
                  {assignment.issuedBy && <p>By {assignment.issuedBy.name}</p>}
                </div>

                {(assignment.issueNote || assignment.returnNote) && (
                  <p className="bg-muted measure w-full rounded-md px-2.5 py-1.5 text-xs">
                    {[assignment.issueNote, assignment.returnNote]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {mayManage && asset.assignments.length === 0 && (
        <div className="flex justify-end">
          <DeleteAssetButton id={asset.id} name={asset.name} />
        </div>
      )}
    </PageShell>
  );
}

function isoDate(value: Date | null): string {
  return value ? value.toISOString().slice(0, 10) : "";
}
