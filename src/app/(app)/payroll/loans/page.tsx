import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, HandCoins } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { listLoans } from "@/lib/queries/payroll";
import { getManagerOptions } from "@/lib/queries/employees";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Progress } from "@/components/ui/progress";
import { NewLoanDialog } from "@/components/payroll/new-loan-dialog";

export const metadata: Metadata = { title: "Loans & advances" };

/**
 * Salary advances.
 *
 * Recovery is automatic — approving a payroll run advances every active loan by
 * one instalment and closes it when the last one is taken. So this screen is a
 * register rather than a workflow: what is outstanding, and how far through.
 */
export default async function LoansPage() {
  const session = await requirePermission("loan.manage");

  const [loans, employees] = await Promise.all([
    listLoans(session),
    getManagerOptions(session),
  ]);

  const currency = session.org.currency;
  const active = loans.filter((loan) => loan.status === "ACTIVE");
  const outstanding = active.reduce(
    (total, loan) => total + (Number(loan.principal) - Number(loan.recovered)),
    0,
  );

  return (
    <PageShell className="max-w-5xl">
      <Link
        href="/payroll"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex w-fit items-center gap-1 rounded-md text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Payroll
      </Link>

      <PageHeader
        title="Loans & advances"
        description={
          active.length > 0
            ? `${active.length} active · ${formatMoney(outstanding, currency)} still to recover. Instalments come out of payroll automatically.`
            : "Issue a salary advance and payroll will recover it in instalments."
        }
        actions={
          <NewLoanDialog
            employees={employees.map((e) => ({
              value: e.id,
              label: `${e.firstName} ${e.lastName}`,
            }))}
          />
        }
      />

      <div className="surface overflow-hidden">
        {loans.length === 0 ? (
          <EmptyState
            icon={HandCoins}
            title="No advances issued"
            description="When you issue one, each approved payroll run takes an instalment until it's repaid."
          />
        ) : (
          <ul className="divide-y">
            {loans.map((loan) => {
              const principal = Number(loan.principal);
              const recovered = Number(loan.recovered);
              const progress =
                principal > 0 ? Math.min((recovered / principal) * 100, 100) : 0;

              return (
                <li key={loan.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">
                          {loan.employee.firstName} {loan.employee.lastName}
                        </p>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          {loan.employee.employeeCode}
                        </span>
                        <StatusBadge
                          label={
                            loan.status === "ACTIVE"
                              ? "Recovering"
                              : loan.status === "CLOSED"
                                ? "Repaid"
                                : "Cancelled"
                          }
                          tone={
                            loan.status === "ACTIVE"
                              ? "warning"
                              : loan.status === "CLOSED"
                                ? "positive"
                                : "neutral"
                          }
                        />
                      </div>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {loan.reason} · issued {formatDate(loan.createdAt)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-sm font-medium tabular-nums">
                        {formatMoney(principal, currency)}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {formatMoney(Number(loan.installmentAmount), currency)} ×{" "}
                        {loan.installmentsTotal}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <Progress value={progress} className="h-1.5 flex-1" />
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {loan.installmentsPaid}/{loan.installmentsTotal} paid ·{" "}
                      {formatMoney(principal - recovered, currency)} left
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
