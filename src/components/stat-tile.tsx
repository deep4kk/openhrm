import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A single number, which is the right form when there is one value to report
 * and no shape to show. Plotting four points to say "128 people" would be
 * decoration.
 *
 * Deliberate choices:
 *  - The value wears a text token, never a series colour. Colour on a bare
 *    number implies an encoding that isn't there.
 *  - `tone` tints only the small status dot and delta, so meaning is never
 *    carried by colour alone — the label and delta text say it too.
 *  - Figures are tabular so a row of tiles doesn't jitter as values update.
 */

type Tone = "neutral" | "positive" | "warning" | "critical" | "info";

const DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/40",
  positive: "bg-success",
  warning: "bg-warning",
  critical: "bg-destructive",
  info: "bg-info",
};

export function StatTile({
  label,
  value,
  detail,
  delta,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string | number;
  detail?: string;
  /** Change vs the previous period. Direction is shown by icon + words too. */
  delta?: { value: number; suffix?: string; goodWhenUp?: boolean };
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("surface p-4", className)}>
      <div className="flex items-center gap-1.5">
        {tone !== "neutral" && (
          <span
            className={cn("size-1.5 rounded-full", DOT[tone])}
            aria-hidden="true"
          />
        )}
        <p className="text-muted-foreground text-xs font-medium">{label}</p>
      </div>

      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">
        {value}
      </p>

      <div className="mt-1 flex items-center gap-2">
        {delta && <Delta {...delta} />}
        {detail && (
          <p className="text-muted-foreground text-xs">{detail}</p>
        )}
      </div>
    </div>
  );
}

function Delta({
  value,
  suffix = "",
  goodWhenUp = true,
}: {
  value: number;
  suffix?: string;
  goodWhenUp?: boolean;
}) {
  const flat = value === 0;
  const up = value > 0;
  const good = flat ? null : up === goodWhenUp;

  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
        good === null
          ? "text-muted-foreground"
          : good
            ? "text-success"
            : "text-destructive",
      )}
    >
      <Icon className="size-3" aria-hidden="true" />
      {/* The sign and the word carry the direction; colour only reinforces it. */}
      {up ? "+" : ""}
      {value}
      {suffix}
      <span className="sr-only">
        {flat ? "no change" : up ? "increase" : "decrease"}
      </span>
    </span>
  );
}

/** A KPI row. Wraps rather than scrolls — a hidden fifth tile is a lost tile. */
export function StatRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}
