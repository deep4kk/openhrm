import { Star } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * Shared vocabulary for the hiring screens: stage, job status, interview
 * verdict and the star rating.
 *
 * Kept together because these four appear side by side on the pipeline card and
 * have to read as one system — four separate definitions of "what does amber
 * mean here" is how a board becomes noise.
 */

const STAGE = {
  APPLIED: { label: "Applied", tone: "neutral" as const },
  SCREENING: { label: "Screening", tone: "info" as const },
  INTERVIEW: { label: "Interview", tone: "info" as const },
  OFFER: { label: "Offer", tone: "warning" as const },
  HIRED: { label: "Hired", tone: "positive" as const },
  REJECTED: { label: "Rejected", tone: "neutral" as const },
};

export function StageBadge({ stage }: { stage: string }) {
  const config = STAGE[stage as keyof typeof STAGE];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const JOB_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" as const },
  OPEN: { label: "Open", tone: "positive" as const },
  ON_HOLD: { label: "On hold", tone: "warning" as const },
  CLOSED: { label: "Closed", tone: "neutral" as const },
  FILLED: { label: "Filled", tone: "info" as const },
};

export function JobStatusBadge({ status }: { status: string }) {
  const config = JOB_STATUS[status as keyof typeof JOB_STATUS];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const OUTCOME = {
  PENDING: { label: "Awaiting feedback", tone: "warning" as const },
  STRONG_YES: { label: "Strong yes", tone: "positive" as const },
  YES: { label: "Yes", tone: "positive" as const },
  NO: { label: "No", tone: "critical" as const },
  STRONG_NO: { label: "Strong no", tone: "critical" as const },
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const config = OUTCOME[outcome as keyof typeof OUTCOME];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const OFFER_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" as const },
  SENT: { label: "Sent", tone: "warning" as const },
  ACCEPTED: { label: "Accepted", tone: "positive" as const },
  DECLINED: { label: "Declined", tone: "critical" as const },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" as const },
  EXPIRED: { label: "Expired", tone: "neutral" as const },
};

export function OfferStatusBadge({ status }: { status: string }) {
  const config = OFFER_STATUS[status as keyof typeof OFFER_STATUS];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}

/**
 * A read-only rating.
 *
 * The count is written out for screen readers rather than left as five icons
 * with no text — "3 out of 5" is the information; the stars are the shortcut.
 */
export function RatingStars({
  rating,
  className,
}: {
  rating: number | null;
  className?: string;
}) {
  if (!rating) return null;

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={cn(
            "size-3",
            n <= rating ? "fill-warning text-warning" : "text-muted-foreground/30",
          )}
          aria-hidden
        />
      ))}
      <span className="sr-only">{rating} out of 5</span>
    </span>
  );
}
