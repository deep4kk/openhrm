"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { rateCandidateAction } from "@/lib/actions/hiring";
import { RatingStars } from "./hiring-bits";
import { cn } from "@/lib/utils";

/**
 * The recruiter's own rating, distinct from interview scores.
 *
 * Five buttons rather than a slider or a select: each star is a real button
 * with its own accessible name, so it is reachable by tab and announced as
 * "Rate 3 out of 5" instead of as an unlabelled graphic. Clicking the current
 * rating clears it, which is the behaviour people try first.
 */
export function CandidateRating({
  candidateId,
  rating,
  canRate,
}: {
  candidateId: string;
  rating: number | null;
  canRate: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!canRate) {
    return (
      <div className="shrink-0 text-right">
        <p className="text-muted-foreground mb-1 text-xs">Rating</p>
        {rating ? (
          <RatingStars rating={rating} />
        ) : (
          <p className="text-muted-foreground text-sm">—</p>
        )}
      </div>
    );
  }

  function rate(value: number) {
    startTransition(async () => {
      const result = await rateCandidateAction(
        candidateId,
        value === rating ? 0 : value,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="shrink-0 text-right">
      <p className="text-muted-foreground mb-1 text-xs">Your rating</p>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={pending}
            onClick={() => rate(n)}
            aria-label={
              n === rating ? `Clear rating` : `Rate ${n} out of 5`
            }
            aria-pressed={rating !== null && n <= rating}
            className="focus-visible:ring-ring rounded p-0.5 outline-none focus-visible:ring-3 disabled:opacity-50"
          >
            <Star
              className={cn(
                "size-4 transition-colors",
                rating !== null && n <= rating
                  ? "fill-warning text-warning"
                  : "text-muted-foreground/40 hover:text-warning",
              )}
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}
