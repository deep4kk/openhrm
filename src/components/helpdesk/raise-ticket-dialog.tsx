"use client";

import { useActionState, useState } from "react";
import { LifeBuoy, Loader2 } from "lucide-react";

import { raiseTicketAction } from "@/lib/actions/helpdesk";
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

export interface QueueOption {
  id: string;
  name: string;
  description: string | null;
  slaHours: number;
}

/**
 * Raising a ticket.
 *
 * The queue's own SLA is shown as soon as one is picked, so the employee leaves
 * knowing when to expect an answer. A helpdesk that swallows questions silently
 * is the thing people go back to WhatsApp to avoid.
 */
export function RaiseTicketDialog({
  queues,
  label = "Ask HR",
}: {
  queues: QueueOption[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    raiseTicketAction,
    {},
  );
  const [categoryId, setCategoryId] = useState(queues[0]?.id ?? "");

  const queue = queues.find((q) => q.id === categoryId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <LifeBuoy className="size-4" aria-hidden />
        {label}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ask HR</DialogTitle>
          <DialogDescription>
            Your question goes to the right person with a clock on it, instead of
            into a chat thread.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />

          <FormField
            label="What is it about"
            name="categoryId"
            hint={
              queue
                ? `${queue.description ?? "Routed to the owning team."} Answered within ${queue.slaHours} hours.`
                : undefined
            }
          >
            {(p) => (
              <select
                {...p}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label="Subject"
            name="subject"
            error={state.fieldErrors?.subject}
            required
          >
            {(p) => <Input {...p} maxLength={160} />}
          </FormField>

          <FormField
            label="Details"
            name="body"
            error={state.fieldErrors?.body}
            required
            hint="Dates, amounts and what you have already tried save a round trip."
          >
            {(p) => <Textarea {...p} rows={5} maxLength={4000} />}
          </FormField>

          <FormField label="Priority" name="priority">
            {(p) => (
              <select
                {...p}
                defaultValue="NORMAL"
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="LOW">Low — whenever</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High — blocking something</option>
                <option value="URGENT">Urgent — today</option>
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
              Send it
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
