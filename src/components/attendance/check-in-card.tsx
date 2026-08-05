"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { checkInAction, checkOutAction } from "@/lib/actions/attendance";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/dates";
import { cn } from "@/lib/utils";

/**
 * Check in / check out.
 *
 * The single control most employees touch every day, so it earns a live clock
 * and a running total rather than a bare button. Once checked in, the elapsed
 * time ticks — which is both useful and a clear confirmation that the press
 * registered.
 *
 * Times come from the server as ISO strings and are formatted in the
 * organisation's timezone; the clock is the only thing read from the browser.
 */
export function CheckInCard({
  checkInAt,
  checkOutAt,
  workedMinutes,
  timezone,
  shiftLabel,
  isLate,
}: {
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  timezone: string;
  shiftLabel: string | null;
  isLate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState<Date | null>(null);
  const router = useRouter();

  // Rendered only after mount: the server and the browser are in different
  // timezones, and a clock in the initial HTML would hydrate mismatched.
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isCheckedIn = Boolean(checkInAt) && !checkOutAt;
  const isDone = Boolean(checkOutAt);

  const elapsed =
    isCheckedIn && now && checkInAt
      ? Math.floor((now.getTime() - new Date(checkInAt).getTime()) / 60_000)
      : workedMinutes;

  function run(action: () => Promise<{ error?: string; success?: boolean }>, label: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(label);
      router.refresh();
    });
  }

  return (
    <div className="surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 rounded-full",
                isCheckedIn
                  ? "bg-success animate-pulse"
                  : isDone
                    ? "bg-muted-foreground"
                    : "bg-border",
              )}
              aria-hidden="true"
            />
            <p className="text-sm font-medium">
              {isCheckedIn
                ? "You're checked in"
                : isDone
                  ? "Day complete"
                  : "Not checked in yet"}
            </p>
            {isLate && (
              <span className="bg-warning-subtle text-warning rounded px-1.5 py-0.5 text-[10px] font-medium">
                Late
              </span>
            )}
          </div>

          <p className="text-muted-foreground mt-1 text-xs">
            {shiftLabel ?? "No shift assigned"}
            {checkInAt && ` · in at ${formatTime(checkInAt, timezone)}`}
            {checkOutAt && ` · out at ${formatTime(checkOutAt, timezone)}`}
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xl font-semibold tabular-nums tracking-tight">
              {elapsed > 0 ? formatDuration(elapsed) : "—"}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {isCheckedIn ? "so far today" : "worked today"}
            </p>
          </div>

          {!isDone && (
            <Button
              onClick={() =>
                isCheckedIn
                  ? run(checkOutAction, "Checked out — have a good evening")
                  : run(checkInAction, "Checked in")
              }
              disabled={pending}
              variant={isCheckedIn ? "outline" : "default"}
              size="lg"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : isCheckedIn ? (
                <LogOut className="size-4" aria-hidden="true" />
              ) : (
                <LogIn className="size-4" aria-hidden="true" />
              )}
              {isCheckedIn ? "Check out" : "Check in"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).format(new Date(iso));
}
