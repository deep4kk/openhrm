"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Plus, Trash2, Webhook } from "lucide-react";
import { toast } from "sonner";

import {
  deleteWebhookAction,
  saveWebhookAction,
  setWebhookStatusAction,
} from "@/lib/actions/platform";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Outbound webhooks.
 *
 * The signing secret is shown once when the endpoint is created, for the same
 * reason as an API key: the receiver needs it to verify the HMAC, and storing
 * it retrievably would mean a database dump leaks the ability to forge our
 * payloads.
 *
 * Recent deliveries are listed under each endpoint. A webhook you cannot debug
 * is a webhook that silently stopped working three weeks ago.
 */

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  status: string;
  failureCount: number;
  lastDeliveryLabel: string | null;
  deliveries: {
    id: string;
    event: string;
    statusCode: number | null;
    error: string | null;
    createdLabel: string;
    delivered: boolean;
  }[];
}

export function WebhookManager({
  endpoints,
  events,
}: {
  endpoints: WebhookRow[];
  events: { name: string; description: string }[];
}) {
  const [editing, setEditing] = useState<WebhookRow | "new" | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const handleClose = useCallback(() => setEditing(null), []);
  const handleSecret = useCallback((value: string) => {
    setSecret(value);
    setEditing(null);
  }, []);

  return (
    <div className="space-y-4">
      {secret && <SecretPanel value={secret} onDismiss={() => setSecret(null)} />}

      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          Add endpoint
        </Button>
      </div>

      {endpoints.length === 0 ? (
        <div className="surface text-muted-foreground p-8 text-center text-sm">
          No endpoints registered.
        </div>
      ) : (
        <ul className="space-y-3">
          {endpoints.map((endpoint) => (
            <li key={endpoint.id} className="surface p-4">
              <div className="flex flex-wrap items-start gap-3">
                <Webhook
                  className="text-muted-foreground mt-0.5 size-4 shrink-0"
                  aria-hidden
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{endpoint.name}</p>
                    <StatusBadge
                      label={
                        endpoint.status === "ACTIVE"
                          ? "Active"
                          : endpoint.status === "PAUSED"
                            ? "Paused"
                            : "Failing"
                      }
                      tone={
                        endpoint.status === "ACTIVE"
                          ? "positive"
                          : endpoint.status === "PAUSED"
                            ? "neutral"
                            : "critical"
                      }
                    />
                    {endpoint.failureCount > 0 && (
                      <StatusBadge
                        label={`${endpoint.failureCount} failures`}
                        tone="warning"
                      />
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 truncate font-mono text-xs">
                    {endpoint.url}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {endpoint.events.length} event
                    {endpoint.events.length === 1 ? "" : "s"}
                    {endpoint.lastDeliveryLabel &&
                      ` · last delivered ${endpoint.lastDeliveryLabel}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <PauseButton
                    endpointId={endpoint.id}
                    status={endpoint.status}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditing(endpoint)}
                  >
                    Edit
                  </Button>
                  <DeleteButton endpointId={endpoint.id} name={endpoint.name} />
                </div>
              </div>

              {endpoint.deliveries.length > 0 && (
                <details className="mt-3 border-t pt-3">
                  <summary className="text-muted-foreground cursor-pointer text-xs">
                    Recent deliveries ({endpoint.deliveries.length})
                  </summary>
                  <ul className="mt-2 space-y-1.5">
                    {endpoint.deliveries.map((delivery) => (
                      <li
                        key={delivery.id}
                        className="flex flex-wrap items-center gap-2 text-xs"
                      >
                        <code className="text-muted-foreground">
                          {delivery.event}
                        </code>
                        <StatusBadge
                          label={
                            delivery.delivered
                              ? `${delivery.statusCode ?? 200}`
                              : (delivery.error ?? "failed")
                          }
                          tone={delivery.delivered ? "positive" : "critical"}
                        />
                        <span className="text-muted-foreground tabular-nums">
                          {delivery.createdLabel}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <WebhookDialog
          endpoint={editing === "new" ? null : editing}
          events={events}
          onClose={handleClose}
          onSecret={handleSecret}
        />
      )}
    </div>
  );
}

function SecretPanel({
  value,
  onDismiss,
}: {
  value: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="border-warning/40 bg-warning-subtle space-y-3 rounded-lg border p-5">
      <h3 className="text-sm font-semibold">Your signing secret</h3>
      <p className="text-xs">
        Every payload arrives with an <code>X-OpenHRM-Signature</code> header:
        the HMAC-SHA256 of the raw body, keyed with this secret. Verify it before
        trusting the payload. Shown once.
      </p>
      <div className="flex items-center gap-2">
        <code className="bg-background flex-1 overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <Button
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            toast.success("Copied");
          }}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          Copy
        </Button>
      </div>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        I have saved it
      </Button>
    </div>
  );
}

function WebhookDialog({
  endpoint,
  events,
  onClose,
  onSecret,
}: {
  endpoint: WebhookRow | null;
  events: { name: string; description: string }[];
  onClose: () => void;
  onSecret: (secret: string) => void;
}) {
  const [state, action, pending] = useActionState<
    FormState & { secret?: string },
    FormData
  >(saveWebhookAction, {});
  const [selected, setSelected] = useState<Set<string>>(
    new Set(endpoint?.events ?? []),
  );
  const router = useRouter();

  useEffect(() => {
    if (state.secret) {
      onSecret(state.secret);
      router.refresh();
    } else if (state.success) {
      toast.success("Endpoint saved");
      router.refresh();
      onClose();
    }
  }, [state.secret, state.success, onSecret, onClose, router]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {endpoint ? `Edit ${endpoint.name}` : "Add a webhook endpoint"}
          </DialogTitle>
          <DialogDescription>
            We POST a signed JSON body to this URL when the chosen events happen.
            Delivery is fire-and-forget: a failing endpoint never blocks an HR
            action.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          {endpoint && <input type="hidden" name="id" value={endpoint.id} />}
          <input
            type="hidden"
            name="events"
            value={JSON.stringify(Array.from(selected))}
          />

          <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
            <FormField
              label="Name"
              name="name"
              error={state.fieldErrors?.name}
              required
            >
              {(p) => <Input {...p} defaultValue={endpoint?.name} maxLength={60} />}
            </FormField>

            <FormField
              label="URL"
              name="url"
              error={state.fieldErrors?.url}
              required
              hint="Must be https, except on localhost."
            >
              {(p) => (
                <Input
                  {...p}
                  type="url"
                  defaultValue={endpoint?.url}
                  className="font-mono text-xs"
                  maxLength={2000}
                />
              )}
            </FormField>
          </div>

          {state.fieldErrors?.events && (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.events}
            </p>
          )}

          <div className="max-h-[40vh] space-y-1.5 overflow-y-auto border-t pr-1 pt-4">
            {events.map((event) => (
              <div key={event.name} className="flex items-start gap-3">
                <Checkbox
                  id={`event-${event.name}`}
                  checked={selected.has(event.name)}
                  onCheckedChange={() =>
                    setSelected((cur) => {
                      const next = new Set(cur);
                      if (next.has(event.name)) next.delete(event.name);
                      else next.add(event.name);
                      return next;
                    })
                  }
                />
                <Label
                  htmlFor={`event-${event.name}`}
                  className="flex-1 font-normal"
                >
                  <code className="text-xs">{event.name}</code>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {event.description}
                  </span>
                </Label>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <p className="text-muted-foreground text-xs tabular-nums">
              {selected.size} event{selected.size === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || selected.size === 0}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Save endpoint
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PauseButton({
  endpointId,
  status,
}: {
  endpointId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const paused = status === "PAUSED";

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setWebhookStatusAction(
            endpointId,
            paused ? "ACTIVE" : "PAUSED",
          );
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(paused ? "Resumed" : "Paused");
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      {paused ? "Resume" : "Pause"}
    </Button>
  );
}

function DeleteButton({
  endpointId,
  name,
}: {
  endpointId: string;
  name: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Delete ${name}`}
      onClick={() => {
        if (!confirm(`Delete the "${name}" endpoint?`)) return;
        startTransition(async () => {
          const result = await deleteWebhookAction(endpointId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Endpoint deleted");
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
