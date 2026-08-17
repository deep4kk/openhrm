"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { updateGoalProgressAction } from "@/lib/actions/performance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar } from "@/components/progress-bar";

/**
 * Updating a goal's number.
 *
 * The owner types where they have got to and the percentage follows from the
 * target, rather than asking for both — a goal that says "60% done" and "12 of
 * 30" at the same time is a goal nobody trusts. When there is no numeric target
 * the percentage is typed directly, which is the honest fallback for goals that
 * are genuinely qualitative.
 */
export function GoalProgress({
  goalId,
  currentValue,
  targetValue,
  unit,
  progress,
  status,
  canEdit,
}: {
  goalId: string;
  currentValue: number | null;
  targetValue: number | null;
  unit: string | null;
  progress: number;
  status: string;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(currentValue ?? ""));
  const [percent, setPercent] = useState(String(progress));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const derived =
    targetValue && targetValue !== 0
      ? Math.max(0, Math.min(100, Math.round((Number(value) / targetValue) * 100)))
      : Number(percent);

  if (!canEdit || !editing) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <ProgressBar
          className="min-w-40 flex-1"
          percent={progress}
          label={
            targetValue
              ? `${currentValue ?? 0} / ${targetValue}${unit ? ` ${unit}` : ""}`
              : `${progress}%`
          }
          tone={
            status === "ACHIEVED"
              ? "positive"
              : status === "AT_RISK" || status === "MISSED"
                ? "critical"
                : "brand"
          }
        />
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            Update
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      {targetValue ? (
        <div className="space-y-1">
          <label htmlFor={`v-${goalId}`} className="text-muted-foreground text-xs">
            Where are you now{unit ? ` (${unit})` : ""}?
          </label>
          <Input
            id={`v-${goalId}`}
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-28 tabular-nums"
          />
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor={`p-${goalId}`} className="text-muted-foreground text-xs">
            Percent complete
          </label>
          <Input
            id={`p-${goalId}`}
            type="number"
            min={0}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            className="w-24 tabular-nums"
          />
        </div>
      )}

      <span className="text-muted-foreground pb-2 text-sm tabular-nums">
        = {Number.isFinite(derived) ? derived : 0}%
      </span>

      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await updateGoalProgressAction(
              goalId,
              targetValue ? Number(value) : null,
              Number.isFinite(derived) ? derived : 0,
              derived >= 100 ? "ACHIEVED" : undefined,
            );
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Progress saved");
            setEditing(false);
            router.refresh();
          })
        }
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Save
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </div>
  );
}

const GOAL_STATUS = {
  DRAFT: { label: "Draft", tone: "neutral" as const },
  ACTIVE: { label: "On track", tone: "info" as const },
  AT_RISK: { label: "At risk", tone: "warning" as const },
  ACHIEVED: { label: "Achieved", tone: "positive" as const },
  MISSED: { label: "Missed", tone: "critical" as const },
  CANCELLED: { label: "Cancelled", tone: "neutral" as const },
};

export function GoalStatusBadge({ status }: { status: string }) {
  const config = GOAL_STATUS[status as keyof typeof GOAL_STATUS];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}

const CYCLE_STATUS = {
  DRAFT: { label: "Not started", tone: "neutral" as const },
  SELF_REVIEW: { label: "Self-review", tone: "info" as const },
  MANAGER_REVIEW: { label: "Manager review", tone: "info" as const },
  CALIBRATION: { label: "Calibration", tone: "warning" as const },
  CLOSED: { label: "Closed", tone: "neutral" as const },
};

export function CycleStatusBadge({ status }: { status: string }) {
  const config = CYCLE_STATUS[status as keyof typeof CYCLE_STATUS];
  if (!config) return null;
  return <StatusBadge label={config.label} tone={config.tone} />;
}
