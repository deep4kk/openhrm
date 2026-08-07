import { StatusBadge } from "@/components/status-badge";

/**
 * Payroll and claim states, as words.
 *
 * "Review" and "Approved" look similar at a glance and mean very different
 * things — one is still editable, one has already reached employees — so each
 * carries its own tone as well as its own label.
 */

const PAYROLL: Record<string, { label: string; tone: Parameters<typeof StatusBadge>[0]["tone"] }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  REVIEW: { label: "In review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "positive" },
  PAID: { label: "Paid", tone: "info" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function PayrollStatusBadge({ status }: { status: string }) {
  const config = PAYROLL[status] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const CLAIM: Record<string, { label: string; tone: Parameters<typeof StatusBadge>[0]["tone"] }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SUBMITTED: { label: "Awaiting approval", tone: "warning" },
  APPROVED: { label: "Approved", tone: "positive" },
  REJECTED: { label: "Declined", tone: "critical" },
  REIMBURSED: { label: "Reimbursed", tone: "info" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function ClaimStatusBadge({ status }: { status: string }) {
  const config = CLAIM[status] ?? { label: status, tone: "neutral" as const };
  return <StatusBadge label={config.label} tone={config.tone} />;
}
