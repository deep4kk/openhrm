"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  advanceCycleAction,
  saveReviewCycleAction,
} from "@/lib/actions/performance";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Running a cycle.
 *
 * Advancing is one button whose label says what the next phase is, rather than
 * a status dropdown — a review cycle moves forward through a fixed sequence,
 * and modelling it as a free choice would let someone reopen self-reviews after
 * calibration, which is not a thing that should be possible.
 *
 * The first advance carries a warning because it is the irreversible one: it
 * writes a review row per person, and there is no unmake.
 */
const NEXT: Record<
  string,
  { status: "SELF_REVIEW" | "MANAGER_REVIEW" | "CALIBRATION" | "CLOSED"; label: string; warn?: string } | null
> = {
  DRAFT: {
    status: "SELF_REVIEW",
    label: "Open self-reviews",
    warn: "This creates a self-review for every active employee and a manager review for everyone who has a manager. It can't be undone.",
  },
  SELF_REVIEW: { status: "MANAGER_REVIEW", label: "Open manager reviews" },
  MANAGER_REVIEW: { status: "CALIBRATION", label: "Move to calibration" },
  CALIBRATION: { status: "CLOSED", label: "Close the cycle" },
  CLOSED: null,
};

export function AdvanceCycleButton({
  cycleId,
  status,
}: {
  cycleId: string;
  status: string;
}) {
  const next = NEXT[status];
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!next) return null;

  return (
    <Button
      disabled={pending}
      onClick={() => {
        if (next.warn && !confirm(next.warn)) return;
        startTransition(async () => {
          const result = await advanceCycleAction(cycleId, next.status);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(next.label);
          router.refresh();
        });
      }}
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {next.label}
    </Button>
  );
}

export interface CycleDraft {
  id?: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  selfReviewDueOn: string;
  managerReviewDueOn: string;
  ratingScaleMax: string;
  includesPeerFeedback: boolean;
  instructions: string;
}

export function CycleDialog({ cycle }: { cycle?: CycleDraft }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveReviewCycleAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(cycle?.id ? "Cycle updated" : "Cycle created");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, cycle?.id, router]);

  const year = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={cycle?.id ? "outline" : "default"} />}>
        <CalendarRange className="size-4" aria-hidden />
        {cycle?.id ? "Edit cycle" : "New cycle"}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {cycle?.id ? "Edit review cycle" : "New review cycle"}
          </DialogTitle>
          <DialogDescription>
            Nothing is created for anyone until you open self-reviews.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          {cycle?.id && <input type="hidden" name="id" value={cycle.id} />}

          <FormField
            label="Name"
            name="name"
            error={state.fieldErrors?.name}
            required
          >
            {(p) => (
              <Input
                {...p}
                defaultValue={cycle?.name ?? `H2 ${year} review`}
                maxLength={120}
              />
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Period from" name="periodStart" required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  defaultValue={cycle?.periodStart ?? `${year}-01-01`}
                />
              )}
            </FormField>

            <FormField
              label="Period to"
              name="periodEnd"
              error={state.fieldErrors?.periodEnd}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  defaultValue={cycle?.periodEnd ?? `${year}-06-30`}
                />
              )}
            </FormField>

            <FormField label="Self-reviews due" name="selfReviewDueOn" required>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  defaultValue={cycle?.selfReviewDueOn ?? `${year}-07-10`}
                />
              )}
            </FormField>

            <FormField
              label="Manager reviews due"
              name="managerReviewDueOn"
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  defaultValue={cycle?.managerReviewDueOn ?? `${year}-07-25`}
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Rating scale"
            name="ratingScaleMax"
            required
            hint="1 to this number."
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={3}
                max={10}
                defaultValue={cycle?.ratingScaleMax ?? "5"}
                className="tabular-nums"
              />
            )}
          </FormField>

          <div className="flex items-start gap-3">
            <Checkbox
              id="includesPeerFeedback"
              name="includesPeerFeedback"
              defaultChecked={cycle?.includesPeerFeedback}
            />
            <Label htmlFor="includesPeerFeedback" className="font-normal">
              Allow 360° peer feedback
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Peer reviews are added by hand once the cycle is open — who
                reviews whom is a judgement call, not something to generate.
              </span>
            </Label>
          </div>

          <FormField
            label="Instructions"
            name="instructions"
            hint="Shown to everyone writing a review."
          >
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                defaultValue={cycle?.instructions}
                maxLength={2000}
              />
            )}
          </FormField>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save cycle
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
