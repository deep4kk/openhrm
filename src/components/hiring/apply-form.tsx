"use client";

import { useActionState, useRef, useState } from "react";
import { CheckCircle2, Loader2, Paperclip, Send } from "lucide-react";

import { applyToJobAction } from "@/lib/actions/hiring";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * The public application form.
 *
 * Short on purpose. Every field beyond name, email and resume measurably costs
 * applications, so the rest is optional and says so — and there is no account
 * to create, which is the single biggest drop-off in most careers funnels.
 *
 * On success the whole form is replaced by a confirmation rather than a toast.
 * A candidate who has just applied needs to *see* that it worked; a message
 * that fades after four seconds is not that.
 */
export function ApplyForm({
  jobId,
  jobTitle,
  className,
}: {
  jobId: string;
  jobTitle: string;
  className?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    applyToJobAction,
    {},
  );
  const [resume, setResume] = useState<{ url: string; name: string } | null>(
    null,
  );
  const [fileError, setFileError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (state.success) {
    return (
      <div
        className={cn(
          "border-success/30 bg-success-subtle rounded-lg border p-6 text-center",
          className,
        )}
      >
        <CheckCircle2 className="text-success mx-auto size-8" aria-hidden />
        <p className="mt-3 font-medium">Application received</p>
        <p className="text-muted-foreground measure mx-auto mt-1.5 text-sm">
          Thank you for applying for {jobTitle}. Someone will read it and get
          back to you — you will hear from us either way.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className={cn("space-y-5", className)}>
      <FormError message={state.error} />
      <input type="hidden" name="jobId" value={jobId} />
      <input type="hidden" name="resumeUrl" value={resume?.url ?? ""} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="First name"
          name="firstName"
          error={state.fieldErrors?.firstName}
          required
        >
          {(p) => <Input {...p} autoComplete="given-name" maxLength={80} />}
        </FormField>

        <FormField label="Last name" name="lastName">
          {(p) => <Input {...p} autoComplete="family-name" maxLength={80} />}
        </FormField>

        <FormField
          label="Email"
          name="email"
          error={state.fieldErrors?.email}
          required
        >
          {(p) => <Input {...p} type="email" autoComplete="email" />}
        </FormField>

        <FormField label="Phone" name="phone">
          {(p) => <Input {...p} type="tel" autoComplete="tel" maxLength={40} />}
        </FormField>
      </div>

      <div className="space-y-2">
        <label htmlFor="apply-resume" className="text-sm font-medium">
          Resume
        </label>
        <input
          ref={fileRef}
          id="apply-resume"
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,application/pdf,text/*"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) return;

            if (file.size > 4 * 1024 * 1024) {
              setFileError("That file is over 4 MB. Try a smaller PDF.");
              event.target.value = "";
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              setFileError(null);
              setResume({ url: String(reader.result), name: file.name });
            };
            reader.readAsDataURL(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => fileRef.current?.click()}
        >
          <Paperclip className="size-4" aria-hidden />
          {resume ? resume.name : "Attach your resume (PDF, up to 4 MB)"}
        </Button>
        {(fileError || state.fieldErrors?.resumeUrl) && (
          <p role="alert" className="text-destructive text-xs">
            {fileError ?? state.fieldErrors?.resumeUrl}
          </p>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="Current employer" name="currentCompany">
          {(p) => <Input {...p} maxLength={120} />}
        </FormField>

        <FormField label="Expected salary" name="expectedCtc">
          {(p) => <Input {...p} type="number" min={0} className="tabular-nums" />}
        </FormField>

        <FormField label="Notice period (days)" name="noticePeriodDays">
          {(p) => (
            <Input {...p} type="number" min={0} max={365} className="tabular-nums" />
          )}
        </FormField>
      </div>

      <FormField
        label="Anything you'd like us to know"
        name="coverNote"
        hint="Optional. A few lines about why this role beats a generic cover letter."
      >
        {(p) => <Textarea {...p} rows={5} maxLength={3000} />}
      </FormField>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Send application
        </Button>
      </div>
    </form>
  );
}
