"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Send } from "lucide-react";
import { toast } from "sonner";

import {
  commentOnTicketAction,
  updateTicketAction,
} from "@/lib/actions/helpdesk";
import type { FormState } from "@/lib/actions/auth";
import { FormError } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * The queue controls: status, owner, priority, queue.
 *
 * Four selects that each write immediately rather than a form with a save
 * button. Working a queue means dozens of small changes an hour, and a save
 * button on each is a click that buys nothing — every change is a single field
 * and the server is the only thing that has to agree.
 */
export function TicketControls({
  ticketId,
  status,
  assigneeId,
  priority,
  categoryId,
  owners,
  queues,
}: {
  ticketId: string;
  status: string;
  assigneeId: string | null;
  priority: string;
  categoryId: string | null;
  owners: { id: string; name: string }[];
  queues: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function patch(next: Parameters<typeof updateTicketAction>[1], message: string) {
    startTransition(async () => {
      const result = await updateTicketAction(ticketId, next);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      router.refresh();
    });
  }

  const selectClass =
    "border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm disabled:opacity-60";

  return (
    <div className="surface space-y-4 p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        Queue controls
        {pending && (
          <Loader2 className="text-muted-foreground size-3.5 animate-spin" aria-hidden />
        )}
      </h2>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ticket-status">Status</Label>
          <select
            id="ticket-status"
            value={status}
            disabled={pending}
            onChange={(e) =>
              patch(
                { status: e.target.value as "OPEN" },
                `Marked ${e.target.value.toLowerCase().replace("_", " ")}`,
              )
            }
            className={selectClass}
          >
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="WAITING">Waiting on requester</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ticket-owner">Owner</Label>
          <select
            id="ticket-owner"
            value={assigneeId ?? ""}
            disabled={pending}
            onChange={(e) =>
              patch(
                { assigneeId: e.target.value || null },
                e.target.value ? "Assigned" : "Unassigned",
              )
            }
            className={selectClass}
          >
            <option value="">Unassigned</option>
            {owners.map((owner) => (
              <option key={owner.id} value={owner.id}>
                {owner.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ticket-priority">Priority</Label>
          <select
            id="ticket-priority"
            value={priority}
            disabled={pending}
            onChange={(e) =>
              patch({ priority: e.target.value as "NORMAL" }, "Priority changed")
            }
            className={selectClass}
          >
            <option value="LOW">Low</option>
            <option value="NORMAL">Normal</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ticket-queue">Queue</Label>
          <select
            id="ticket-queue"
            value={categoryId ?? ""}
            disabled={pending}
            onChange={(e) =>
              patch({ categoryId: e.target.value || null }, "Moved queue")
            }
            className={selectClass}
          >
            <option value="">No queue</option>
            {queues.map((queue) => (
              <option key={queue.id} value={queue.id}>
                {queue.name}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

/**
 * Replying.
 *
 * The internal-note toggle changes the box's own appearance, not just a
 * checkbox somewhere. Posting an internal note into a customer-visible thread
 * by accident is the classic helpdesk mistake, and the cheapest guard against
 * it is making the two modes look nothing alike.
 */
export function TicketReply({
  ticketId,
  canWriteInternal,
}: {
  ticketId: string;
  canWriteInternal: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    commentOnTicketAction,
    {},
  );
  const [internal, setInternal] = useState(false);
  const [body, setBody] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      setBody("");
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <form
      action={action}
      className={
        internal
          ? "border-warning/40 bg-warning-subtle space-y-3 rounded-lg border p-4"
          : "surface space-y-3 p-4"
      }
    >
      <FormError message={state.error} />
      <input type="hidden" name="ticketId" value={ticketId} />
      {internal && <input type="hidden" name="isInternal" value="on" />}

      <Textarea
        name="body"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={4000}
        aria-label={internal ? "Internal note" : "Reply"}
        placeholder={
          internal
            ? "Only the HR queue sees this."
            : "The requester will see this and get a notification."
        }
        aria-invalid={Boolean(state.fieldErrors?.body)}
      />
      {state.fieldErrors?.body && (
        <p role="alert" className="text-destructive text-xs">
          {state.fieldErrors.body}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {canWriteInternal ? (
          <div className="flex items-center gap-2">
            <Checkbox
              id="internal"
              checked={internal}
              onCheckedChange={(v) => setInternal(v === true)}
            />
            <Label htmlFor="internal" className="font-normal">
              <Lock className="mr-1 inline size-3.5" aria-hidden />
              Internal note — the requester won&apos;t see it
            </Label>
          </div>
        ) : (
          <span />
        )}

        <Button type="submit" disabled={pending || body.trim().length === 0}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {internal ? "Add note" : "Reply"}
        </Button>
      </div>
    </form>
  );
}
