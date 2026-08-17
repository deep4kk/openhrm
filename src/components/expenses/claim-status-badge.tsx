import { StatusBadge } from "@/components/status-badge";

/**
 * Claim status, worded from the claimant's point of view.
 *
 * "Awaiting approval" rather than "SUBMITTED", because the claimant's question
 * is what happens next, not what the database column says.
 */
const CLAIM_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" as const },
  SUBMITTED: { label: "Awaiting approval", tone: "warning" as const },
  APPROVED: { label: "Approved", tone: "info" as const },
  REIMBURSED: { label: "Reimbursed", tone: "positive" as const },
  REJECTED: { label: "Declined", tone: "critical" as const },
  CANCELLED: { label: "Withdrawn", tone: "neutral" as const },
};

export function ClaimStatusBadge({ status }: { status: string }) {
  const config =
    CLAIM_STATUS[status as keyof typeof CLAIM_STATUS] ?? {
      label: status,
      tone: "neutral" as const,
    };
  return <StatusBadge label={config.label} tone={config.tone} />;
}
