"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { getDataset } from "../reports/datasets";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Saved reports (PRD §8.13).
 *
 * A saved report stores a dataset name, a column list and a filter object —
 * never SQL. See the comment at the top of src/lib/reports/datasets.ts for why
 * that constraint is the whole security model of this feature.
 *
 * Anything unrecognised is filtered out at save time as well as at run time.
 * Belt and braces, because a definition written today is run for years.
 */

const reportSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(3, "Name the report").max(120),
  description: z.string().trim().max(300).optional(),
  dataset: z.string().min(1),
  columns: z.string(),
  filters: z.string(),
  isShared: z.string().optional(),
});

export async function saveReportAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "report.build");

  const parsed = reportSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const dataset = getDataset(parsed.data.dataset);
  if (!dataset) return { error: "Unknown dataset." };

  const allowed = dataset.permissions.some((permission) =>
    session.role.permissions.includes(permission),
  );
  if (!allowed) {
    return { error: "You do not have access to that dataset." };
  }

  let columns: string[];
  let filters: Record<string, string>;
  try {
    columns = z
      .array(z.string())
      .parse(JSON.parse(parsed.data.columns))
      .filter((key) => dataset.columns.some((column) => column.key === key));

    const rawFilters = z
      .record(z.string(), z.string())
      .parse(JSON.parse(parsed.data.filters));

    filters = Object.fromEntries(
      Object.entries(rawFilters).filter(
        ([key, value]) =>
          value !== "" && dataset.filters.some((filter) => filter.key === key),
      ),
    );
  } catch {
    return { error: "Could not read the report definition." };
  }

  if (columns.length === 0) {
    return { fieldErrors: { columns: "Choose at least one column." } };
  }

  const db = orgDb(session.org.id);

  const clash = await db.savedReport.findFirst({
    where: {
      name: parsed.data.name,
      ...(parsed.data.id ? { NOT: { id: parsed.data.id } } : {}),
    },
  });
  if (clash) {
    return { fieldErrors: { name: "A report with that name already exists." } };
  }

  const data = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    dataset: dataset.key,
    columns,
    filters,
    isShared: parsed.data.isShared === "on",
  };

  let reportId: string;

  if (parsed.data.id) {
    const existing = await db.savedReport.findFirst({
      where: { id: parsed.data.id },
    });
    if (!existing) return { error: "That report no longer exists." };

    // A shared report is a thing other people rely on, so only its author can
    // rewrite it. Anyone else can run it and save their own copy.
    if (existing.createdById !== session.user.id) {
      return {
        error:
          "This report belongs to someone else. Run it and save a copy under your own name instead.",
      };
    }

    await db.savedReport.update({ where: { id: parsed.data.id }, data });
    reportId = parsed.data.id;
  } else {
    const created = await db.savedReport.create({
      data: { orgId: session.org.id, ...data, createdById: session.user.id },
    });
    reportId = created.id;
  }

  await audit(session, {
    action: "report.saved",
    entityType: "SavedReport",
    entityId: reportId,
    summary: `${parsed.data.id ? "Updated" : "Saved"} report "${parsed.data.name}" over ${dataset.label}`,
  });

  revalidatePath("/reports");
  redirect(`/reports/builder?report=${reportId}`);
}

export async function deleteReportAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "report.build");

  const db = orgDb(session.org.id);
  const report = await db.savedReport.findFirst({ where: { id } });
  if (!report) return { error: "That report no longer exists." };

  if (report.createdById !== session.user.id) {
    return { error: "That report belongs to someone else." };
  }

  await db.savedReport.delete({ where: { id } });

  await audit(session, {
    action: "report.deleted",
    entityType: "SavedReport",
    entityId: id,
    summary: `Deleted report "${report.name}"`,
  });

  revalidatePath("/reports");
  return { success: true };
}

/**
 * Records that a report was exported.
 *
 * PRD §8.28 lists data exports among the actions that must be audited. The CSV
 * itself is built in the browser from rows already on screen, so this is the
 * only place the export becomes visible to the audit trail — and an export of
 * the payroll dataset is exactly the event a security review asks about.
 */
export async function logReportExportAction(
  dataset: string,
  rowCount: number,
): Promise<void> {
  const session = await requireAuth();

  await audit(session, {
    action: "data.exported",
    entityType: "SavedReport",
    summary: `Exported ${rowCount} rows from the ${dataset} dataset`,
  });
}
