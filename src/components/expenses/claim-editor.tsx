"use client";

import { useActionState, useRef, useState } from "react";
import { Loader2, Paperclip, Plus, Send, Trash2 } from "lucide-react";

import { saveClaimAction } from "@/lib/actions/expenses";
import type { FormState } from "@/lib/actions/auth";
import { formatMoney } from "@/lib/money";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";

/**
 * Writing an expense claim.
 *
 * The running total sits at the bottom and updates as lines are typed, because
 * "how much am I claiming?" is the question the claimant checks before pressing
 * submit, and making them add it up themselves is how a wrong number gets filed.
 *
 * Receipts are read into a data: URI in the browser and posted with the form.
 * That keeps the app free of an object-storage dependency — the same trade the
 * letterhead logo makes, documented in docs/DOCUMENTS.md — at the cost of a
 * hard 2 MB ceiling per receipt, which the picker enforces before upload rather
 * than failing on submit.
 */

export interface ExpenseCategoryOption {
  id: string;
  name: string;
  maxAmount: number | null;
  requiresReceipt: boolean;
}

export interface ClaimItemDraft {
  description: string;
  spentOn: string;
  amount: string;
  categoryId: string;
  merchant: string;
  costCenter: string;
  receiptUrl: string;
  receiptName: string;
}

const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;

function emptyItem(): ClaimItemDraft {
  return {
    description: "",
    spentOn: new Date().toISOString().slice(0, 10),
    amount: "",
    categoryId: "",
    merchant: "",
    costCenter: "",
    receiptUrl: "",
    receiptName: "",
  };
}

