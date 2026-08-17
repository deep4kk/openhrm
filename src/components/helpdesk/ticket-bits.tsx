import { StatusBadge } from "@/components/status-badge";
import { formatRelative } from "@/lib/dates";

/**
 * The small shared pieces of the helpdesk: status, priority and the SLA clock.
 *
 * The SLA is rendered as words about time remaining rather than a raw
 * timestamp — "2 hours left" is actionable in a queue view; "due 14:30" needs
 * mental arithmetic against a clock the reader has to find.
 */

const TICKET_STATUS = {
  OPEN: { label: "Open", tone: "warning" as const },
  IN_PROGRESS: { label: "In progress", tone: "info" as const },
  WAITING: { label: "Waiting on you", tone: "neutral" as const },
  RESOLVED: { label: "Resolved", tone: "positive" as const },
  CLOSED: { label: "Closed", tone: "neutral" as const },
};

export function TicketStatusBadge({ status }: { status: string }) {
  const config =
    TICKET_STATUS[status as keyof typeof TICKET_STATUS] ?? {
      label: status,
      tone: "neutral" as const,
    };
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const PRIORITY = {
  LOW: { label: "Low", tone: "neutral" as const },
  NORMAL: { label: "Normal", tone: "neutral" as const },
  HIGH: { label: "High", tone: "warning" as const },
  URGENT: { label: "Urgent", tone: "critical" as const },
};

export function PriorityBadge({ priority }: { priority: string }) {
  // Normal is the default and says nothing, so it earns no badge.
  if (priority === "NORMAL") return null;
  const config = PRIORITY[priority as keyof typeof PRIORITY];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}

export function SlaBadge({
  dueAt,
  resolvedAt,
}: {
  dueAt: Date | null;
  resolvedAt: Date | null;
}) {
  if (!dueAt) return null;

  if (resolvedAt) {
    const metSla = resolvedAt <= dueAt;
    return (
      <StatusBadge
        label={metSla ? "Within SLA" : "SLA missed"}
        tone={metSla ? "positive" : "critical"}
      />
    );
  }

  const overdue = dueAt < new Date();
  return (
    <StatusBadge
      label={overdue ? `Overdue ${formatRelative(dueAt)}` : `Due ${formatRelative(dueAt)}`}
      tone={overdue ? "critical" : "neutral"}
    />
  );
}
