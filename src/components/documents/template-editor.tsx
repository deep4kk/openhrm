"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteTemplateAction,
  draftTemplateAction,
  saveTemplateAction,
} from "@/lib/actions/documents";
import type { FormState } from "@/lib/actions/auth";
import {
  AUTOFILL_SOURCES,
  LETTER_KINDS,
  VARIABLE_TYPES,
  isSystemSource,
  type LetterVariable,
} from "@/lib/documents/types";
import { isAutomatic, reconcile } from "@/lib/documents/variables";
import { renderMarkdown } from "@/lib/documents/markdown";
import { FormError, FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The template editor.
 *
 * Three panels that have to stay in sync with one keystroke: the markdown body,
 * the live preview, and the variable list. The body is authoritative — typing
 * `{{noticePeriod}}` into a paragraph makes a Notice period variable appear
 * below, and deleting the paragraph takes it away again. Nobody maintains a
 * separate list of fields, because a list that can disagree with the letter
 * eventually will.
 */

export interface TemplateEditorValues {
  id?: string;
  name: string;
  kind: string;
  description: string;
  subject: string;
  body: string;
  aiBrief: string;
  isActive: boolean;
  variables: LetterVariable[];
}

export function TemplateEditor({
  values,
  aiEnabled,
  issuedCount,
}: {
  values: TemplateEditorValues;
  aiEnabled: boolean;
  issuedCount: number;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveTemplateAction,
    {},
  );

  const [subject, setSubject] = useState(values.subject);
  const [body, setBody] = useState(values.body);
  const [name, setName] = useState(values.name);
  const [kind, setKind] = useState(values.kind);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // User-edited definitions, keyed by token. The rendered list is always
  // derived from the body — this map only supplies the meaning.
  const [overrides, setOverrides] = useState<Map<string, LetterVariable>>(
    () => new Map(values.variables.map((v) => [v.key, v])),
  );

  const variables = useMemo(
    () => reconcile(body, subject, [...overrides.values()]),
    [body, subject, overrides],
  );

  useEffect(() => {
    if (state.success) {
      toast.success(values.id ? "Template saved" : "Template created");
      if (!values.id) router.push("/documents/templates");
    }
  }, [state.success, values.id, router]);

  const updateVariable = (key: string, patch: Partial<LetterVariable>) => {
    setOverrides((previous) => {
      const next = new Map(previous);
      const current = next.get(key) ?? variables.find((v) => v.key === key);
      if (current) next.set(key, { ...current, ...patch });
      return next;
    });
  };

  const insertToken = (token: string) => {
    const field = bodyRef.current;
    if (!field) return;

    const start = field.selectionStart;
    const end = field.selectionEnd;
    const snippet = `{{${token}}}`;
    const next = body.slice(0, start) + snippet + body.slice(end);
    setBody(next);

    // Put the caret after what was just inserted rather than at the end of the
    // document — an author inserting three tokens into a sentence should not
    // have to scroll back each time.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const applyDraft = (draft: {
    name: string;
    kind: string;
    subject: string;
    body: string;
    variables: LetterVariable[];
  }) => {
    // An untitled template takes the drafted name; one the user has already
    // named keeps it, because they meant that name.
    if (!name.trim()) setName(draft.name);
    setKind(draft.kind);
    setSubject(draft.subject);
    setBody(draft.body);
    setOverrides(new Map(draft.variables.map((v) => [v.key, v])));
  };

  return (
    <form action={formAction} className="space-y-6">
      {values.id && <input type="hidden" name="id" value={values.id} />}
      <input type="hidden" name="variables" value={JSON.stringify(variables)} />

      <FormError message={state.error} />

      {aiEnabled && <AiPanel onDraft={applyDraft} currentBody={body} />}

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Template name" name="name" error={state.fieldErrors?.name} required>
          {(p) => (
            <Input
              {...p}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Offer letter — India"
            />
          )}
        </FormField>

        <FormField
          label="Document type"
          name="kind"
          error={state.fieldErrors?.kind}
          hint="Sets the reference-number prefix, e.g. OL/2026/0001."
          required
        >
          {(p) => (
            <select
              {...p}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
            >
              {LETTER_KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        <FormField
          label="Description"
          name="description"
          error={state.fieldErrors?.description}
          hint="Shown on the template list, to help whoever picks it."
          className="sm:col-span-2"
        >
          {(p) => (
            <Input
              {...p}
              defaultValue={values.description}
              placeholder="For candidates joining the engineering team"
            />
          )}
        </FormField>

        <FormField
          label="Subject line"
          name="subject"
          error={state.fieldErrors?.subject}
          hint="Becomes the document title and the email subject. Tokens work here too."
          className="sm:col-span-2"
          required
        >
          {(p) => (
            <Input
              {...p}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Offer of employment — {{employeeName}}"
            />
          )}
        </FormField>
      </div>

      <BodyEditor
        body={body}
        onBodyChange={setBody}
        bodyRef={bodyRef}
        error={state.fieldErrors?.body}
        onInsert={insertToken}
        variables={variables}
      />

      <VariablePanel variables={variables} onChange={updateVariable} />

      <div className="flex items-center gap-2.5">
        <Checkbox
          id="isActive"
          name="isActive"
          defaultChecked={values.isActive}
          value="on"
        />
        <Label htmlFor="isActive" className="font-normal">
          Active — available when generating a document
        </Label>
      </div>

      <div className="flex items-center justify-between gap-3 border-t pt-5">
        {values.id ? (
          <DeleteTemplateButton id={values.id} name={values.name} issuedCount={issuedCount} />
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : values.id ? "Save changes" : "Create template"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// AI drafting
// ---------------------------------------------------------------------------

function AiPanel({
  onDraft,
  currentBody,
}: {
  onDraft: (draft: {
    name: string;
    kind: string;
    subject: string;
    body: string;
    variables: LetterVariable[];
  }) => void;
  currentBody: string;
}) {
  const [brief, setBrief] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasBody = currentBody.trim().length > 0;

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await draftTemplateAction(brief, hasBody ? currentBody : undefined);
      if (!result.ok || !result.draft) {
        setError(result.error ?? "Could not draft the template.");
        return;
      }
      onDraft(result.draft);
      toast.success(hasBody ? "Template revised" : "Template drafted");
    });
  };

  return (
    <section className="surface space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="text-muted-foreground size-4" aria-hidden />
        <h2 className="text-sm font-semibold">
          {hasBody ? "Revise with AI" : "Draft with AI"}
        </h2>
      </div>

      <p className="text-muted-foreground text-xs">
        {hasBody
          ? "Describe what to change and the body below is rewritten. Your edits are replaced, so save first if you want to keep them."
          : "Describe the letter you need. Placeholders are added for anything that changes per person, and wired to the employee record where they can be."}
      </p>

      <Textarea
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        rows={3}
        placeholder={
          hasBody
            ? "Add a clause about the probation period, and soften the closing paragraph."
            : "A relieving letter confirming the person has served their notice period, with their designation, joining date and last working day."
        }
        aria-label="Describe the letter"
      />

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={run}
        disabled={pending || brief.trim().length < 10}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Writing…
          </>
        ) : (
          <>
            <Sparkles className="size-4" aria-hidden />
            {hasBody ? "Revise" : "Draft it"}
          </>
        )}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Body + preview
// ---------------------------------------------------------------------------

function BodyEditor({
  body,
  onBodyChange,
  bodyRef,
  error,
  onInsert,
  variables,
}: {
  body: string;
  onBodyChange: (value: string) => void;
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  error?: string;
  onInsert: (token: string) => void;
  variables: LetterVariable[];
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");

  // The preview shows the variable's label in place of its token, so the author
  // reads a letter rather than a mail-merge file — but bracketed, so nobody
  // mistakes the preview for a finished document.
  const previewHtml = useMemo(() => {
    let text = body;
    for (const variable of variables) {
      text = text.replaceAll(`{{${variable.key}}}`, `[${variable.label}]`);
    }
    return renderMarkdown(text);
  }, [body, variables]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor="template-body">
          Letter body
          <span className="text-destructive ml-1" aria-hidden>
            *
          </span>
        </Label>

        <div className="bg-muted flex rounded-lg p-0.5">
          {(["write", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                tab === value
                  ? "bg-background shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </div>

      {tab === "write" ? (
        <>
          <Textarea
            id="template-body"
            name="body"
            ref={bodyRef}
            value={body}
            onChange={(e) => onBodyChange(e.target.value)}
            rows={20}
            aria-invalid={Boolean(error)}
            className="font-mono text-[13px] leading-relaxed"
            placeholder={"## Offer of employment\n\nDear {{employeeName}},\n\nWe are pleased to offer you the position of {{designation}}…"}
          />
          <p className="text-muted-foreground text-xs">
            Markdown: <code className="bg-muted rounded px-1">##</code> heading,{" "}
            <code className="bg-muted rounded px-1">**bold**</code>,{" "}
            <code className="bg-muted rounded px-1">-</code> bullet,{" "}
            <code className="bg-muted rounded px-1">| a | b |</code> table. Anything in{" "}
            <code className="bg-muted rounded px-1">{"{{braces}}"}</code> becomes a field to
            fill in.
          </p>
          <InsertTokenBar onInsert={onInsert} />
        </>
      ) : (
        <>
          {/* The body is a controlled textarea that is unmounted on this tab, so
              its value has to reach the server some other way. */}
          <input type="hidden" name="body" value={body} />
          <div className="surface max-h-[520px] overflow-y-auto p-6">
            {body.trim() ? (
              <div
                className="prose-letter"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing to preview yet.
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

/** Click-to-insert for the fields the system can fill in by itself. */
function InsertTokenBar({ onInsert }: { onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);

  const groups = useMemo(() => {
    const map = new Map<string, typeof AUTOFILL_SOURCES>();
    for (const source of AUTOFILL_SOURCES) {
      if (isSystemSource(source.key)) continue;
      const list = map.get(source.group) ?? [];
      list.push(source);
      map.set(source.group, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Plus className="size-4" aria-hidden />
        Insert a field from the employee record
      </Button>

      {open && (
        <div className="surface space-y-3 p-3">
          <p className="text-muted-foreground text-xs">
            These fill in automatically when you pick an employee. Type any other{" "}
            <code className="bg-muted rounded px-1">{"{{name}}"}</code> to add a field
            people type in.
          </p>
          {groups.map(([group, sources]) => (
            <div key={group}>
              <p className="text-muted-foreground mb-1.5 text-xs font-medium">{group}</p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((source) => (
                  <button
                    key={source.key}
                    type="button"
                    onClick={() => onInsert(source.key)}
                    title={source.description ?? source.label}
                    className="border-border hover:bg-muted rounded-md border px-2 py-1 font-mono text-[11px] transition-colors"
                  >
                    {source.label}
                    {source.sensitive && (
                      <span className="text-muted-foreground ml-1" aria-label="salary data">
                        ₹
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Variables
// ---------------------------------------------------------------------------

function VariablePanel({
  variables,
  onChange,
}: {
  variables: LetterVariable[];
  onChange: (key: string, patch: Partial<LetterVariable>) => void;
}) {
  if (variables.length === 0) {
    return (
      <section className="surface p-4">
        <h2 className="text-sm font-semibold">Variables</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          None yet. Anything you write in{" "}
          <code className="bg-muted rounded px-1">{"{{double braces}}"}</code> shows up here
          as a field to fill in.
        </p>
      </section>
    );
  }

  return (
    <section className="surface space-y-3 p-4">
      <div>
        <h2 className="text-sm font-semibold">
          Variables
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">
            {variables.length}
          </span>
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Taken from the body. The label is what the person generating the document
          sees; the source is where the value comes from automatically.
        </p>
      </div>

      <div className="space-y-2">
        {variables.map((variable) =>
          isAutomatic(variable) ? (
            // Resolved from the organisation's own settings, so there is nothing
            // here to configure — only to explain.
            <div
              key={variable.key}
              className="border-border bg-muted/30 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border p-2.5"
            >
              <code className="text-muted-foreground font-mono text-xs">
                {`{{${variable.key}}}`}
              </code>
              <span className="text-muted-foreground text-xs">
                Filled in from Settings → Letterhead. Never asked for.
              </span>
            </div>
          ) : (
          <div
            key={variable.key}
            className="border-border grid items-center gap-2 rounded-lg border p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_120px_auto]"
          >
            <code className="text-muted-foreground truncate font-mono text-xs">
              {`{{${variable.key}}}`}
            </code>

            <Input
              value={variable.label}
              onChange={(e) => onChange(variable.key, { label: e.target.value })}
              aria-label={`Label for ${variable.key}`}
              className="h-8 text-sm"
            />

            <select
              value={variable.type}
              onChange={(e) =>
                onChange(variable.key, {
                  type: e.target.value as LetterVariable["type"],
                })
              }
              aria-label={`Type for ${variable.key}`}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2 text-sm outline-none focus-visible:ring-3"
            >
              {VARIABLE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>

            <div className="flex items-center gap-3 justify-self-end">
              {variable.source ? (
                <Badge variant="secondary" className="whitespace-nowrap">
                  auto
                </Badge>
              ) : (
                <span className="text-muted-foreground text-xs">typed</span>
              )}
              <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <Checkbox
                  checked={variable.required}
                  onCheckedChange={(checked) =>
                    onChange(variable.key, { required: checked === true })
                  }
                  aria-label={`Require ${variable.label}`}
                />
                Required
              </label>
            </div>
          </div>
          ),
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

function DeleteTemplateButton({
  id,
  name,
  issuedCount,
}: {
  id: string;
  name: string;
  issuedCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The action refuses this too — the check here is only so the user is told
  // before they commit to it rather than after.
  const blocked = issuedCount > 0;

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (blocked) {
          toast.error(
            `"${name}" has issued ${issuedCount} letter${issuedCount === 1 ? "" : "s"}. Deactivate it instead.`,
          );
          return;
        }
        if (!confirm(`Delete the "${name}" template? This cannot be undone.`)) return;

        startTransition(async () => {
          const result = await deleteTemplateAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Template deleted");
          router.push("/documents/templates");
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
    </Button>
  );
}
