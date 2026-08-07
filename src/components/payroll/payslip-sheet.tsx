"use client";

import { FileText, Printer } from "lucide-react";

import { formatMoney } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/**
 * A payslip.
 *
 * The document an employee reads most carefully of anything this app produces,
 * so it is built to be checked rather than admired:
 *
 *  - Earnings and deductions sit side by side and each column totals visibly.
 *    An employee adding up the left column and getting the printed gross is the
 *    whole point.
 *  - Every computed line carries its basis underneath — "12% of basic, capped
 *    at 15,000" — so a number nobody can explain never appears.
 *  - Employer contributions are shown, clearly separated, because they are part
 *    of what the company spends and hiding them makes CTC look like a trick.
 *
 * Printing goes through the browser rather than a PDF library. A PDF renderer
 * would add a heavyweight dependency to produce something the print stylesheet
 * already gets right, and "Save as PDF" is one click away in every browser.
 */

export interface PayslipView {
  employeeName: string;
  employeeCode: string;
  designationTitle: string | null;
  departmentName: string | null;
  period: string;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  grossEarnings: number;
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
  publishedAt: string | null;
  lines: {
    code: string;
    label: string;
    type: string;
    amount: number;
    basis: string | null;
  }[];
}

export function PayslipSheet({
  payslip,
  currency,
  triggerLabel = "View",
  triggerVariant = "ghost",
}: {
  payslip: PayslipView;
  currency: string;
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant={triggerVariant} size="sm" />}>
        <FileText className="size-4" aria-hidden />
        {triggerLabel}
      </SheetTrigger>

      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Payslip · {payslip.period}</SheetTitle>
          <SheetDescription>
            {payslip.employeeName} · {payslip.employeeCode}
            {payslip.designationTitle ? ` · ${payslip.designationTitle}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-6">
          {!payslip.publishedAt && (
            <div className="border-warning/25 bg-warning-subtle text-warning rounded-md border px-3 py-2 text-xs">
              Draft — this payslip has not been released to the employee yet.
            </div>
          )}

          <dl className="grid grid-cols-3 gap-3 border-b pb-4 text-xs">
            <div>
              <dt className="text-muted-foreground">Working days</dt>
              <dd className="mt-0.5 tabular-nums">{payslip.workingDays}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Paid days</dt>
              <dd className="mt-0.5 tabular-nums">{payslip.paidDays}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Loss of pay</dt>
              <dd className="mt-0.5 tabular-nums">
                {payslip.lopDays > 0 ? (
                  <span className="text-warning">{payslip.lopDays}</span>
                ) : (
                  "—"
                )}
              </dd>
            </div>
          </dl>

          <div className="grid gap-5 sm:grid-cols-2">
            <Column
              title="Earnings"
              lines={payslip.lines.filter((l) => l.type === "EARNING")}
              total={payslip.grossEarnings}
              totalLabel="Gross earnings"
              currency={currency}
            />
            <Column
              title="Deductions"
              lines={payslip.lines.filter((l) => l.type === "DEDUCTION")}
              total={payslip.totalDeductions}
              totalLabel="Total deductions"
              currency={currency}
              negative
            />
          </div>

          <div className="bg-muted/60 flex items-center justify-between rounded-lg px-4 py-3">
            <span className="text-sm font-medium">Net pay</span>
            <span className="text-lg font-semibold tabular-nums">
              {formatMoney(payslip.netPay, currency)}
            </span>
          </div>

          {payslip.employerContributions > 0 && (
            <div>
              <h3 className="text-muted-foreground mb-2 text-xs font-medium">
                Employer contributions
              </h3>
              <ul className="space-y-1.5">
                {payslip.lines
                  .filter((l) => l.type === "EMPLOYER_CONTRIBUTION")
                  .map((line) => (
                    <li
                      key={line.code}
                      className="flex items-baseline justify-between gap-3 text-sm"
                    >
                      <span className="text-muted-foreground">{line.label}</span>
                      <span className="tabular-nums">
                        {formatMoney(line.amount, currency)}
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">
                Paid by the company on top of your gross — part of cost to
                company, not deducted from your pay.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between border-t pt-4">
            <StatusBadge
              label={payslip.publishedAt ? "Released" : "Draft"}
              tone={payslip.publishedAt ? "positive" : "neutral"}
            />
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Print / save as PDF
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Column({
  title,
  lines,
  total,
  totalLabel,
  currency,
  negative,
}: {
  title: string;
  lines: PayslipView["lines"];
  total: number;
  totalLabel: string;
  currency: string;
  negative?: boolean;
}) {
  return (
    <div>
      <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">{title}</h3>

      {lines.length === 0 ? (
        <p className="text-muted-foreground text-sm">None</p>
      ) : (
        <ul className="space-y-2.5">
          {lines.map((line) => (
            <li key={line.code}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span>{line.label}</span>
                <span className="tabular-nums">
                  {negative ? "−" : ""}
                  {formatMoney(line.amount, currency)}
                </span>
              </div>
              {line.basis && (
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {line.basis}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-baseline justify-between gap-3 border-t pt-2.5 text-sm font-medium">
        <span>{totalLabel}</span>
        <span className="tabular-nums">
          {negative ? "−" : ""}
          {formatMoney(total, currency)}
        </span>
      </div>
    </div>
  );
}
