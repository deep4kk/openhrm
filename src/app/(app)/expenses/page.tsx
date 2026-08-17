import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";

import { requirePermission, can, canAny } from "@/lib/auth";
import {
  expenseSummary,
  listClaims,
  listExpenseCategories,
  pendingClaims,
} from "@/lib/queries/expenses";
import {
  deleteExpenseCategoryAction,
  saveExpenseCategoryAction,
} from "@/lib/actions/expenses";
import { formatDate, formatRelative } from "@/lib/dates";
import { formatCompactMoney, formatMoney } from "@/lib/money";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { ExportButton } from "@/components/export-button";
import { PersonCell } from "@/components/people/person-avatar";
import { Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";
import { LinkButton } from "@/components/link-button";
import { ClaimStatusBadge } from "@/components/expenses/claim-status-badge";

export const metadata: Metadata = { title: "Expenses" };

/**
 * The expenses screen, seen from whichever side you are on.
 *
 * An approver lands on their queue; someone with only org-wide read sees the
 * ledger. Both are the same page because the alternative — /expenses and
 * /expenses/approvals — makes people who are both a manager and a claimant
 * check two places for the same thing.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requirePermission(
    "expense.read.all",
    "expense.read.team",
    "expense.approve.team",
    "expense.approve.all",
  );

  const filters = await searchParams;
  const mayApprove = canAny(
    session,
    "expense.approve.team",
    "expense.approve.all",
  );
  const mayManageCategories = can(session, "expense.category.manage");

  const [queue, claims, summary, categories] = await Promise.all([
    mayApprove ? pendingClaims(session) : Promise.resolve([]),
    listClaims(session, { status: filters.status }),
    expenseSummary(session),
    mayManageCategories ? listExpenseCategories(session) : Promise.resolve([]),
  ]);

  const rows = claims ?? [];

  return (
    <PageShell>
      <PageHeader
        title="Expenses"
        description="Claims, approvals and what the company still owes people."
        actions={
          can(session, "expense.submit") && (
            <LinkButton href="/expenses/new">
              <Receipt className="size-4" aria-hidden />
              New claim
            </LinkButton>
          )
        }
      />

      <StatRow>
        <StatTile
          label="Awaiting approval"
          value={summary.awaitingApproval.count}
          detail={formatMoney(
            summary.awaitingApproval.amount,
            session.org.currency,
          )}
          tone={summary.awaitingApproval.count > 0 ? "warning" : "neutral"}
        />
        <StatTile
          label="Approved, unpaid"
          value={summary.awaitingPayment.count}
          detail={formatMoney(
            summary.awaitingPayment.amount,
            session.org.currency,
          )}
          tone={summary.awaitingPayment.count > 0 ? "info" : "positive"}
        />
        <StatTile
          label="Reimbursed this year"
          value={formatCompactMoney(summary.reimbursedYtd, session.org.currency)}
          detail="paid out"
        />
        <StatTile label="Declined" value={summary.rejected} detail="all time" />
      </StatRow>

      {mayApprove && queue.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">
            Waiting on you
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {queue.length}
            </span>
          </h2>
          <ul className="surface divide-y overflow-hidden">
            {queue.map((claim) => (
              <li key={claim.id}>
                <Link
                  href={`/expenses/${claim.id}`}
                  className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                >
                  <div className="min-w-[13rem] flex-1">
                    <PersonCell
                      firstName={claim.employee.firstName}
                      lastName={claim.employee.lastName}
                      avatarUrl={claim.employee.avatarUrl}
                      secondary={claim.employee.department?.name ?? claim.employee.employeeCode}
                    />
                  </div>
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium">{claim.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {claim.items.length} line
                      {claim.items.length === 1 ? "" : "s"}
                      {claim.submittedAt &&
                        ` · submitted ${formatRelative(claim.submittedAt)}`}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(claim.totalAmount, session.org.currency)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold">All claims</h2>

        <FilterBar
          searchKey={null}
          count={rows.length}
          countNoun={["claim", "claims"]}
          selects={[
            {
              key: "status",
              label: "Filter by status",
              options: [
                { value: "all", label: "Any status" },
                { value: "DRAFT", label: "Draft" },
                { value: "SUBMITTED", label: "Awaiting approval" },
                { value: "APPROVED", label: "Approved" },
                { value: "REIMBURSED", label: "Reimbursed" },
                { value: "REJECTED", label: "Declined" },
                { value: "CANCELLED", label: "Withdrawn" },
              ],
            },
          ]}
        />

        <div className="surface mt-3 overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No claims"
              description="When someone files an expense claim it lands here, with its receipts and approval trail."
            />
          ) : (
            <ul className="divide-y">
              {rows.map((claim) => (
                <li key={claim.id}>
                  <Link
                    href={`/expenses/${claim.id}`}
                    className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                  >
                    <div className="min-w-[12rem] flex-1">
                      <PersonCell
                        firstName={claim.employee.firstName}
                        lastName={claim.employee.lastName}
                        avatarUrl={claim.employee.avatarUrl}
                        secondary={claim.employee.employeeCode}
                        size="sm"
                      />
                    </div>
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-sm">{claim.title}</p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        {formatDate(claim.createdAt)}
                        {claim.approver &&
                          ` · ${claim.status === "REJECTED" ? "declined" : "approved"} by ${claim.approver.firstName}`}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-medium tabular-nums">
                      {formatMoney(claim.totalAmount, session.org.currency)}
                    </p>
                    <ClaimStatusBadge status={claim.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {rows.length > 0 && (
        <div className="flex justify-end">
          <ExportButton
            filename={`expense-claims-${new Date().toISOString().slice(0, 10)}.csv`}
            rows={[
              [
                "Claim",
                "Employee",
                "Code",
                "Status",
                "Lines",
                "Amount",
                "Created",
                "Decided by",
              ],
              ...rows.map((claim) => [
                claim.title,
                `${claim.employee.firstName} ${claim.employee.lastName}`,
                claim.employee.employeeCode,
                claim.status,
                claim.items.length,
                String(claim.totalAmount),
                formatDate(claim.createdAt),
                claim.approver
                  ? `${claim.approver.firstName} ${claim.approver.lastName}`
                  : "",
              ]),
            ]}
          />
        </div>
      )}

      {mayManageCategories && (
        <Panel
          title="Categories"
          count={categories.length}
          description="Caps and receipt rules are enforced when a claim is submitted, not just suggested."
        >
          <RecordEditor
            canManage
            noun="category"
            addLabel="Add category"
            emptyMessage="No categories yet."
            saveAction={saveExpenseCategoryAction}
            deleteAction={deleteExpenseCategoryAction}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              {
                name: "code",
                label: "Code",
                type: "text",
                hint: "Capitals and numbers, used in exports.",
              },
              {
                name: "maxAmount",
                label: "Cap per line",
                type: "number",
                hint: "Leave blank for no ceiling.",
              },
              {
                name: "requiresReceipt",
                label: "Receipt required to submit",
                type: "checkbox",
                width: "full",
              },
            ]}
            records={categories.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: [
                c.code,
                c.maxAmount
                  ? `cap ${formatMoney(c.maxAmount, session.org.currency)}`
                  : "no cap",
                c.requiresReceipt ? "receipt required" : "receipt optional",
                `${c._count.items} line${c._count.items === 1 ? "" : "s"}`,
              ].join(" · "),
              badges: c.isActive ? [] : [{ label: "Hidden", tone: "warning" as const }],
              values: {
                name: c.name,
                code: c.code,
                maxAmount: c.maxAmount ? String(c.maxAmount) : "",
                requiresReceipt: c.requiresReceipt,
              },
            }))}
          />
        </Panel>
      )}
    </PageShell>
  );
}
