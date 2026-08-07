import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, HandCoins, Layers, Scale, Wallet } from "lucide-react";

import { can, requirePermission } from "@/lib/auth";
import { listPayrollRuns } from "@/lib/queries/payroll";
import { periodLabel } from "@/lib/actions/payroll";
import { formatDate } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import { NewPayrollRunDialog } from "@/components/payroll/new-run-dialog";
import { PayrollStatusBadge } from "@/components/payroll/status-badge";

export const metadata: Metadata = { title: "Payroll" };

/**
 * The payroll home.
 *
 * A payroll screen answers one question first — "where is this month?" — so the
 * newest run is given its own card with the action it is actually waiting for,
 * and history sits underneath as a table. Nothing here shows a figure that
 * hasn't been calculated: a draft run reports "not calculated yet" rather than
 * a row of zeroes that looks like everybody earns nothing.
 */
export default async function PayrollPage() {
  const session = await requirePermission(
    "payroll.read.all",
    "payroll.run",
    "payroll.structure.manage",
  );

  const runs = await listPayrollRuns(session);
  const currency = session.org.currency;
  const [latest, ...history] = runs;

  const lastPaid = runs.find((run) => run.status === "PAID" || run.status === "APPROVED");

  return (
    <PageShell>
      <PageHeader
        title="Payroll"
        description="Monthly runs, salary structures and the statutory pack. Payslips reach employees only when a run is approved."
        actions={
          <div className="flex items-center gap-2">
            {can(session, "payroll.structure.manage") && (
              <LinkButton href="/payroll/structures" variant="outline">
                <Layers className="size-4" aria-hidden />
                Structures
              </LinkButton>
            )}
            {can(session, "payroll.run") && <NewPayrollRunDialog />}
          </div>
        }
      />

      {lastPaid && (
        <StatRow>
          <StatTile
            label={`Net pay · ${periodLabel(lastPaid.periodMonth, lastPaid.periodYear)}`}
            value={formatCompactMoney(Number(lastPaid.totalNet), currency)}
            detail={`${lastPaid.headcount} employees`}
          />
          <StatTile
            label="Gross earnings"
            value={formatCompactMoney(Number(lastPaid.totalGross), currency)}
            detail="before deductions"
          />
          <StatTile
            label="Deductions"
            value={formatCompactMoney(Number(lastPaid.totalDeductions), currency)}
            detail="PF, ESI, PT, tax and recoveries"
          />
          <StatTile
            label="Total cost to company"
            value={formatCompactMoney(Number(lastPaid.totalEmployerCost), currency)}
            detail="gross plus employer contributions"
          />
        </StatRow>
      )}

      {latest && (
        <section className="surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <Wallet className="text-muted-foreground size-4" aria-hidden />
                <h2 className="text-sm font-semibold">
                  {periodLabel(latest.periodMonth, latest.periodYear)}
                </h2>
                <PayrollStatusBadge status={latest.status} />
              </div>
              <p className="text-muted-foreground mt-1.5 text-sm">
                {describe(latest.status, latest._count.payslips)}
              </p>
              {latest.payDate && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Pay date {formatDate(latest.payDate)}
                  {latest.approvedBy && ` · approved by ${latest.approvedBy.name}`}
                </p>
              )}
            </div>

            <LinkButton href={`/payroll/${latest.id}`}>
              Open run
              <ChevronRight className="size-4" aria-hidden />
            </LinkButton>
          </div>

          {latest.status !== "DRAFT" && latest.status !== "CANCELLED" && (
            <dl className="mt-5 grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-4">
              <Figure label="Employees" value={String(latest.headcount)} />
              <Figure
                label="Gross"
                value={formatMoney(Number(latest.totalGross), currency)}
              />
              <Figure
                label="Deductions"
                value={formatMoney(Number(latest.totalDeductions), currency)}
              />
              <Figure
                label="Net payable"
                value={formatMoney(Number(latest.totalNet), currency)}
                emphasis
              />
            </dl>
          )}
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Run history</h2>
          <div className="flex items-center gap-3">
            {can(session, "loan.manage") && (
              <Link
                href="/payroll/loans"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
              >
                <HandCoins className="size-3.5" aria-hidden />
                Loans & advances
              </Link>
            )}
            {can(session, "payroll.statutory.manage") && (
              <Link
                href="/settings/statutory"
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs font-medium"
              >
                <Scale className="size-3.5" aria-hidden />
                Statutory pack
              </Link>
            )}
          </div>
        </div>

        <div className="surface overflow-hidden">
          {runs.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="No payroll runs yet"
              description="Start a run for a month, calculate it, then approve it to release payslips. Nothing reaches employees before you approve."
              action={can(session, "payroll.run") ? <NewPayrollRunDialog /> : undefined}
            />
          ) : history.length === 0 ? (
            <p className="text-muted-foreground p-5 text-sm">
              This is the first run. Once it is approved, past months will be
              listed here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-xs">
                    <th className="px-4 py-2.5 text-left font-medium">Period</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                    <th className="px-4 py-2.5 text-right font-medium">People</th>
                    <th className="px-4 py-2.5 text-right font-medium">Gross</th>
                    <th className="px-4 py-2.5 text-right font-medium">Net</th>
                    <th className="px-4 py-2.5 text-left font-medium">Pay date</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((run) => (
                    <tr key={run.id} className="hover:bg-muted/40 border-b last:border-0">
                      <td className="px-4 py-3 font-medium">
                        {periodLabel(run.periodMonth, run.periodYear)}
                      </td>
                      <td className="px-4 py-3">
                        <PayrollStatusBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {run.headcount || "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {run.headcount
                          ? formatMoney(Number(run.totalGross), currency)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {run.headcount
                          ? formatMoney(Number(run.totalNet), currency)
                          : "—"}
                      </td>
                      <td className="text-muted-foreground px-4 py-3 tabular-nums">
                        {run.payDate ? formatDate(run.payDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/payroll/${run.id}`}
                          className="text-muted-foreground hover:text-foreground text-xs font-medium"
                        >
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        <StatusBadge label="Compliance" tone="warning" className="mr-2" />
        The statutory pack ships with India&apos;s PF, ESI, professional tax and
        income-tax rules as editable configuration. It is community-maintained —
        verify the figures with your accountant before you pay anyone.
      </p>
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
            ? "mt-0.5 text-sm font-semibold tabular-nums"
            : "mt-0.5 text-sm tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function describe(status: string, payslips: number): string {
  switch (status) {
    case "DRAFT":
      return "Not calculated yet. Open the run to work out payslips from attendance, leave and salary structures.";
    case "REVIEW":
      return `${payslips} payslip${payslips === 1 ? "" : "s"} calculated and waiting for approval. Employees can't see them yet.`;
    case "APPROVED":
      return `Approved — ${payslips} payslip${payslips === 1 ? " is" : "s are"} now visible to employees. Mark it paid once the money has left the bank.`;
    case "PAID":
      return "Disbursed. This run is closed.";
    case "CANCELLED":
      return "Cancelled. Its payslips were discarded.";
    default:
      return "";
  }
}
