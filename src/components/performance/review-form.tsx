"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";

import { submitReviewAction } from "@/lib/actions/performance";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Writing a review.
 *
 * Three prompts rather than a free-text box, because "tell us about the year"
 * produces a paragraph of nothing, whereas "what went well / what should change
 * / anything else" produces something a promotion conversation can use.
 *
 * The private-notes box is only rendered for manager and peer reviews, is
 * visually distinct, and says exactly who can read it. The server enforces the
 * same rule — a self-review's private notes are dropped on save regardless of
 * what the form posts.
 */
export function ReviewForm({
  review,
  ratingScaleMax,
  subjectName,
}: {
  review: {
    id: string;
    kind: string;
    overallRating: number | null;
    strengths: string | null;
    improvements: string | null;
    comments: string | null;
    privateNotes: string | null;
    status: string;
  };
  ratingScaleMax: number;
  subjectName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitReviewAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Review submitted");
      router.refresh();
    }
  }, [state.success, router]);

  const isSelf = review.kind === "SELF";
  const who = isSelf ? "you" : subjectName;
  const submitted = review.status === "SUBMITTED";

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <input type="hidden" name="reviewId" value={review.id} />

      <FormField
        label={`Overall rating out of ${ratingScaleMax}`}
        name="overallRating"
        error={state.fieldErrors?.overallRating}
      >
        {(p) => (
          <select
            {...p}
            defaultValue={review.overallRating ?? ""}
            className="border-input bg-background h-9 w-full max-w-xs rounded-lg border px-2.5 text-sm"
          >
            <option value="">Not rated</option>
            {Array.from({ length: ratingScaleMax }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        )}
      </FormField>

      <FormField
        label="What went well"
        name="strengths"
        hint={`Specific things ${who} did, not adjectives.`}
      >
        {(p) => (
          <Textarea {...p} rows={5} defaultValue={review.strengths ?? ""} maxLength={5000} />
        )}
      </FormField>

      <FormField
        label="What should change"
        name="improvements"
        hint="The one or two things that would make the biggest difference next period."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={5}
            defaultValue={review.improvements ?? ""}
            maxLength={5000}
          />
        )}
      </FormField>

      <FormField label="Anything else" name="comments">
        {(p) => (
          <Textarea {...p} rows={4} defaultValue={review.comments ?? ""} maxLength={5000} />
        )}
      </FormField>

      {!isSelf && (
        <div className="border-warning/40 bg-warning-subtle space-y-2 rounded-lg border p-4">
          <label htmlFor="privateNotes" className="flex items-center gap-1.5 text-sm font-medium">
            <Lock className="size-3.5" aria-hidden />
            Private notes
          </label>
          <p className="text-xs">
            Visible to HR and to you. {subjectName} never sees this, in the app or
            in an export.
          </p>
          <Textarea
            id="privateNotes"
            name="privateNotes"
            rows={4}
            defaultValue={review.privateNotes ?? ""}
            maxLength={5000}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          {submitted
            ? "Already submitted. Saving again replaces it."
            : "Once submitted, the subject can read everything except the private notes."}
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {submitted ? "Update review" : "Submit review"}
        </Button>
      </div>
    </form>
  );
}
