"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Mail, Send } from "lucide-react";
import { toast } from "sonner";

import {
  createMailDraftAction,
  saveMailDraftAction,
  sendMailDraftAction,
} from "@/lib/actions/documents";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * The mail draft.
 *
 * Generating a letter composes a message; it does not send one. That gap is the
 * whole point of this panel — the covering note is prefilled but editable, the
 * addresses are visible, and nothing leaves the building until someone reads it
 * and presses Send. For a document class that includes offers and terminations,
 * an automatic send is a bug, not a convenience.
 */

export interface MailDraftView {
  id: string;
  to: string;
  cc: string | null;
  subject: string;
  body: string;
  status: "DRAFT" | "SENT" | "FAILED";
  sentAt: Date | null;
  error: string | null;
}

export function MailDraftPanel({
  letterId,
  draft,
  mailConfigured,
}: {
  letterId: string;
  draft: MailDraftView | null;
  mailConfigured: boolean;
}) {
  if (!draft) {
    return <NoDraft letterId={letterId} />;
  }

  if (draft.status === "SENT") {
    return (
      <section className="surface space-y-2 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-emerald-600 dark:text-emerald-500" aria-hidden />
          <h2 className="text-sm font-semibold">Email sent</h2>
        </div>
        <dl className="text-muted-foreground space-y-1 text-xs">
          <div className="flex gap-2">
            <dt className="w-14 shrink-0">To</dt>
            <dd className="text-foreground">{draft.to}</dd>
          </div>
          {draft.cc && (
            <div className="flex gap-2">
              <dt className="w-14 shrink-0">Cc</dt>
              <dd className="text-foreground">{draft.cc}</dd>
            </div>
          )}
          <div className="flex gap-2">
            <dt className="w-14 shrink-0">Subject</dt>
            <dd className="text-foreground">{draft.subject}</dd>
          </div>
        </dl>
        {!mailConfigured && (
          <p className="text-muted-foreground flex items-start gap-2 pt-1 text-xs">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            SMTP is not configured on this server, so this message was written to the
            server log rather than delivered.
          </p>
        )}
      </section>
    );
  }

  return <DraftEditor draft={draft} mailConfigured={mailConfigured} />;
}

function DraftEditor({
  draft,
  mailConfigured,
}: {
  draft: MailDraftView;
  mailConfigured: boolean;
}) {
  const [state, formAction, saving] = useActionState<FormState, FormData>(
    saveMailDraftAction,
    {},
  );
  const [sending, startSending] = useTransition();

  // A ref, not state: this is never rendered, only read when Send is pressed.
  // Keeping it out of state avoids a re-render on every keystroke, and lets the
  // post-save reset happen in an effect without triggering a cascading render.
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (state.success) {
      toast.success("Draft saved");
      dirtyRef.current = false;
    }
  }, [state.success]);

  const send = () => {
    if (
      dirtyRef.current &&
      !confirm("You have unsaved edits. Send the last saved version?")
    ) {
      return;
    }
    startSending(async () => {
      const result = await sendMailDraftAction(draft.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        mailConfigured ? "Email sent" : "Written to the server log — SMTP is not configured",
      );
    });
  };

  return (
    <section className="surface space-y-4 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="text-muted-foreground size-4" aria-hidden />
          <h2 className="text-sm font-semibold">Mail draft</h2>
        </div>
        {draft.status === "FAILED" ? (
          <Badge variant="destructive">Send failed</Badge>
        ) : (
          <Badge variant="outline">Not sent</Badge>
        )}
      </div>

      {draft.status === "FAILED" && draft.error && (
        <FormError message={`Last attempt failed: ${draft.error}`} />
      )}

      {!mailConfigured && (
        <p className="text-muted-foreground flex items-start gap-2 text-xs">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          SMTP is not configured on this server. Sending will print the message to the
          server log instead of delivering it — set{" "}
          <code className="bg-muted rounded px-1 font-mono">SMTP_HOST</code> in your
          environment to send for real.
        </p>
      )}

      <form
        action={formAction}
        className="space-y-4"
        onChange={() => {
          dirtyRef.current = true;
        }}
      >
        <input type="hidden" name="id" value={draft.id} />
        <FormError message={state.error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="To" name="to" error={state.fieldErrors?.to} required>
            {(p) => <Input {...p} type="email" defaultValue={draft.to} />}
          </FormField>

          <FormField
            label="Cc"
            name="cc"
            error={state.fieldErrors?.cc}
            hint="Comma-separated."
          >
            {(p) => <Input {...p} defaultValue={draft.cc ?? ""} />}
          </FormField>
        </div>

        <FormField
          label="Subject"
          name="subject"
          error={state.fieldErrors?.subject}
          required
        >
          {(p) => <Input {...p} defaultValue={draft.subject} />}
        </FormField>

        <FormField
          label="Covering note"
          name="body"
          error={state.fieldErrors?.body}
          hint="The letter itself is appended below this note, formatted, in the same email."
          required
        >
          {(p) => <Textarea {...p} defaultValue={draft.body} rows={8} />}
        </FormField>

        <div className="flex items-center justify-end gap-2 border-t pt-4">
          <Button type="submit" variant="outline" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button type="button" size="sm" onClick={send} disabled={sending || saving}>
            {sending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : (
              <>
                <Send className="size-4" aria-hidden />
                Send email
              </>
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function NoDraft({ letterId }: { letterId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <section className="surface flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
      <div>
        <h2 className="text-sm font-semibold">No mail draft</h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          This document was issued without a recipient address.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await createMailDraftAction(letterId);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Draft composed");
          })
        }
      >
        <Mail className="size-4" aria-hidden />
        {pending ? "Composing…" : "Compose an email"}
      </Button>
    </section>
  );
}
