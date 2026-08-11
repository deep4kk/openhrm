import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { getPayrollRun } from "@/lib/queries/payroll";
import { periodLabel } from "@/lib/payroll/period";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { PayrollStatusBadge } from "@/components/payroll/status-badge";
import { RunActions } from "@/components/payroll/run-actions";
import { PayslipSheet } from "@/components/payroll/payslip-sheet";
import { ExportButton } from "@/components/export-button";

export const metadata: Metadata = { title: "Payroll run" };

/**
 * One payroll run.
 *
 * The register is the artefact the payroll owner checks line by line before
 * approving, so it is a plain dense table: one row per person, the four numbers
 * that matter, and a click to see the full breakdown. Loss-of-pay days are
 * called out in the row rather than buried in the payslip, because an
 * unexpected LOP is the single most common reason a run gets sent back.
 */
export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("payroll.read.all", "payroll.run");
  const { id } = await params;

  const run = await getPayrollRun(session, id);
  if (!run) notFound();

  const currency = session.org.currency;
  const editable = run.status === "DRAFT" || run.status === "REVIEW";

  return (
    <PageShell>
      <Link
        href="/payroll"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex w-fit items-center gap-1 rounded-md text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Payroll
      </Link>

      <PageHeader
        title={periodLabel(run.periodMonth, run.periodYear)}
        description={
          run.payDate
            ? `Pay date ${formatDate(run.payDate)}${run.note ? ` · ${run.note}` : ""}`
            : run.note ?? "No pay date set."
        }
        actions={
          <div className="flex items-center gap-2">
            {run.payslips.length > 0 && (
              <ExportButton
                filename={`payroll-${run.periodYear}-${String(run.periodMonth).padStart(2, "0")}.csv`}
                rows={[
                  [
                    "Employee code",
                    "Name",
                    "Department",
                    "Working days",
                    "Paid days",
                    "LOP days",
                    "Gross",
                    "Deductions",
                    "Net pay",
                    "Employer cost",
                  ],
                  ...run.payslips.map((slip) => [
                    slip.employeeCode,
                    slip.employeeName,
                    slip.departmentName ?? "",
                    String(slip.workingDays),
                    String(slip.paidDays),
                    String(slip.lopDays),
                    String(slip.grossEarnings),
                    String(slip.totalDeductions),
                    String(slip.netPay),
                    String(
                      Number(slip.grossEarnings) + Number(slip.employerContributions),
                    ),
                  ]),
                ]}
              />
            )}
            <RunActions
              runId={run.id}
              status={run.status}
              payslipCount={run.payslips.length}
              canRun={can(session, "payroll.run")}
              canApprove={can(session, "payroll.approve")}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <PayrollStatusBadge status={run.status} />
        {run.approvedBy && run.approvedAt && (
          <span className="text-muted-foreground text-xs">
            Approved by {run.approvedBy.name} on {formatDate(run.approvedAt)}
          </span>
        )}
        {run.processedAt && !run.approvedAt && (
          <span className="text-muted-foreground text-xs">
            Last calculated {formatDate(run.processedAt)}
          </span>
        )}
      </div>

      {run.payslips.length > 0 && (
        <dl className="surface grid gap-x-6 gap-y-4 p-5 sm:grid-cols-4">
          <Figure label="Employees" value={String(run.headcount)} />
          <Figure label="Gross earnings" value={formatMoney(Number(run.totalGross), currency)} />
          <Figure
            label="Total deductions"
            value={formatMoney(Number(run.totalDeductions), currency)}
          />
          <Figure
            label="Net payable"
            value={formatMoney(Number(run.totalNet), currency)}
            emphasis
          />
        </dl>
      )}

      <section className="surface overflow-hidden">
        {run.payslips.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nothing calculated yet"
            description={
              editable
                ? "Calculate the run to build payslips from each employee's salary structure, their attendance and their leave."
                : "This run has no payslips."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-xs">
                  <th className="px-4 py-2.5 text-left font-medium">Employee</th>
                  <th className="px-4 py-2.5 text-right font-medium">Paid days</th>
                  <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                  <th className="px-4 py-2.5 text-right font-medium">Deductions</th>
                  <th className="px-4 py-2.5 text-right font-medium">Net pay</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {run.payslips.map((slip) => (
                  <tr key={slip.id} className="hover:bg-muted/40 border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <PersonCell
                        firstName={slip.employee.firstName}
                        lastName={slip.employee.lastName}
                        avatarUrl={slip.employee.avatarUrl}
                        secondary={`${slip.employeeCode}${slip.departmentName ? ` · ${slip.departmentName}` : ""}`}
                        size="sm"
                      />
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {Number(slip.paidDays)} / {Number(slip.workingDays)}
                      {Number(slip.lopDays) > 0 && (
                        <span className="text-warning ml-2 text-xs">
                          {Number(slip.lopDays)} LOP
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {formatMoney(Number(slip.grossEarnings), currency)}
                    </td>
                    <td className="text-muted-foreground px-4 py-2.5 text-right tabular-nums">
                      −{formatMoney(Number(slip.totalDeductions), currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                      {formatMoney(Number(slip.netPay), currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <PayslipSheet
                        currency={currency}
                        payslip={{
                          employeeName: slip.employeeName,
                          employeeCode: slip.employeeCode,
                          designationTitle: slip.designationTitle,
                          departmentName: slip.departmentName,
                          period: periodLabel(run.periodMonth, run.periodYear),
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </PageShell>
  );
}

function Figure({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          emphasis
            ? "mt-1 text-base font-semibold tabular-nums"
            : "mt-1 text-sm tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}
