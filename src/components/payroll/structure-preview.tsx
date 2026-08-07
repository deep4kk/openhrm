"use client";

import { useMemo, useState } from "react";

import {
  calculatePayslip,
  type EngineComponent,
  type StatutoryConfig,
} from "@/lib/payroll/engine";
import { formatMoney } from "@/lib/money";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * "What does this structure actually pay?"
 *
 * Runs the real payroll engine in the browser against a CTC the admin types, so
 * the answer is the same code that will produce the payslip — not a second
 * implementation that drifts. A full month with no loss of pay is assumed,
 * which is the case being reasoned about.
 */
export function StructurePreview({
  components,
  statutory,
  currency,
}: {
  components: EngineComponent[];
  statutory: StatutoryConfig;
  currency: string;
}) {
  const [ctc, setCtc] = useState(1_200_000);

  const result = useMemo(() => {
    if (!Number.isFinite(ctc) || ctc <= 0) return null;
    return calculatePayslip({
      annualCtc: ctc,
      components,
      statutory,
      workingDays: 22,
      paidDays: 22,
    });
  }, [ctc, components, statutory]);

  const earnings = result?.lines.filter((l) => l.type === "EARNING") ?? [];
  const deductions = result?.lines.filter((l) => l.type === "DEDUCTION") ?? [];
  const employer = result?.lines.filter((l) => l.type === "EMPLOYER_CONTRIBUTION") ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label htmlFor={`ctc-${components.length}`}>Annual CTC</Label>
          <Input
            id={`ctc-${components.length}`}
            type="number"
            step="10000"
            min="0"
            value={ctc}
            onChange={(event) => setCtc(Number(event.target.value))}
            className="w-44 tabular-nums"
          />
        </div>
        <p className="text-muted-foreground pb-2.5 text-xs">
          Full month, no loss of pay. Calculated by the same engine that produces
          real payslips.
        </p>
      </div>

      {result && (
        <>
          <div className="grid gap-5 sm:grid-cols-3">
            <Column title="Earnings" lines={earnings} currency={currency} />
            <Column title="Deductions" lines={deductions} currency={currency} negative />
            <Column
              title="Employer contributions"
              lines={employer}
              currency={currency}
              muted
            />
          </div>

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-3">
            <Total
              label="Monthly gross"
              value={formatMoney(result.grossEarnings, currency)}
            />
            <Total
              label="Take home"
              value={formatMoney(result.netPay, currency)}
              emphasis
            />
            <Total
              label="Annual cost to company"
              value={formatMoney(
                (result.grossEarnings + result.employerContributions) * 12,
                currency,
              )}
              detail={
                Math.abs(
                  (result.grossEarnings + result.employerContributions) * 12 - ctc,
                ) <= 24
                  ? "reconciles to the CTC entered"
                  : undefined
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

function Column({
  title,
  lines,
  currency,
  negative,
  muted,
}: {
  title: string;
  lines: { code: string; label: string; amount: number; basis: string | null }[];
  currency: string;
  negative?: boolean;
  muted?: boolean;
}) {
  if (lines.length === 0) return null;

  return (
    <div>
      <h3 className="text-muted-foreground mb-2 text-xs font-medium">{title}</h3>
      <ul className="space-y-2">
        {lines.map((line) => (
          <li key={line.code}>
            <div
              className={
                muted
                  ? "text-muted-foreground flex items-baseline justify-between gap-2 text-sm"
                  : "flex items-baseline justify-between gap-2 text-sm"
              }
            >
              <span>{line.label}</span>
              <span className="tabular-nums">
                {negative ? "−" : ""}
                {formatMoney(line.amount, currency)}
              </span>
            </div>
            {line.basis && (
              <p className="text-muted-foreground text-[11px]">{line.basis}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Total({
  label,
  value,
  detail,
  emphasis,
}: {
  label: string;
  value: string;
  detail?: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={
          emphasis
            ? "mt-0.5 text-lg font-semibold tabular-nums"
            : "mt-0.5 text-sm font-medium tabular-nums"
        }
      >
        {value}
      </p>
      {detail && <p className="text-muted-foreground mt-0.5 text-[11px]">{detail}</p>}
    </div>
  );
}
