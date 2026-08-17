"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import { submitExitInterviewAction } from "@/lib/actions/exits";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * The exit interview.
 *
 * Two numbers and three open questions. The numbers make it comparable across
 * leavers — "manager" showing up as the primary reason six times in a quarter
 * is the finding that matters — and the open questions are where anything
 * actually useful gets said.
 *
 * Filled in by the leaver themselves where possible. A form typed up by HR
 * afterwards records who conducted it, because the two are different artefacts.
 */

const REASONS = [
  { value: "compensation", label: "Compensation" },
  { value: "growth", label: "Career growth" },
  { value: "manager", label: "Manager or team" },
  { value: "relocation", label: "Relocation" },
  { value: "workload", label: "Workload or hours" },
  { value: "culture", label: "Culture" },
  { value: "other", label: "Something else" },
];

export function ExitInterviewForm({
  resignationId,
  existing,
  isLeaver,
}: {
  resignationId: string;
  existing: {
    primaryReason: string | null;
    overallRating: number | null;
    wouldRecommend: number | null;
    whatWorked: string | null;
    whatDidNot: string | null;
    suggestions: string | null;
    submittedAt: Date | null;
    conductedByName: string | null;
  } | null;
  isLeaver: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitExitInterviewAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Exit interview saved");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <input type="hidden" name="resignationId" value={resignationId} />

      {!isLeaver && (
        <p className="text-muted-foreground text-xs">
          Filling this in on their behalf records you as the person who conducted
          it.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Main reason for leaving" name="primaryReason">
          {(p) => (
            <select
              {...p}
              defaultValue={existing?.primaryReason ?? ""}
              className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
            >
              <option value="">Prefer not to say</option>
              {REASONS.map((reason) => (
                <option key={reason.value} value={reason.value}>
                  {reason.label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          label="Overall experience"
          name="overallRating"
          hint="1 is poor, 5 is excellent."
        >
          {(p) => (
            <select
              {...p}
              defaultValue={existing?.overallRating ?? ""}
              className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
            >
              <option value="">—</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          label="Would you recommend us"
          name="wouldRecommend"
          hint="0 to 10, as a place to work."
        >
          {(p) => (
            <select
              {...p}
              defaultValue={existing?.wouldRecommend ?? ""}
              className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
            >
              <option value="">—</option>
              {Array.from({ length: 11 }, (_, i) => i).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          )}
        </FormField>
      </div>

      <FormField
        label="What worked well"
        name="whatWorked"
        hint="The things worth keeping."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            defaultValue={existing?.whatWorked ?? ""}
            maxLength={4000}
          />
        )}
      </FormField>

      <FormField label="What didn't" name="whatDidNot">
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            defaultValue={existing?.whatDidNot ?? ""}
            maxLength={4000}
          />
        )}
      </FormField>

      <FormField
        label="What would you change"
        name="suggestions"
        hint="The one thing you'd fix if you could."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            defaultValue={existing?.suggestions ?? ""}
            maxLength={4000}
          />
        )}
      </FormField>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          {existing?.submittedAt
            ? `Recorded${existing.conductedByName ? ` by ${existing.conductedByName}` : ""}. Saving replaces it.`
            : "HR reads this. It is not shared with your manager."}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Save
        </Button>
      </div>
    </form>
  );
}
