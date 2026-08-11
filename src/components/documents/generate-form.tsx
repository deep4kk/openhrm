"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Loader2, Lock, UserRound, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { autofillAction, generateLetterAction } from "@/lib/actions/documents";
import type { FormState } from "@/lib/actions/auth";
import { renderMarkdown } from "@/lib/documents/markdown";
import { formatValue } from "@/lib/documents/render";
import { isSensitiveSource, type LetterVariable } from "@/lib/documents/types";
import { applyVariables } from "@/lib/documents/variables";
import { FormError, FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * Generating one letter for one person.
 *
 * The shape of the screen follows the shape of the decision: *who* is this for,
 * then *what goes in it*. Picking an employee pulls their details out of the
 * record — that is the step that makes this different from typing the letter in
 * a word processor — and everything it fills in stays editable, because a
 * back-dated experience letter may need the designation the person held then.
 */

export interface EmployeeOption {
  id: string;
  employeeCode: string;
  name: string;
  workEmail: string;
  designation: string | null;
  status: string;
}

export function GenerateForm({
  templateId,
  templateSubject,
  templateBody,
  variables,
  systemValues,
  employees,
  currency,
}: {
  templateId: string;
  templateSubject: string;
  templateBody: string;
  variables: LetterVariable[];
  /** Tokens the server resolves — {{org.name}} and friends — for the preview. */
  systemValues: Record<string, string>;
  employees: EmployeeOption[];
  currency: string;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    generateLetterAction,
    {},
  );

  const [employeeId, setEmployeeId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(variables.map((v) => [v.key, v.defaultValue ?? ""])),
  );
  const [withheld, setWithheld] = useState(false);
  const [filling, startFilling] = useTransition();
  const [showPreview, setShowPreview] = useState(false);

  const needsSalary = useMemo(
    () => variables.some((v) => v.source && isSensitiveSource(v.source)),
    [variables],
  );

  const onPickEmployee = (id: string) => {
    setEmployeeId(id);
    if (!id) {
      setWithheld(false);
      return;
    }

    startFilling(async () => {
      const result = await autofillAction(id);
      if (!result.ok) {
        toast.error(result.error ?? "Could not load that employee.");
        return;
      }

      const source = result.values ?? {};
      setValues((previous) => {
        const next = { ...previous };
        for (const variable of variables) {
          // Only variables wired to a source are touched. A free-text field the
          // user already typed into must survive picking a different employee.
          if (variable.source && source[variable.source] !== undefined) {
            next[variable.key] = source[variable.source];
          }
        }
        return next;
      });

      if (result.recipient) {
        setRecipientName(result.recipient.name);
        if (result.recipient.email) setRecipientEmail(result.recipient.email);
      }
      setWithheld(Boolean(result.compensationWithheld) && needsSalary);
      toast.success("Details filled in from the employee record");
    });
  };

  // An unfilled field shows as [Its label] rather than blank, so the author can
  // see at a glance what is still missing from the letter.
  const resolved = useMemo(() => {
    const formatted: Record<string, string> = { ...systemValues };
    for (const variable of variables) {
      formatted[variable.key] =
        formatValue(variable, values[variable.key] ?? "", currency) || `[${variable.label}]`;
    }
    return formatted;
  }, [variables, values, currency, systemValues]);

  const known = useMemo(
    () => new Set([...variables.map((v) => v.key), ...Object.keys(systemValues)]),
    [variables, systemValues],
  );

  const previewHtml = useMemo(
    () => (showPreview ? renderMarkdown(applyVariables(templateBody, resolved, known)) : ""),
    [showPreview, templateBody, resolved, known],
  );

  const previewTitle = useMemo(
    () => applyVariables(templateSubject, resolved, known),
    [templateSubject, resolved, known],
  );

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="templateId" value={templateId} />
      <FormError message={state.error} />

      {/* --- Who ---------------------------------------------------------- */}
      <section className="surface space-y-4 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <UserRound className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">Who is this for?</h2>
        </div>

        <FormField
          label="Employee"
          name="employeeId"
          hint="Picking someone fills in the details below from their record. Leave blank for a candidate or anyone not on the payroll."
        >
          {(p) => (
            <div className="flex items-center gap-2">
              <select
                {...p}
                value={employeeId}
                onChange={(e) => onPickEmployee(e.target.value)}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
              >
                <option value="">Not an employee — I&apos;ll type the details</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} · {employee.employeeCode}
                    {employee.designation ? ` · ${employee.designation}` : ""}
                    {employee.status === "EXITED" ? " · exited" : ""}
                  </option>
                ))}
              </select>
              {filling && (
                <Loader2
                  className="text-muted-foreground size-4 shrink-0 animate-spin"
                  aria-label="Loading details"
                />
              )}
            </div>
          )}
        </FormField>

        {withheld && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            This letter quotes salary figures, and your role cannot read compensation.
            Those fields are blank — type them in, or ask someone with payroll access to
            issue it.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Addressed to"
            name="recipientName"
            error={state.fieldErrors?.recipientName}
            hint="The name printed on the letter."
            required
          >
            {(p) => (
              <Input
                {...p}
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Priya Sharma"
              />
            )}
          </FormField>

          <FormField
            label="Email"
            name="recipientEmail"
            error={state.fieldErrors?.recipientEmail}
            hint="Optional. Given one, a mail draft is prepared for you to review and send."
          >
            {(p) => (
              <Input
                {...p}
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                placeholder="priya@example.com"
              />
            )}
          </FormField>
        </div>
      </section>

      {/* --- Details ------------------------------------------------------ */}
      {variables.length > 0 && (
        <section className="surface space-y-4 p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">Details</h2>
            {needsSalary && (
              <Badge variant="outline" className="text-xs">
                Includes salary figures
              </Badge>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {variables.map((variable) => (
              <VariableField
                key={variable.key}
                variable={variable}
                value={values[variable.key] ?? ""}
                error={state.fieldErrors?.[`var_${variable.key}`]}
                currency={currency}
                onChange={(value) =>
                  setValues((previous) => ({ ...previous, [variable.key]: value }))
                }
              />
            ))}
          </div>
        </section>
      )}

      {/* --- Preview ------------------------------------------------------ */}
      <section className="surface p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Preview</h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              The letterhead, reference number and signature are added when you generate.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
          >
            {showPreview ? "Hide" : "Show"}
          </Button>
        </div>

        {showPreview && (
          <div className="mt-4 border-t pt-4">
            <p className="mb-3 text-sm font-medium">{previewTitle}</p>
            <div
              className="prose-letter max-h-[520px] overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        )}
      </section>

      <div className="flex justify-end gap-3 border-t pt-5">
        <Button type="submit" disabled={pending || filling}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Generating…
            </>
          ) : (
            <>
              <Wand2 className="size-4" aria-hidden />
              Generate document
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function VariableField({
  variable,
  value,
  error,
  currency,
  onChange,
}: {
  variable: LetterVariable;
  value: string;
  error?: string;
  currency: string;
  onChange: (value: string) => void;
}) {
  const name = `var_${variable.key}`;
  const auto = Boolean(variable.source);

  const hint = [
    variable.helpText,
    auto ? "Filled in from the employee record — edit if this letter needs something else." : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <FormField
      label={variable.label}
      name={name}
      error={error}
      hint={hint || undefined}
      required={variable.required}
      className={variable.type === "longtext" ? "sm:col-span-2" : undefined}
    >
      {(p) => {
        if (variable.type === "longtext") {
          return (
            <Textarea
              {...p}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              rows={4}
              className={cn(variable.key.includes("breakdown") && "font-mono text-xs")}
            />
          );
        }

        if (variable.type === "money") {
          return (
            <div className="relative">
              <Input
                {...p}
                type="number"
                step="0.01"
                inputMode="decimal"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="pr-16"
              />
              <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs">
                {currency}
              </span>
            </div>
          );
        }

        return (
          <Input
            {...p}
            type={
              variable.type === "date"
                ? "date"
                : variable.type === "number"
                  ? "number"
                  : variable.type === "email"
                    ? "email"
                    : "text"
            }
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        );
      }}
    </FormField>
  );
}
