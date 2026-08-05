import type { LeaveBalanceView } from "@/lib/queries/leave";
import { cn } from "@/lib/utils";

/**
 * Leave balances.
 *
 * The number people came for — days available — is the largest thing on each
 * card. Everything else (entitled, used, pending) is supporting detail in one
 * line beneath, and the bar gives the same information a second way so the
 * proportion is readable without doing arithmetic.
 */
export function BalanceCards({
  balances,
  className,
}: {
  balances: LeaveBalanceView[];
  className?: string;
}) {
  if (balances.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No leave types are set up yet.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
    >
      {balances.map((balance) => (
        <BalanceCard key={balance.leaveTypeId} balance={balance} />
      ))}
    </div>
  );
}

function BalanceCard({ balance }: { balance: LeaveBalanceView }) {
  const consumed = balance.used + balance.pending;
  const usedPct =
    balance.entitled > 0
      ? Math.min((balance.used / balance.entitled) * 100, 100)
      : 0;
  const pendingPct =
    balance.entitled > 0
      ? Math.min((balance.pending / balance.entitled) * 100, 100 - usedPct)
      : 0;

  return (
    <div className="surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{balance.name}</p>
          <p className="text-muted-foreground mt-0.5 font-mono text-[11px]">
            {balance.code}
          </p>
        </div>
        {!balance.isPaid && (
          <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 text-[10px] font-medium">
            Unpaid
          </span>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tabular-nums tracking-tight">
          {formatDays(balance.available)}
        </span>
        <span className="text-muted-foreground text-xs">
          left of {formatDays(balance.entitled)}
        </span>
      </div>

      {/* Two-segment bar: taken (solid) and awaiting approval (hatched). */}
      <div
        className="bg-muted mt-3 flex h-1.5 overflow-hidden rounded-full"
        role="img"
        aria-label={`${formatDays(balance.used)} taken, ${formatDays(
          balance.pending,
        )} awaiting approval, ${formatDays(balance.available)} available`}
      >
        <div
          className="bg-primary h-full"
          style={{ width: `${usedPct}%` }}
        />
        <div
          className="bg-primary/35 h-full"
          style={{ width: `${pendingPct}%` }}
        />
      </div>

      <p className="text-muted-foreground mt-2 text-xs tabular-nums">
        {formatDays(balance.used)} taken
        {balance.pending > 0 && ` · ${formatDays(balance.pending)} pending`}
        {consumed === 0 && " · none used yet"}
      </p>
    </div>
  );
}

/** "1 day", "2.5 days", "0 days" — plural and half-days both read naturally. */
export function formatDays(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? "day" : "days"}`;
}
