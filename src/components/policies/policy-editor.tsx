"use client";

import { useActionState, useState } from "react";
import { Loader2, Save, Send } from "lucide-react";

import { savePolicyAction } from "@/lib/actions/policies";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Writing a policy.
 *
 * The one decision that matters is at the bottom: is this edit material? Saying
 * yes bumps the version and asks everyone to re-read; saying no leaves existing
 * acknowledgements standing. The consequence is spelled out beside the checkbox
 * rather than left to the author to infer, because the wrong answer is invisible
 * until an audit.
 */
export function PolicyEditor({
  policy,
}: {
  policy?: {
    id: string;
    title: string;
    category: string;
    summary: string;
    body: string;
    requiresAcknowledgement: boolean;
    effectiveFrom: string;
    isPublished: boolean;
    version: number;
    acknowledgementCount: number;
  };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    savePolicyAction,
    {},
  );
  const [intent, setIntent] = useState<"draft" | "publish">("publish");
  const [material, setMaterial] = useState(false);

  const editingPublished = policy?.isPublished ?? false;

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      {policy?.id && <input type="hidden" name="id" value={policy.id} />}
      <input type="hidden" name="intent" value={intent} />

      <div className="surface space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <FormField
            label="Title"
            name="title"
            error={state.fieldErrors?.title}
            required
          >
            {(p) => <Input {...p} defaultValue={policy?.title} maxLength={160} />}
          </FormField>

          <FormField
            label="Category"
            name="category"
            error={state.fieldErrors?.category}
            required
            hint="Groups it on the list — Leave, Conduct, Security."
          >
            {(p) => (
              <Input
                {...p}
                defaultValue={policy?.category ?? "General"}
                maxLength={60}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Summary"
          name="summary"
          hint="One line, shown on the list and in the notification."
        >
          {(p) => (
            <Textarea {...p} rows={2} defaultValue={policy?.summary} maxLength={300} />
          )}
        </FormField>

        <FormField label="Effective from" name="effectiveFrom">
          {(p) => <Input {...p} type="date" defaultValue={policy?.effectiveFrom} />}
        </FormField>
      </div>

      <FormField
        label="The policy"
        name="body"
        error={state.fieldErrors?.body}
        required
        hint="Markdown. Headings, lists, bold and tables all render."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={20}
            defaultValue={policy?.body}
            maxLength={60_000}
            className="font-mono text-xs leading-relaxed"
          />
        )}
      </FormField>

      <div className="surface space-y-4 p-5">
        <div className="flex items-start gap-3">
          <Checkbox
            id="requiresAcknowledgement"
            name="requiresAcknowledgement"
            defaultChecked={policy?.requiresAcknowledgement ?? true}
          />
          <Label htmlFor="requiresAcknowledgement" className="font-normal">
            Everyone must read and acknowledge it
            <span className="text-muted-foreground mt-0.5 block text-xs">
              Adds it to each person&apos;s outstanding list until they sign, and
              records the time and IP address when they do.
            </span>
          </Label>
        </div>

        {editingPublished && (
          <div className="border-warning/40 bg-warning-subtle flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              id="material"
              name="material"
              checked={material}
              onCheckedChange={(v) => setMaterial(v === true)}
            />
            <Label htmlFor="material" className="font-normal">
              This is a material change
              <span className="mt-0.5 block text-xs">
                {material ? (
                  <>
                    Publishes as <strong>version {policy!.version + 1}</strong>.
                    All {policy!.acknowledgementCount} existing acknowledgements
                    stop counting and everyone is asked to read it again.
                  </>
                ) : (
                  <>
                    Leave unticked for typos and formatting — version stays{" "}
                    {policy!.version} and existing acknowledgements stand.
                  </>
                )}
              </span>
            </Label>
          </div>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {!editingPublished && (
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            onClick={() => setIntent("draft")}
          >
            {pending && intent === "draft" ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Save draft
          </Button>
        )}
        <Button
          type="submit"
          disabled={pending}
          onClick={() => setIntent("publish")}
        >
          {pending && intent === "publish" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {editingPublished ? "Save changes" : "Publish"}
        </Button>
      </div>
    </form>
  );
}
