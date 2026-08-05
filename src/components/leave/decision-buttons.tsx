"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { cancelLeaveAction, decideLeaveAction } from "@/lib/actions/leave";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

/**
 * Approve / decline.
 *
 * Approving is one click — it is the common, safe case. Declining opens a
 * dialog asking why, because "declined" with no reason is the single most
 * frustrating thing an HR system can do to someone who planned a trip.
 */
export function DecisionButtons({
  requestId,
  employeeName,
}: {
  requestId: string;
  employeeName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [note, setNote] = useState("");
  const router = useRouter();

  function decide(approve: boolean, reason?: string) {
    startTransition(async () => {
      const result = await decideLeaveAction(requestId, approve, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(approve ? "Leave approved" : "Leave declined", {
        description: `${employeeName} has been notified.`,
      });
      setDeclineOpen(false);
      setNote("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDeclineOpen(true)}
          disabled={pending}
        >
          <X className="size-3.5" aria-hidden="true" />
          Decline
        </Button>
        <Button size="sm" onClick={() => decide(true)} disabled={pending}>
          {pending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="size-3.5" aria-hidden="true" />
          )}
          Approve
        </Button>
      </div>

      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this request?</DialogTitle>
            <DialogDescription>
              {employeeName} will see your reason. Being specific saves a
              follow-up conversation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="decline-note">Reason</Label>
            <Textarea
              id="decline-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Quarter close that week — could you shift to the following Monday?"
              maxLength={500}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setDeclineOpen(false)}
              disabled={pending}
            >
              Keep pending
            </Button>
            <Button
              variant="destructive"
              onClick={() => decide(false, note)}
              disabled={pending}
            >
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Decline request
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Withdraw one's own request, or an admin cancelling on someone's behalf. */
export function CancelLeaveButton({ requestId }: { requestId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await cancelLeaveAction(requestId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Request cancelled", {
            description: "The days are back in your balance.",
          });
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />}
      Cancel
    </Button>
  );
}
