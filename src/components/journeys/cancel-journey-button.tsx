"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { toast } from "sonner";

import { cancelJourneyAction } from "@/lib/actions/journeys";
import { Button } from "@/components/ui/button";

/**
 * Cancelling a checklist.
 *
 * The tasks stay on the record — an offer that fell through is the usual
 * reason, and pretending the onboarding never started would lose that. What
 * changes is that nobody is chased to finish it.
 */
export function CancelJourneyButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (
          !confirm(
            `Cancel "${name}"? The tasks stay on the record, but nobody will be chased to finish them.`,
          )
        ) {
          return;
        }

        startTransition(async () => {
          const result = await cancelJourneyAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Checklist cancelled");
          router.push("/journeys");
        });
      }}
    >
      <XCircle className="size-4" aria-hidden />
      Cancel checklist
    </Button>
  );
}
