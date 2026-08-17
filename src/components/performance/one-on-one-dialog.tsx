"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

import { saveOneOnOneAction } from "@/lib/actions/performance";
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
 * Logging a 1:1.
 *
 * Three boxes in the order the conversation happens: what you planned to talk
 * about, what was said, what you each agreed to do. The last one is the reason
 * the feature exists — a 1:1 with no action items is a chat, and a month later
 * neither person remembers which it was.
 */
export function OneOnOneDialog({
  reports,
  meeting,
}: {
  reports: { id: string; name: string }[];
  meeting?: {
    id: string;
    employeeId: string;
    scheduledAt: string;
    agenda: string;
    notes: string;
    actionItems: string;
    completed: boolean;
  };
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveOneOnOneAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(meeting ? "1:1 updated" : "1:1 logged");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, meeting, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant={meeting ? "ghost" : "default"} size={meeting ? "sm" : "default"} />}
      >
        {meeting ? (
          <>
            <Pencil className="size-3.5" aria-hidden />
            Edit
          </>
        ) : (
          <>
            <Plus className="size-4" aria-hidden />
            Log a 1:1
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{meeting ? "Edit 1:1" : "Log a 1:1"}</DialogTitle>
          <DialogDescription>
            Only you and the other person can read this.
          </DialogDescription>
        </DialogHeader>

        <form
          action={action}
          className="max-h-[70vh] space-y-5 overflow-y-auto pr-1"
        >
          <FormError message={state.error} />
          {meeting && <input type="hidden" name="id" value={meeting.id} />}

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="With"
              name="employeeId"
              error={state.fieldErrors?.employeeId}
              required
            >
              {(p) => (
                <select
                  {...p}
                  defaultValue={meeting?.employeeId}
                  disabled={Boolean(meeting)}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm disabled:opacity-60"
                >
                  {reports.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label="When"
              name="scheduledAt"
              error={state.fieldErrors?.scheduledAt}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="datetime-local"
                  defaultValue={
                    meeting?.scheduledAt ?? new Date().toISOString().slice(0, 16)
                  }
                />
              )}
            </FormField>
          </div>

          <FormField label="Agenda" name="agenda" hint="What you plan to cover.">
            {(p) => (
              <Textarea {...p} rows={3} defaultValue={meeting?.agenda} maxLength={3000} />
            )}
          </FormField>

          <FormField label="Notes" name="notes">
            {(p) => (
              <Textarea {...p} rows={5} defaultValue={meeting?.notes} maxLength={8000} />
            )}
          </FormField>

          <FormField
            label="Agreed next steps"
            name="actionItems"
            hint="Who is doing what before the next one."
          >
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                defaultValue={meeting?.actionItems}
                maxLength={3000}
              />
            )}
          </FormField>

          <div className="flex items-center gap-3">
            <Checkbox
              id="completed"
              name="completed"
              defaultChecked={meeting?.completed}
            />
            <Label htmlFor="completed" className="font-normal">
              This meeting happened
            </Label>
          </div>

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
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
