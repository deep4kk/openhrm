"use client";

import { useActionState, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Play, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteReportAction, saveReportAction } from "@/lib/actions/reports";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ExportButton } from "@/components/export-button";
import { StatusBadge } from "@/components/status-badge";

/**
 * The report builder.
 *
 * Definition on the left, results underneath, one "Run" button between them.
 * Running goes through the URL rather than local state, so a useful report is a
 * shareable link before anyone bothers to save it — which is how most of them
 * are actually used.
 *
 * What the builder does *not* offer is a free-text filter or a formula box.
 * Every control here maps onto a whitelisted key, because the alternative —
 * user-supplied query fragments — is how a report builder becomes a way to read
 * another tenant.
 */

export interface ColumnOption {
  key: string;
  label: string;
  numeric?: boolean;
}

export interface FilterOption {
  key: string;
  label: string;
  type: "select" | "date" | "text";
  options?: { value: string; label: string }[];
}

export interface DatasetOption {
  key: string;
  label: string;
  description: string;
  columns: ColumnOption[];
  filters: FilterOption[];
}

export function ReportBuilder({
  datasets,
  initial,
  results,
  savedReport,
}: {
  datasets: DatasetOption[];
  initial: {
    dataset: string;
    columns: string[];
    filters: Record<string, string>;
  };
  results: {
    columns: ColumnOption[];
    rows: (string | number | null)[][];
    truncated: boolean;
  } | null;
  savedReport: {
    id: string;
    name: string;
    description: string;
    isShared: boolean;
    isMine: boolean;
  } | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [running, startRun] = useTransition();

  const [datasetKey, setDatasetKey] = useState(initial.dataset);
  const [columns, setColumns] = useState<string[]>(initial.columns);
  const [filters, setFilters] = useState<Record<string, string>>(initial.filters);
  const [saving, setSaving] = useState(false);

  const dataset = datasets.find((d) => d.key === datasetKey) ?? datasets[0];

  function switchDataset(key: string) {
    const next = datasets.find((d) => d.key === key);
    setDatasetKey(key);
    // Columns and filters belong to a dataset; carrying them across would keep
    // names that mean nothing in the new one.
    setColumns(next ? next.columns.slice(0, 6).map((c) => c.key) : []);
    setFilters({});
  }

  function run() {
    const query = new URLSearchParams();
    query.set("dataset", datasetKey);
    query.set("columns", columns.join(","));
    for (const [key, value] of Object.entries(filters)) {
      if (value) query.set(`f_${key}`, value);
    }
    const report = params.get("report");
    if (report) query.set("report", report);

    startRun(() => {
      router.replace(`${pathname}?${query.toString()}`, { scroll: false });
    });
  }

  if (!dataset) {
    return (
      <div className="surface text-muted-foreground p-8 text-center text-sm">
        You do not have access to any reportable dataset.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="surface space-y-5 p-5">
        <div className="space-y-2">
          <Label htmlFor="dataset">What are you reporting on</Label>
          <select
            id="dataset"
            value={datasetKey}
            onChange={(e) => switchDataset(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm sm:max-w-sm"
          >
            {datasets.map((d) => (
              <option key={d.key} value={d.key}>
                {d.label}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">{dataset.description}</p>
        </div>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">
            Columns
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {columns.length}
            </span>
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {dataset.columns.map((column) => (
              <li key={column.key} className="flex items-center gap-2">
                <Checkbox
                  id={`col-${column.key}`}
                  checked={columns.includes(column.key)}
                  onCheckedChange={() =>
                    setColumns((cur) =>
                      cur.includes(column.key)
                        ? cur.filter((k) => k !== column.key)
                        : [...cur, column.key],
                    )
                  }
                />
                <Label htmlFor={`col-${column.key}`} className="font-normal">
                  {column.label}
                </Label>
              </li>
            ))}
          </ul>
        </div>

        {dataset.filters.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium">Filters</p>
            <div className="grid gap-4 sm:grid-cols-3">
              {dataset.filters.map((filter) => (
                <div key={filter.key} className="space-y-1.5">
                  <Label htmlFor={`filter-${filter.key}`}>{filter.label}</Label>
                  {filter.type === "select" ? (
                    <select
                      id={`filter-${filter.key}`}
                      value={filters[filter.key] ?? ""}
                      onChange={(e) =>
                        setFilters((cur) => ({
                          ...cur,
                          [filter.key]: e.target.value,
                        }))
                      }
                      className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                    >
                      {(filter.options ?? []).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      id={`filter-${filter.key}`}
                      type={filter.type === "date" ? "date" : "text"}
                      value={filters[filter.key] ?? ""}
                      onChange={(e) =>
                        setFilters((cur) => ({
                          ...cur,
                          [filter.key]: e.target.value,
                        }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <div className="flex items-center gap-2">
            {savedReport && (
              <>
                <StatusBadge
                  label={savedReport.isShared ? "Shared" : "Private"}
                  tone={savedReport.isShared ? "info" : "neutral"}
                />
                <span className="text-sm font-medium">{savedReport.name}</span>
              </>
            )}
          </div>

          <div className="flex gap-2">
            {savedReport?.isMine && (
              <DeleteReportButton
                reportId={savedReport.id}
                name={savedReport.name}
              />
            )}
            <Button
              variant="outline"
              onClick={() => setSaving(true)}
              disabled={columns.length === 0}
            >
              <Save className="size-4" aria-hidden />
              Save
            </Button>
            <Button onClick={run} disabled={running || columns.length === 0}>
              {running ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Play className="size-4" aria-hidden />
              )}
              Run
            </Button>
          </div>
        </div>
      </div>

      {saving && (
        <SaveForm
          dataset={datasetKey}
          columns={columns}
          filters={filters}
          savedReport={savedReport}
          onClose={() => setSaving(false)}
        />
      )}

      {results && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              Results
              <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                {results.rows.length}
                {results.truncated && "+"}
              </span>
            </h2>
            {results.rows.length > 0 && (
              <ExportButton
                filename={`${datasetKey}-report-${new Date().toISOString().slice(0, 10)}.csv`}
                rows={[
                  results.columns.map((c) => c.label),
                  ...results.rows,
                ]}
              />
            )}
          </div>

          {results.truncated && (
            <p className="border-warning/40 bg-warning-subtle mb-3 rounded-md border px-3 py-2 text-xs">
              Cut off at 2,000 rows. Narrow the filters — a report is for
              reading, and anything longer is a database export.
            </p>
          )}

          <div className="surface overflow-x-auto">
            {results.rows.length === 0 ? (
              <p className="text-muted-foreground p-8 text-center text-sm">
                Nothing matched those filters.
              </p>
            ) : (
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    {results.columns.map((column) => (
                      <th
                        key={column.key}
                        className={
                          column.numeric
                            ? "px-3 py-2 text-right font-medium whitespace-nowrap"
                            : "px-3 py-2 text-left font-medium whitespace-nowrap"
                        }
                      >
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.rows.map((row, index) => (
                    <tr key={index} className="border-b last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td
                          key={cellIndex}
                          className={
                            results.columns[cellIndex]?.numeric
                              ? "px-3 py-2 text-right tabular-nums"
                              : "px-3 py-2"
                          }
                        >
                          {cell ?? "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function SaveForm({
  dataset,
  columns,
  filters,
  savedReport,
  onClose,
}: {
  dataset: string;
  columns: string[];
  filters: Record<string, string>;
  savedReport: { id: string; name: string; description: string; isShared: boolean; isMine: boolean } | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveReportAction,
    {},
  );

  const updating = savedReport?.isMine ?? false;

  return (
    <form action={action} className="surface space-y-4 p-5">
      <FormError message={state.error} />
      {updating && <input type="hidden" name="id" value={savedReport!.id} />}
      <input type="hidden" name="dataset" value={dataset} />
      <input type="hidden" name="columns" value={JSON.stringify(columns)} />
      <input type="hidden" name="filters" value={JSON.stringify(filters)} />

      <h2 className="text-sm font-semibold">
        {updating ? "Update this report" : "Save this report"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="Name"
          name="name"
          error={state.fieldErrors?.name}
          required
        >
          {(p) => (
            <Input {...p} defaultValue={savedReport?.name} maxLength={120} />
          )}
        </FormField>

        <FormField label="Description" name="description">
          {(p) => (
            <Input
              {...p}
              defaultValue={savedReport?.description}
              maxLength={300}
            />
          )}
        </FormField>
      </div>

      <div className="flex items-start gap-3">
        <Checkbox
          id="isShared"
          name="isShared"
          defaultChecked={savedReport?.isShared}
        />
        <Label htmlFor="isShared" className="font-normal">
          Share it with colleagues
          <span className="text-muted-foreground mt-0.5 block text-xs">
            Anyone who can read this dataset sees the report. What they get back
            is still scoped to their own access — a manager running a shared
            headcount report sees their team, not the company.
          </span>
        </Label>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {updating ? "Update" : "Save report"}
        </Button>
      </div>
    </form>
  );
}

function DeleteReportButton({
  reportId,
  name,
}: {
  reportId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={() => {
        if (!confirm(`Delete the "${name}" report?`)) return;
        startTransition(async () => {
          const result = await deleteReportAction(reportId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Report deleted");
          router.push("/reports");
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
    </Button>
  );
}
