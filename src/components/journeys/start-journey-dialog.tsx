"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Loader2, Rocket } from "lucide-react";

import { startJourneyAction } from "@/lib/actions/journeys";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface JourneyCandidate {
  id: string;
  name: string;
  detail: string;
  /** Join date for onboarding, exit date for offboarding. ISO yyyy-mm-dd. */
  anchorDate: string | null;
}

export interface JourneyTemplateOption {
  id: string;
  name: string;
  kind: "ONBOARDING" | "OFFBOARDING";
  taskCount: number;
}

/**
 * Starting a checklist.
 *
 * Picking a person prefills the anchor date from their record — join date for
 * onboarding, last working day for an exit — because that is the date the
 * checklist is actually pinned to, and retyping a date the system already knows
 * is how it ends up wrong.
 */
export function StartJourneyDialog({
  candidates,
  templates,
}: {
  candidates: JourneyCandidate[];
  templates: JourneyTemplateOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    startJourneyAction,
    {},
  );

  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [anchorDate, setAnchorDate] = useState("");

  const template = templates.find((t) => t.id === templateId);
  const person = useMemo(
    () => candidates.find((c) => c.id === employeeId),
    [candidates, employeeId],
  );

  useEffect(() => {
    if (person?.anchorDate) setAnchorDate(person.anchorDate);
  }, [person]);

  const disabled = templates.length === 0 || candidates.length === 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />} disabled={disabled}>
        <Rocket className="size-4" aria-hidden />
        Start a checklist
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Start a checklist</DialogTitle>
          <DialogDescription>
            Tasks are copied from the template and dated from the anchor. Editing
            the template later won&apos;t change this one.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />

          <FormField
            label="Checklist"
            name="templateId"
            error={state.fieldErrors?.templateId}
            required
            hint={template ? `${template.taskCount} tasks` : undefined}
          >
            {(p) => (
              <select
                {...p}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.kind === "ONBOARDING" ? "onboarding" : "exit"})
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label="For"
            name="employeeId"
            error={state.fieldErrors?.employeeId}
            required
          >
            {(p) => (
              <select
                {...p}
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
              >
                <option value="">Choose someone…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.detail}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label="Anchor date"
            name="anchorDate"
            error={state.fieldErrors?.anchorDate}
            required
            hint={
              template?.kind === "OFFBOARDING"
                ? "Last working day. Task dates are offsets from this."
                : "Day one. Task dates are offsets from this."
            }
          >
            {(p) => (
              <Input
                {...p}
                type="date"
                value={anchorDate}
                onChange={(e) => setAnchorDate(e.target.value)}
              />
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
              Start
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
