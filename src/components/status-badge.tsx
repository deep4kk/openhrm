import { cn } from "@/lib/utils";

/**
 * Status is never carried by colour alone.
 *
 * Every badge shows a word, and the shape stays identical across states — the
 * colour is reinforcement, not the message. That keeps the table readable for
 * colour-blind users, in greyscale print, and in a screenshot pasted into Slack.
 */

type Tone = "neutral" | "positive" | "warning" | "critical" | "info";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  positive: "bg-success-subtle text-success border-success/20",
  warning: "bg-warning-subtle text-warning border-warning/25",
  critical: "bg-destructive-subtle text-destructive border-destructive/20",
  info: "bg-info-subtle text-info border-info/20",
};

export function StatusBadge({
  label,
  tone = "neutral",
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {label}
    </span>
  );
}

const EMPLOYEE_STATUS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: "Active", tone: "positive" },
  ON_LEAVE: { label: "On leave", tone: "info" },
  NOTICE_PERIOD: { label: "Notice period", tone: "warning" },
  EXITED: { label: "Exited", tone: "neutral" },
  INVITED: { label: "Invited", tone: "neutral" },
};

export function EmployeeStatusBadge({ status }: { status: string }) {
  const config = EMPLOYEE_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const APPROVAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  PENDING: { label: "Pending", tone: "warning" },
  APPROVED: { label: "Approved", tone: "positive" },
  REJECTED: { label: "Declined", tone: "critical" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export function ApprovalStatusBadge({ status }: { status: string }) {
  const config = APPROVAL_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const ATTENDANCE_STATUS: Record<string, { label: string; tone: Tone }> = {
  PRESENT: { label: "Present", tone: "positive" },
  ABSENT: { label: "Absent", tone: "critical" },
  HALF_DAY: { label: "Half day", tone: "warning" },
  ON_LEAVE: { label: "On leave", tone: "info" },
  HOLIDAY: { label: "Holiday", tone: "neutral" },
  WEEKLY_OFF: { label: "Weekly off", tone: "neutral" },
};

export function AttendanceStatusBadge({ status }: { status: string }) {
  const config =
    ATTENDANCE_STATUS[status] ?? { label: status, tone: "neutral" as Tone };
  return <StatusBadge label={config.label} tone={config.tone} />;
}
