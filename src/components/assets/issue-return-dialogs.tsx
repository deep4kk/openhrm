"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, HandCoins, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { issueAssetAction, returnAssetAction } from "@/lib/actions/assets";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const CONDITIONS = [
  { value: "NEW", label: "New" },
  { value: "GOOD", label: "Good" },
  { value: "FAIR", label: "Fair" },
  { value: "POOR", label: "Poor" },
  { value: "DAMAGED", label: "Damaged" },
];

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * Issuing an asset.
 *
 * Condition is recorded at both ends of the loan, not just once. Without the
 * "before" figure the "after" is an accusation rather than a fact, and the
 * conversation about a cracked screen at exit time has nothing to stand on.
 */
export function IssueAssetDialog({
  assetId,
  assetName,
  employees,
}: {
  assetId: string;
  assetName: string;
  employees: { id: string; name: string; detail: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    issueAssetAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Asset issued");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <HandCoins className="size-4" aria-hidden />
        Issue
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Issue {assetName}</DialogTitle>
          <DialogDescription>
            It stays on this person&apos;s record — and on their exit clearance —
            until it is returned.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          <input type="hidden" name="assetId" value={assetId} />

          <FormField
            label="Issue to"
            name="employeeId"
            error={state.fieldErrors?.employeeId}
            required
          >
            {(p) => (
              <select
                {...p}
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="">Choose someone…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.detail}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Issued on"
              name="issuedOn"
              error={state.fieldErrors?.issuedOn}
              required
            >
              {(p) => <Input {...p} type="date" defaultValue={TODAY()} />}
            </FormField>

            <FormField
              label="Return expected"
              name="dueOn"
              hint="Optional — for loaners and temporary kit."
            >
              {(p) => <Input {...p} type="date" />}
            </FormField>
          </div>

          <FormField
            label="Condition at handover"
            name="issueCondition"
            required
            hint="Recorded so the return can be compared against it."
          >
            {(p) => (
              <select
                {...p}
                defaultValue="GOOD"
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                {CONDITIONS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Note" name="issueNote">
            {(p) => <Textarea {...p} rows={2} maxLength={500} />}
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
              Issue it
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Recording a return.
 *
 * Where the asset goes next is asked explicitly rather than assumed. A laptop
 * handed back with a cracked screen should not silently reappear as available
 * for the next hire, and the person doing the handover is the only one who
 * knows which it is.
 */
export function ReturnAssetDialog({
  assignmentId,
  assetName,
  holderName,
}: {
  assignmentId: string;
  assetName: string;
  holderName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    returnAssetAction,
    {},
  );
  const [condition, setCondition] = useState("GOOD");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Return recorded");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  // Damaged kit defaults to repair rather than back on the shelf.
  const suggestedNext =
    condition === "DAMAGED" ? "IN_REPAIR" : condition === "POOR" ? "IN_REPAIR" : "AVAILABLE";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" variant="outline" />}>
        <ArrowLeftRight className="size-4" aria-hidden />
        Record return
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Return {assetName}</DialogTitle>
          <DialogDescription>
            Currently with {holderName}.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          <input type="hidden" name="assignmentId" value={assignmentId} />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Returned on"
              name="returnedOn"
              error={state.fieldErrors?.returnedOn}
              required
            >
              {(p) => <Input {...p} type="date" defaultValue={TODAY()} />}
            </FormField>

            <FormField label="Condition" name="returnCondition" required>
              {(p) => (
                <select
                  {...p}
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  {CONDITIONS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <FormField
            label="What happens to it now"
            name="nextStatus"
            required
            hint="Damaged kit shouldn't go straight back on the shelf."
          >
            {(p) => (
              <select
                {...p}
                key={suggestedNext}
                defaultValue={suggestedNext}
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="AVAILABLE">Back in the pool</option>
                <option value="IN_REPAIR">Send for repair</option>
                <option value="RETIRED">Retire it</option>
                <option value="LOST">Not returned — mark lost</option>
              </select>
            )}
          </FormField>

          <FormField label="Note" name="returnNote">
            {(p) => <Textarea {...p} rows={2} maxLength={500} />}
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
              Record return
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
