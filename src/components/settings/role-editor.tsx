"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteRoleAction,
  resetSystemRoleAction,
  saveRoleAction,
} from "@/lib/actions/platform";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";

/**
 * The permission matrix, editable.
 *
 * This is the screen the PRD's "granular, configurable permission matrix, not
 * hardcoded roles" cashes out into. Two details make it usable rather than
 * merely correct:
 *
 *  - Sensitive permissions are marked in the list, so someone composing a
 *    "read-only auditor" can see at a glance that they are about to hand over
 *    salary and bank-detail access.
 *  - Whole groups can be toggled at once, because the realistic edit is "give
 *    this role everything under Recruitment", not seven individual clicks.
 */

export interface PermissionOption {
  key: string;
  label: string;
  group: string;
  description: string;
  sensitive: boolean;
}

export interface RoleRow {
  id: string;
  key: string;
  name: string;
  description: string;
  permissions: string[];
  isSystem: boolean;
  userCount: number;
}

export function RoleEditor({
  roles,
  permissions,
}: {
  roles: RoleRow[];
  permissions: PermissionOption[];
}) {
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4" aria-hidden />
          New role
        </Button>
      </div>

      <ul className="surface divide-y overflow-hidden">
        {roles.map((role) => (
          <li
            key={role.id}
            className="flex flex-wrap items-center gap-3 p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{role.name}</p>
                {role.isSystem && (
                  <StatusBadge label="Built in" tone="neutral" />
                )}
                {role.permissions.includes("role.manage") && (
                  <StatusBadge label="Can change permissions" tone="warning" />
                )}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {role.permissions.length} of {permissions.length} permissions ·{" "}
                {role.userCount} {role.userCount === 1 ? "person" : "people"}
                {role.description && ` · ${role.description}`}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {role.isSystem && <ResetButton roleId={role.id} name={role.name} />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(role)}
              >
                Edit
              </Button>
              {!role.isSystem && role.userCount === 0 && (
                <DeleteButton roleId={role.id} name={role.name} />
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <RoleDialog
          role={editing === "new" ? null : editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function RoleDialog({
  role,
  permissions,
  onClose,
}: {
  role: RoleRow | null;
  permissions: PermissionOption[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveRoleAction,
    {},
  );
  const [selected, setSelected] = useState<Set<string>>(
    new Set(role?.permissions ?? []),
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(role ? "Role updated" : "Role created");
      router.refresh();
      onClose();
    }
  }, [state.success, role, router, onClose]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionOption[]>();
    for (const permission of permissions) {
      const list = map.get(permission.group) ?? [];
      list.push(permission);
      map.set(permission.group, list);
    }
    return Array.from(map.entries());
  }, [permissions]);

  function toggle(key: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleGroup(group: string) {
    const keys = permissions.filter((p) => p.group === group).map((p) => p.key);
    const all = keys.every((key) => selected.has(key));

    setSelected((cur) => {
      const next = new Set(cur);
      for (const key of keys) {
        if (all) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  const sensitiveCount = permissions.filter(
    (p) => p.sensitive && selected.has(p.key),
  ).length;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>
            A role is a set of permissions. Nothing else about it is special —
            the app never asks &ldquo;is this an admin?&rdquo;, only &ldquo;does
            this person hold this permission?&rdquo;
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          {role && <input type="hidden" name="id" value={role.id} />}
          <input
            type="hidden"
            name="permissions"
            value={JSON.stringify(Array.from(selected))}
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="Name"
              name="name"
              error={state.fieldErrors?.name}
              required
            >
              {(p) => (
                <Input {...p} defaultValue={role?.name} maxLength={60} />
              )}
            </FormField>

            <FormField label="Description" name="description">
              {(p) => (
                <Textarea
                  {...p}
                  rows={1}
                  defaultValue={role?.description}
                  maxLength={300}
                />
              )}
            </FormField>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{selected.size}</span>{" "}
              permission{selected.size === 1 ? "" : "s"} selected
            </p>
            {sensitiveCount > 0 && (
              <StatusBadge
                label={`${sensitiveCount} sensitive`}
                tone="warning"
              />
            )}
          </div>

          <div className="max-h-[45vh] space-y-5 overflow-y-auto pr-1">
            {groups.map(([group, items]) => {
              const chosen = items.filter((i) => selected.has(i.key)).length;

              return (
                <section key={group}>
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-xs font-semibold tracking-wide uppercase">
                      {group}
                      <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                        {chosen}/{items.length}
                      </span>
                    </h3>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleGroup(group)}
                    >
                      {chosen === items.length ? "Clear all" : "Select all"}
                    </Button>
                  </div>

                  <ul className="space-y-1.5">
                    {items.map((permission) => (
                      <li key={permission.key} className="flex items-start gap-3">
                        <Checkbox
                          id={permission.key}
                          checked={selected.has(permission.key)}
                          onCheckedChange={() => toggle(permission.key)}
                        />
                        <Label
                          htmlFor={permission.key}
                          className="flex-1 font-normal"
                        >
                          <span
                            className={cn(
                              "flex items-center gap-1.5",
                              permission.sensitive && "text-warning font-medium",
                            )}
                          >
                            {permission.label}
                            {permission.sensitive && (
                              <ShieldCheck className="size-3" aria-label="Sensitive" />
                            )}
                          </span>
                          <span className="text-muted-foreground mt-0.5 block text-xs">
                            {permission.description}
                          </span>
                        </Label>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save role
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResetButton({ roleId, name }: { roleId: string; name: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={async () => {
        if (
          !confirm(
            `Reset "${name}" to the permissions OpenHRM ships with? Any customisation is lost.`,
          )
        ) {
          return;
        }
        setPending(true);
        const result = await resetSystemRoleAction(roleId);
        setPending(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Role reset");
        router.refresh();
      }}
    >
      <RotateCcw className="size-3.5" aria-hidden />
      Reset
    </Button>
  );
}

function DeleteButton({ roleId, name }: { roleId: string; name: string }) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Delete ${name}`}
      onClick={async () => {
        if (!confirm(`Delete the "${name}" role?`)) return;
        setPending(true);
        const result = await deleteRoleAction(roleId);
        setPending(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Role deleted");
        router.refresh();
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}
