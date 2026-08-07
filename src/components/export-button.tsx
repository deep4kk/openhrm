"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * CSV export (PRD §8.23).
 *
 * Built in the browser from data already on the page rather than round-tripping
 * to an endpoint: the rows are rendered, so a second query would only introduce
 * a way for the file and the screen to disagree.
 *
 * Two details that matter more than they look:
 *  - Every field is quoted and internal quotes doubled, so a name like
 *    O'Brien, Sr. or an address with a comma doesn't shift every later column.
 *  - A UTF-8 BOM is prepended, because Excel on Windows otherwise reads ₹ and
 *    accented names as mojibake — and the primary audience opens these in Excel.
 */
export function ExportButton({
  rows,
  filename,
  label = "Export CSV",
  variant = "outline",
}: {
  /** First row is the header. */
  rows: (string | number | null | undefined)[][];
  filename: string;
  label?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  function download() {
    const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob([`﻿${csv}`], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant={variant} size="sm" onClick={download}>
      <Download className="size-4" aria-hidden />
      {label}
    </Button>
  );
}

function escapeCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
