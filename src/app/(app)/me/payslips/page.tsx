import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Wallet } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { listMyPayslips } from "@/lib/queries/payroll";
import { periodLabel } from "@/lib/actions/payroll";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PayslipSheet } from "@/components/payroll/payslip-sheet";

export const metadata: Metadata = { title: "My payslips" };

/**
 * An employee's own payslips.
 *
 * Only released payslips appear — a run under review is the payroll team's
 * working document, not a statement about this person's pay. That filter lives
 * in the query rather than here, so no future page can accidentally leak a
 * draft.
 */
export default async function MyPayslipsPage() {
  const session = await requirePermission("payroll.read.self");
  const payslips = await listMyPayslips(session);
  const currency = session.org.currency;

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/me"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex w-fit items-center gap-1 rounded-md text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden />
        My space
      </Link>

      <PageHeader
        title="Payslips"
        description="Every payslip released to you, newest first. Open one to see the full breakdown, or print it as a PDF."
      />

      <div className="surface overflow-hidden">
        {payslips.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No payslips yet"
            description="Your payslip appears here as soon as the month's payroll is approved."
          />
        ) : (
          <ul className="divide-y">
            {payslips.map((slip) => (
              <li
                key={slip.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="text-sm font-medium">
                    {periodLabel(slip.run.periodMonth, slip.run.periodYear)}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {slip.run.payDate
                      ? `Paid ${formatDate(slip.run.payDate)}`
                      : `Released ${formatDate(slip.publishedAt!)}`}
                    {Number(slip.lopDays) > 0 &&
                      ` · ${Number(slip.lopDays)} day(s) loss of pay`}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {formatMoney(Number(slip.netPay), currency)}
                    </p>
                    <p className="text-muted-foreground text-[11px]">net pay</p>
                  </div>

                  <PayslipSheet
                    currency={currency}
                    triggerVariant="outline"
                    payslip={{
                      employeeName: slip.employeeName,
                      employeeCode: slip.employeeCode,
                      designationTitle: slip.designationTitle,
                      departmentName: slip.departmentName,
                      period: periodLabel(slip.run.periodMonth, slip.run.periodYear),
                      workingDays: Number(slip.workingDays),
                      paidDays: Number(slip.paidDays),
                      lopDays: Number(slip.lopDays),
                      grossEarnings: Number(slip.grossEarnings),
                      totalDeductions: Number(slip.totalDeductions),
                      employerContributions: Number(slip.employerContributions),
                      netPay: Number(slip.netPay),
                      publishedAt: slip.publishedAt?.toISOString() ?? null,
                      lines: slip.lines.map((line) => ({
                        code: line.code,
                        label: line.label,
                        type: line.type,
                        amount: Number(line.amount),
                        basis: line.basis,
                      })),
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