export function ClaimEditor({
  claim,
  categories,
  currency,
}: {
  claim?: {
    id: string;
    title: string;
    description: string;
    items: ClaimItemDraft[];
  };
  categories: ExpenseCategoryOption[];
  currency: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveClaimAction,
    {},
  );
  const [items, setItems] = useState<ClaimItemDraft[]>(
    claim?.items.length ? claim.items : [emptyItem()],
  );
  const [intent, setIntent] = useState<"draft" | "submit">("submit");

  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  function update(index: number, patch: Partial<ClaimItemDraft>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      {claim?.id && <input type="hidden" name="id" value={claim.id} />}
      <input type="hidden" name="intent" value={intent} />
      <input
        type="hidden"
        name="items"
        value={JSON.stringify(
          items
            .filter((item) => item.description.trim() && Number(item.amount) > 0)
            .map((item) => ({
              description: item.description,
              spentOn: item.spentOn,
              amount: Number(item.amount),
              categoryId: item.categoryId || undefined,
              merchant: item.merchant || undefined,
              costCenter: item.costCenter || undefined,
              receiptUrl: item.receiptUrl || undefined,
            })),
        )}
      />

      <div className="surface space-y-5 p-5">
        <FormField
          label="What is this claim for"
          name="title"
          error={state.fieldErrors?.title}
          required
          hint="One line your approver will read first — “Client visit, Bengaluru”."
        >
          {(p) => <Input {...p} defaultValue={claim?.title} maxLength={120} />}
        </FormField>

        <FormField label="Notes" name="description">
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              defaultValue={claim?.description}
              maxLength={1000}
            />
          )}
        </FormField>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Expenses
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {items.length}
            </span>
          </h2>
          {state.fieldErrors?.items && (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.items}
            </p>
          )}
        </div>

        <ul className="space-y-3">
          {items.map((item, index) => {
            const category = categories.find((c) => c.id === item.categoryId);
            const overCap =
              category?.maxAmount != null &&
              Number(item.amount) > category.maxAmount;
            const needsReceipt = category?.requiresReceipt && !item.receiptUrl;

            return (
              <li key={index} className="surface space-y-3 p-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_9rem_8rem]">
                  <Input
                    value={item.description}
                    onChange={(e) => update(index, { description: e.target.value })}
                    placeholder="What was bought"
                    aria-label={`Line ${index + 1} description`}
                    maxLength={200}
                  />
                  <Input
                    type="date"
                    value={item.spentOn}
                    onChange={(e) => update(index, { spentOn: e.target.value })}
                    aria-label={`Line ${index + 1} date`}
                  />
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.amount}
                    onChange={(e) => update(index, { amount: e.target.value })}
                    placeholder="0.00"
                    aria-label={`Line ${index + 1} amount`}
                    className="tabular-nums"
                    aria-invalid={overCap}
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                  <select
                    value={item.categoryId}
                    onChange={(e) => update(index, { categoryId: e.target.value })}
                    aria-label={`Line ${index + 1} category`}
                    className="border-input bg-background h-9 rounded-lg border px-2.5 text-sm"
                  >
                    <option value="">Uncategorised</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>

                  <Input
                    value={item.merchant}
                    onChange={(e) => update(index, { merchant: e.target.value })}
                    placeholder="Merchant"
                    aria-label={`Line ${index + 1} merchant`}
                    maxLength={120}
                  />

                  <Input
                    value={item.costCenter}
                    onChange={(e) => update(index, { costCenter: e.target.value })}
                    placeholder="Project / cost centre"
                    aria-label={`Line ${index + 1} cost centre`}
                    maxLength={60}
                  />

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setItems((current) =>
                        current.length === 1
                          ? [emptyItem()]
                          : current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Remove line ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <ReceiptPicker
                    index={index}
                    receiptName={item.receiptName}
                    onPick={(url, name) =>
                      update(index, { receiptUrl: url, receiptName: name })
                    }
                    onClear={() => update(index, { receiptUrl: "", receiptName: "" })}
                  />

                  {overCap && (
                    <StatusBadge
                      label={`Over the ${formatMoney(category!.maxAmount, currency)} cap`}
                      tone="critical"
                    />
                  )}
                  {needsReceipt && (
                    <StatusBadge label="Receipt required" tone="warning" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((current) => [...current, emptyItem()])}
          >
            <Plus className="size-4" aria-hidden />
            Add a line
          </Button>

          <p className="text-sm">
            Total{" "}
            <span className="text-base font-semibold tabular-nums">
              {formatMoney(total, currency, { decimals: true })}
            </span>
          </p>
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        <Button
          type="submit"
          variant="outline"
          disabled={pending}
          onClick={() => setIntent("draft")}
        >
          {pending && intent === "draft" && (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          )}
          Save as draft
        </Button>
        <Button
          type="submit"
          disabled={pending}
          onClick={() => setIntent("submit")}
        >
          {pending && intent === "submit" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Submit for approval
        </Button>
      </div>
    </form>
  );
}

function ReceiptPicker({
  index,
  receiptName,
  onPick,
  onClear,
}: {
  index: number;
  receiptName: string;
  onPick: (dataUrl: string, name: string) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        aria-label={`Receipt for line ${index + 1}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;

          if (file.size > MAX_RECEIPT_BYTES) {
            setError("Over 2 MB — photograph it at a lower resolution.");
            event.target.value = "";
            return;
          }

          const reader = new FileReader();
          reader.onload = () => {
            setError(null);
            onPick(String(reader.result), file.name);
          };
          reader.readAsDataURL(file);
        }}
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => inputRef.current?.click()}
      >
        <Paperclip className="size-3.5" aria-hidden />
        {receiptName ? "Replace receipt" : "Attach receipt"}
      </Button>

      {receiptName && (
        <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
          {receiptName}
          <button
            type="button"
            onClick={() => {
              onClear();
              if (inputRef.current) inputRef.current.value = "";
            }}
            className="hover:text-destructive"
            aria-label={`Remove receipt from line ${index + 1}`}
          >
            <Trash2 className="size-3" aria-hidden />
          </button>
        </span>
      )}

      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </div>
  );
}
