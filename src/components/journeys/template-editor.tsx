"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteChecklistTemplateAction,
  saveChecklistTemplateAction,
} from "@/lib/actions/journeys";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The checklist template editor.
 *
 * Tasks are edited as a list of rows with an offset in days rather than a date,
 * because a template is not tied to a person: "-2" means "two days before they
 * start", and it stays true for every hire. The row shows what that resolves to
 * in words so the number isn't a puzzle.
 */

const CATEGORIES = ["HR", "IT", "Finance", "Manager", "Admin"];

export interface TemplateItemDraft {
  title: string;
  category: string;
  offsetDays: number;
}

export interface TemplateDraft {
  id?: string;
  name: string;
  kind: "ONBOARDING" | "OFFBOARDING";
  description: string;
  items: TemplateItemDraft[];
  usageCount: number;
}

export function TemplateEditor({
  template,
  onDone,
}: {
  template: TemplateDraft;
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveChecklistTemplateAction,
    {},
  );
  const [items, setItems] = useState<TemplateItemDraft[]>(
    template.items.length > 0
      ? template.items
      : [{ title: "", category: "HR", offsetDays: 0 }],
  );
  const [kind, setKind] = useState(template.kind);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Checklist saved");
      router.refresh();
      onDone?.();
    }
  }, [state.success, router, onDone]);

  function update(index: number, patch: Partial<TemplateItemDraft>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  const anchorWord = kind === "OFFBOARDING" ? "last working day" : "joining day";

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      {template.id && <input type="hidden" name="id" value={template.id} />}
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items.filter((item) => item.title.trim().length > 0),
        )}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Name"
          name="name"
          error={state.fieldErrors?.name}
          required
        >
          {(p) => <Input {...p} defaultValue={template.name} maxLength={120} />}
        </FormField>

        <FormField label="Kind" name="kind" required>
          {(p) => (
            <select
              {...p}
              value={kind}
              onChange={(e) =>
                setKind(e.target.value as "ONBOARDING" | "OFFBOARDING")
              }
              className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
            >
              <option value="ONBOARDING">Onboarding</option>
              <option value="OFFBOARDING">Offboarding / exit clearance</option>
            </select>
          )}
        </FormField>
      </div>

      <FormField
        label="Description"
        name="description"
        hint="What this checklist covers, for whoever picks it next."
      >
        {(p) => (
          <Textarea {...p} rows={2} defaultValue={template.description} maxLength={500} />
        )}
      </FormField>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            Tasks
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {items.filter((i) => i.title.trim()).length}
            </span>
          </h3>
          {state.fieldErrors?.items && (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.items}
            </p>
          )}
        </div>

        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={index}
              className="bg-card flex flex-wrap items-center gap-2 rounded-lg border p-2"
            >
              <GripVertical
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden
              />

              <Input
                value={item.title}
                onChange={(e) => update(index, { title: e.target.value })}
                placeholder="What needs doing"
                aria-label={`Task ${index + 1} title`}
                className="min-w-[12rem] flex-1"
                maxLength={200}
              />

              <select
                value={item.category}
                onChange={(e) => update(index, { category: e.target.value })}
                aria-label={`Task ${index + 1} owner team`}
                className="border-input bg-background h-9 rounded-lg border px-2 text-sm"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  value={item.offsetDays}
                  onChange={(e) =>
                    update(index, { offsetDays: Number(e.target.value) })
                  }
                  aria-label={`Task ${index + 1} day offset`}
                  className="w-20 tabular-nums"
                  min={-180}
                  max={365}
                />
                <span className="text-muted-foreground w-28 shrink-0 text-xs">
                  {offsetLabel(item.offsetDays, anchorWord)}
                </span>
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() =>
                  setItems((current) => current.filter((_, i) => i !== index))
                }
                aria-label={`Remove task ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() =>
            setItems((current) => [
              ...current,
              { title: "", category: "HR", offsetDays: 0 },
            ])
          }
        >
          <Plus className="size-4" aria-hidden />
          Add task
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        {template.id && (
          <DeleteTemplateButton
            id={template.id}
            name={template.name}
            usageCount={template.usageCount}
          />
        )}
        <div className="ml-auto flex gap-2">
          {onDone && (
            <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save checklist
          </Button>
        </div>
      </div>
    </form>
  );
}

function DeleteTemplateButton({
  id,
  name,
  usageCount,
}: {
  id: string;
  name: string;
  usageCount: number;
}) {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={async () => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        setPending(true);
        const result = await deleteChecklistTemplateAction(id);
        setPending(false);
        if (result.error) {
          toast.error(result.error);
          return;
        }
        toast.success("Checklist deleted");
        router.refresh();
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
      {usageCount > 0 && (
        <span className="text-muted-foreground ml-1 text-xs">
          (used {usageCount}×)
        </span>
      )}
    </Button>
  );
}

function offsetLabel(days: number, anchorWord: string): string {
  if (days === 0) return `on ${anchorWord}`;
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} before`;
  return `${days} day${days === 1 ? "" : "s"} after`;
}
