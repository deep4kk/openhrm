"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, DoorOpen, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  completeExitAction,
  decideResignationAction,
  submitResignationAction,
  withdrawResignationAction,
} from "@/lib/actions/exits";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Resigning.
 *
 * Behind a confirmation dialog and worded plainly, because it is the single
 * most consequential button an employee can press in this app. The notice
 * period is shown as a computed date rather than a number of days, so nobody
 * discovers on the day that "30 days" meant something other than what they
 * assumed.
 */
export function ResignDialog({
  noticePeriodDays,
  suggestedDate,
}: {
  noticePeriodDays: number;
  suggestedDate: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitResignationAction,
    {},
  );
  const [date, setDate] = useState(suggestedDate);

  const early = date < suggestedDate;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>
        <DoorOpen className="size-4" aria-hidden />
        Resign
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit your resignation</DialogTitle>
          <DialogDescription>
            This goes to your reporting manager and HR. You can withdraw it until
            it has been accepted.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />

          <FormField
            label="Last working day you'd like"
            name="lastWorkingDayRequested"
            error={state.fieldErrors?.lastWorkingDayRequested}
            required
            hint={`Your notice period is ${noticePeriodDays} days, which puts it at ${suggestedDate}.`}
          >
            {(p) => (
              <Input
                {...p}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            )}
          </FormField>

          {early && (
            <p className="border-warning/40 bg-warning-subtle rounded-md border px-3 py-2 text-xs">
              That is inside your notice period. HR can agree to it, but the
              shortfall may be recovered from your final settlement.
            </p>
          )}

          <FormField
            label="Why are you leaving"
            name="reason"
            error={state.fieldErrors?.reason}
            required
            hint="Your manager and HR read this. There is a separate, fuller exit interview later."
          >
            {(p) => <Textarea {...p} rows={5} maxLength={3000} />}
          </FormField>

          <FormField label="Type" name="exitType">
            {(p) => (
              <select
                {...p}
                defaultValue="RESIGNATION"
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="RESIGNATION">Resignation</option>
                <option value="RETIREMENT">Retirement</option>
                <option value="END_OF_CONTRACT">End of contract</option>
              </select>
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
              Submit resignation
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Deciding a resignation.
 *
 * Accepting asks for the last working day again, defaulted to what was
 * requested — because negotiating that date is the substance of the
 * conversation, and a one-click accept would silently agree to whatever was
 * asked for.
 */
export function ResignationDecision({
  resignationId,
  requestedDate,
}: {
  resignationId: string;
  requestedDate: string;
}) {
  const [mode, setMode] = useState<"idle" | "accepting" | "declining">("idle");
  const [date, setDate] = useState(requestedDate);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function decide(accept: boolean) {
    startTransition(async () => {
      const result = await decideResignationAction(
        resignationId,
        accept,
        accept ? date : undefined,
        note,
      );
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(accept ? "Resignation accepted" : "Resignation declined");
      setMode("idle");
      router.refresh();
    });
  }

  if (mode === "accepting") {
    return (
      <div className="surface space-y-4 p-5">
        <h2 className="text-sm font-semibold">Accept this resignation</h2>
        <p className="text-muted-foreground text-xs">
          The clearance checklist starts, the employee moves to notice period,
          and a full-and-final record is opened.
        </p>

        <div className="space-y-2">
          <label htmlFor="lwd" className="text-sm font-medium">
            Agreed last working day
          </label>
          <Input
            id="lwd"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="accept-note" className="text-sm font-medium">
            Note
          </label>
          <Textarea
            id="accept-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode("idle")} disabled={pending}>
            Back
          </Button>
          <Button onClick={() => decide(true)} disabled={pending || !date}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Accept
          </Button>
        </div>
      </div>
    );
  }

  if (mode === "declining") {
    return (
      <div className="surface space-y-4 p-5">
        <h2 className="text-sm font-semibold">Decline this resignation</h2>
        <Textarea
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          aria-label="Why it is being declined"
          placeholder="The employee sees this."
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setMode("idle")} disabled={pending}>
            Back
          </Button>
          <Button
            variant="destructive"
            onClick={() => decide(false)}
            disabled={pending}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Decline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => setMode("accepting")}>
        <Check className="size-4" aria-hidden />
        Accept
      </Button>
      <Button variant="outline" onClick={() => setMode("declining")}>
        <X className="size-4" aria-hidden />
        Decline
      </Button>
    </div>
  );
}

export function WithdrawResignationButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm("Withdraw this resignation?")) return;
        startTransition(async () => {
          const result = await withdrawResignationAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Resignation withdrawn");
          router.refresh();
        });
      }}
    >
      Withdraw
    </Button>
  );
}

export function CompleteExitButton({
  id,
  blockers,
}: {
  id: string;
  blockers: string[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="surface space-y-3 p-5">
      <h2 className="text-sm font-semibold">Close the exit</h2>
      <p className="text-muted-foreground text-xs">
        Revokes their login, ends every session, and moves them out of headcount.
        The employee record stays for the audit trail and for future letters.
      </p>

      {blockers.length > 0 && (
        <ul className="space-y-1.5">
          {blockers.map((blocker) => (
            <li key={blocker} className="flex items-center gap-2 text-xs">
              <StatusBadge label="Outstanding" tone="warning" />
              {blocker}
            </li>
          ))}
        </ul>
      )}

      <Button
        disabled={pending || blockers.length > 0}
        onClick={() => {
          if (!confirm("Close this exit and revoke their access?")) return;
          startTransition(async () => {
            const result = await completeExitAction(id);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Exit completed");
            router.refresh();
          });
        }}
      >
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Complete the exit
      </Button>
    </div>
  );
}
