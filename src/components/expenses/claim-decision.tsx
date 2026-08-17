"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BanknoteArrowUp, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  cancelClaimAction,
  decideClaimAction,
  reimburseClaimAction,
} from "@/lib/actions/expenses";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Approving, declining and paying a claim.
 *
 * Declining requires a note and approving does not — a rejected claim without a
 * reason is a message the claimant cannot act on, whereas an approval speaks for
 * itself. The note box only appears once decline is chosen, so the common path
 * stays one click.
 */
export function ClaimDecision({ claimId }: { claimId: string }) {
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(approve: boolean) {
    startTransition(async () => {
      const result = await decideClaimAction(claimId, approve, note);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(approve ? "Claim approved" : "Claim declined");
      setMode("idle");
      setNote("");
      router.refresh();
    });
  }

  if (mode === "declining") {
    return (
      <div className="surface space-y-3 p-4">
        <label htmlFor="decline-note" className="text-sm font-medium">
          Why is this being declined?
        </label>
        <Textarea
          id="decline-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="The claimant will see this."
        />
        <div className="flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setMode("idle")}
            disabled={pending}
          >
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide(false)}
            disabled={pending || note.trim().length < 3}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Decline claim
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => decide(true)} disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        Approve
      </Button>
      <Button
        variant="outline"
        onClick={() => setMode("declining")}
        disabled={pending}
      >
        <X className="size-4" aria-hidden />
        Decline
      </Button>
    </div>
  );
}

/** Marking an approved claim paid, either separately or on the next payslip. */
export function ReimburseButton({
  claimId,
  openRuns,
}: {
  claimId: string;
  openRuns: { id: string; label: string }[];
}) {
  const [runId, setRunId] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {openRuns.length > 0 && (
        <select
          value={runId}
          onChange={(e) => setRunId(e.target.value)}
          aria-label="How this is being paid"
          className="border-input bg-background h-9 rounded-lg border px-2.5 text-sm"
        >
          <option value="">Paid separately</option>
          {openRuns.map((run) => (
            <option key={run.id} value={run.id}>
              With {run.label} payroll
            </option>
          ))}
        </select>
      )}

      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reimburseClaimAction(claimId, runId || undefined);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Marked reimbursed");
            router.refresh();
          })
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <BanknoteArrowUp className="size-4" aria-hidden />
        )}
        Mark reimbursed
      </Button>
    </div>
  );
}

export function WithdrawClaimButton({ claimId }: { claimId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Withdraw this claim?")) return;
        startTransition(async () => {
          const result = await cancelClaimAction(claimId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Claim withdrawn");
          router.refresh();
        });
      }}
    >
      <X className="size-4" aria-hidden />
      Withdraw
    </Button>
  );
}
