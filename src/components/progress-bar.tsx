import { cn } from "@/lib/utils";

/**
 * A completion bar, for checklists, courses and goals.
 *
 * Deliberately not the Base UI Progress primitive: this renders inside server
 * components in tables and cards where a client boundary would be pure cost,
 * and the value never animates from an indeterminate state — it is a fact read
 * from the database, not a download in flight.
 *
 * The number is always printed beside the bar. A bar alone is a shape; "7 of 11"
 * is the answer someone actually needs.
 */
export function ProgressBar({
  percent,
  label,
  tone = "brand",
  className,
}: {
  percent: number;
  label?: string;
  tone?: "brand" | "positive" | "warning" | "critical";
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));

  const fill = {
    brand: "bg-primary",
    positive: "bg-success",
    warning: "bg-warning",
    critical: "bg-destructive",
  }[tone];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className="bg-muted h-1.5 min-w-16 flex-1 overflow-hidden rounded-full"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${clamped}% complete`}
      >
        <div
          className={cn("h-full rounded-full transition-all", fill)}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
        {label ?? `${clamped}%`}
      </span>
    </div>
  );
}
