import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { getClaim } from "@/lib/queries/expenses";
import { canReachEmployee } from "@/lib/scope";
import { formatDate } from "@/lib/dates";
import { MONTHS } from "@/lib/locale";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { ClaimStatusBadge } from "@/components/expenses/claim-status-badge";
import { ClaimEditor } from "@/components/expenses/claim-editor";
import {
  ClaimDecision,
  ReimburseButton,
  WithdrawClaimButton,
} from "@/components/expenses/claim-decision";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(
    "expense.submit",
    "expense.read.self",
    "expense.read.team",
    "expense.read.all",
  );
  const { id } = await params;
  const claim = await getClaim(session, id);
  return { title: claim?.title ?? "Expense claim" };
}

/**
 * One claim.
 *
 * A draft is shown as the editor — there is nothing to review yet, and making
 * the claimant click "edit" to change a line they just typed is friction for no
 * gain. Everything after submission is read-only, because those are the numbers
 * the approver is deciding on.
 */
export default async function ClaimPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "expense.submit",
    "expense.read.self",
    "expense.read.team",
    "expense.read.all",
  );

  const { id } = await params;
  const claim = await getClaim(session, id);
  if (!claim) notFound();

  const mine = claim.employeeId === session.employee?.id;
  const isDraft = claim.status === "DRAFT";

  // An approver may decide this claim if they hold org-wide authority, or team
  // authority that reaches the claimant. Never their own claim.
  const canDecide =
    claim.status === "SUBMITTED" &&
    !mine &&
    (can(session, "expense.approve.all") ||
      (can(session, "expense.approve.team") &&
        (await canReachEmployee(session, "expense.approve", claim.employeeId))));

  const canReimburse =
    claim.status === "APPROVED" && can(session, "expense.reimburse");

  const [categories, openRuns] = await Promise.all([
    isDraft && mine
      ? orgDb(session.org.id).expenseCategory.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    canReimburse
      ? orgDb(session.org.id).payrollRun.findMany({
          where: { status: "DRAFT" },
          orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
          take: 3,
          select: { id: true, periodMonth: true, periodYear: true },
        })
      : Promise.resolve([]),
  ]);

  if (isDraft && mine) {
    return (
      <PageShell className="max-w-3xl">
        <Link
          href="/me"
          className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden />
          My space
        </Link>

        <PageHeader
          title="Draft claim"
          description="Nobody sees this until you submit it."
          actions={<WithdrawClaimButton claimId={claim.id} />}
        />

        <ClaimEditor
          currency={session.org.currency}
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            maxAmount: c.maxAmount ? Number(c.maxAmount) : null,
            requiresReceipt: c.requiresReceipt,
          }))}
          claim={{
            id: claim.id,
            title: claim.title,
            description: claim.description ?? "",
            items: claim.items.map((item) => ({
              description: item.description,
              spentOn: item.spentOn.toISOString().slice(0, 10),
              amount: String(item.amount),
              categoryId: item.categoryId ?? "",
              merchant: item.merchant ?? "",
              costCenter: item.costCenter ?? "",
              receiptUrl: item.receiptUrl ?? "",
              receiptName: item.receiptUrl ? "Receipt attached" : "",
            })),
          }}
        />
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-3xl">
      <Link
        href={mine ? "/me" : "/expenses"}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {mine ? "My space" : "Expenses"}
      </Link>

      <PageHeader
        title={claim.title}
        description={claim.description ?? undefined}
        actions={
          mine && (claim.status === "SUBMITTED" || claim.status === "APPROVED") ? (
            <WithdrawClaimButton claimId={claim.id} />
          ) : undefined
        }
      />

      <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
        <PersonCell
          firstName={claim.employee.firstName}
          lastName={claim.employee.lastName}
          avatarUrl={claim.employee.avatarUrl}
          secondary={claim.employee.department?.name ?? claim.employee.employeeCode}
        />
        <div className="flex items-center gap-3">
          <ClaimStatusBadge status={claim.status} />
          <p className="text-lg font-semibold tabular-nums">
            {formatMoney(claim.totalAmount, session.org.currency, {
              decimals: true,
            })}
          </p>
        </div>
      </div>

      {claim.decisionNote && (
        <div className="surface p-4">
          <p className="text-muted-foreground text-xs">
            {claim.status === "REJECTED" ? "Declined" : "Approved"} by{" "}
            {claim.approver
              ? `${claim.approver.firstName} ${claim.approver.lastName}`
              : "an approver"}
            {claim.decidedAt && ` on ${formatDate(claim.decidedAt)}`}
          </p>
          <p className="measure mt-1.5 text-sm">{claim.decisionNote}</p>
        </div>
      )}

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>What</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Receipt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claim.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <p className="text-sm">{item.description}</p>
                  {(item.merchant || item.costCenter) && (
                    <p className="text-muted-foreground text-xs">
                      {[item.merchant, item.costCenter].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {item.category?.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm tabular-nums whitespace-nowrap">
                  {formatDate(item.spentOn)}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {formatMoney(item.amount, session.org.currency, {
                    decimals: true,
                  })}
                </TableCell>
                <TableCell>
                  {item.receiptUrl ? (
                    <a
                      href={item.receiptUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                    >
                      View
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {(canDecide || canReimburse) && (
        <div className="flex justify-end">
          {canDecide && <ClaimDecision claimId={claim.id} />}
          {canReimburse && (
            <ReimburseButton
              claimId={claim.id}
              openRuns={openRuns.map((run) => ({
                id: run.id,
                label: `${MONTHS[run.periodMonth - 1]?.label ?? ""} ${run.periodYear}`,
              }))}
            />
          )}
        </div>
      )}
    </PageShell>
  );
}
