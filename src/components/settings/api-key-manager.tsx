"use client";

import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { createApiKeyAction, revokeApiKeyAction } from "@/lib/actions/platform";
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
 * API keys.
 *
 * The plaintext key is shown exactly once, in a panel that will not go away
 * until it is dismissed, with a copy button and a sentence explaining that
 * there is no second chance. Everything else about this screen is ordinary CRUD;
 * that one moment is the whole design problem.
 */

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  permissions: string[];
  createdLabel: string;
  lastUsedLabel: string | null;
  expiresLabel: string | null;
  revoked: boolean;
}

export interface PermissionOption {
  key: string;
  label: string;
  group: string;
  /** Whether the person issuing the key holds it themselves. */
  held: boolean;
}

export function ApiKeyManager({
  keys,
  permissions,
}: {
  keys: ApiKeyRow[];
  permissions: PermissionOption[];
}) {
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);

  // Stable identities: the dialog runs these from an effect, so a new function
  // on every render would re-fire it.
  const handleClose = useCallback(() => setCreating(false), []);
  const handleIssued = useCallback((secret: string) => {
    setIssued(secret);
    setCreating(false);
  }, []);

  return (
    <div className="space-y-4">
      {issued && <IssuedKeyPanel value={issued} onDismiss={() => setIssued(null)} />}

      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          Issue a key
        </Button>
      </div>

      {keys.length === 0 ? (
        <div className="surface text-muted-foreground p-8 text-center text-sm">
          No API keys yet.
        </div>
      ) : (
        <ul className="surface divide-y overflow-hidden">
          {keys.map((key) => (
            <li key={key.id} className="flex flex-wrap items-center gap-3 p-4">
              <KeyRound
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{key.name}</p>
                  <code className="text-muted-foreground text-xs">
                    {key.prefix}…
                  </code>
                  {key.revoked && <StatusBadge label="Revoked" tone="critical" />}
                  {!key.revoked && key.expiresLabel && (
                    <StatusBadge
                      label={`Expires ${key.expiresLabel}`}
                      tone="neutral"
                    />
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {key.permissions.length} permission
                  {key.permissions.length === 1 ? "" : "s"} · created{" "}
                  {key.createdLabel}
                  {key.lastUsedLabel
                    ? ` · last used ${key.lastUsedLabel}`
                    : " · never used"}
                </p>
              </div>

              {!key.revoked && <RevokeButton keyId={key.id} name={key.name} />}
            </li>
          ))}
        </ul>
      )}

      {creating && (
        <CreateKeyDialog
          permissions={permissions}
          onClose={handleClose}
          onIssued={handleIssued}
        />
      )}
    </div>
  );
}

function IssuedKeyPanel({
  value,
  onDismiss,
}: {
  value: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="border-warning/40 bg-warning-subtle space-y-3 rounded-lg border p-5">
      <h3 className="text-sm font-semibold">Copy this key now</h3>
      <p className="text-xs">
        It is not stored — only a hash of it is. If you lose it you will have to
        issue a new one.
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

function CreateKeyDialog({
  permissions,
  onClose,
  onIssued,
}: {
  permissions: PermissionOption[];
  onClose: () => void;
  onIssued: (secret: string) => void;
}) {
  const [state, action, pending] = useActionState<
    FormState & { plaintext?: string },
    FormData
  >(createApiKeyAction, {});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const router = useRouter();

  // Only permissions the issuer holds can be granted — the action enforces it
  // too, but offering the rest would be an invitation to a confusing failure.
  const available = useMemo(
    () => permissions.filter((p) => p.held),
    [permissions],
  );

  const groups = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const permission of available) {
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return Array.from(map.entries());
  }, [available]);

  useEffect(() => {
    if (state.plaintext) {
      onIssued(state.plaintext);
      router.refresh();
    }
  }, [state.plaintext, onIssued, router]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Issue an API key</DialogTitle>
          <DialogDescription>
            A key can never do more than you can. Only permissions you hold
            yourself are offered.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          <input
            type="hidden"
            name="permissions"
            value={JSON.stringify(Array.from(selected))}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="What is it for"
              name="name"
              error={state.fieldErrors?.name}
              required
              hint="Name it after the system that will use it."
            >
              {(p) => <Input {...p} maxLength={60} />}
            </FormField>

            <FormField
              label="Expires in (days)"
              name="expiresInDays"
              hint="Leave blank for no expiry."
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={3650}
                  className="tabular-nums"
                />
              )}
            </FormField>
          </div>

          {state.fieldErrors?.permissions && (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.permissions}
            </p>
          )}

          <div className="max-h-[40vh] space-y-5 overflow-y-auto border-t pr-1 pt-4">
            {groups.map(([group, items]) => (
              <section key={group}>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  {group}
                </h3>
                <ul className="space-y-1.5">
                  {items.map((permission) => (
                    <li key={permission.key} className="flex items-center gap-3">
                      <Checkbox
                        id={`key-${permission.key}`}
                        checked={selected.has(permission.key)}
                        onCheckedChange={() =>
                          setSelected((cur) => {
                            const next = new Set(cur);
                            if (next.has(permission.key)) next.delete(permission.key);
                            else next.add(permission.key);
                            return next;
                          })
                        }
                      />
                      <Label
                        htmlFor={`key-${permission.key}`}
                        className="flex-1 font-normal"
                      >
                        {permission.label}
                        <code className="text-muted-foreground ml-2 text-[10px]">
                          {permission.key}
                        </code>
                      </Label>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <p className="text-muted-foreground text-xs tabular-nums">
              {selected.size} selected
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || selected.size === 0}>
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Issue key
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevokeButton({ keyId, name }: { keyId: string; name: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={async () => {
        if (
          !confirm(
            `Revoke "${name}"? Anything using it stops working immediately.`,
          )
        ) {
          return;
        }
        setPending(true);
        const result = await revokeApiKeyAction(keyId);
        setPending(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Key revoked");
        router.refresh();
      }}
    >
      {pending && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
      Revoke
    </Button>
  );
}
