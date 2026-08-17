"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { saveCandidateAction } from "@/lib/actions/hiring";
import { parseResume } from "@/lib/hiring/resume";
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

/**
 * Adding a candidate by hand, with light resume parsing.
 *
 * Parsing runs in the browser on the text it can read, and writes into the form
 * rather than into the database — every extracted field lands in an editable
 * input, visibly filled, so the recruiter corrects it before it becomes a
 * record. A parser that silently wrote a wrong surname would cost more than it
 * saved. Plain-text and markdown files are read directly; PDFs are stored but
 * only parsed when a text layer is available.
 */
export function AddCandidateDialog({
  jobId,
  jobTitle,
  owners,
}: {
  jobId: string;
  jobTitle: string;
  owners: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveCandidateAction,
    {},
  );
  const [parsed, setParsed] = useState<ReturnType<typeof parseResume> | null>(
    null,
  );
  const [resume, setResume] = useState<{ url: string; text: string } | null>(
    null,
  );
  const [parsing, setParsing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Candidate added");
      setOpen(false);
      setParsed(null);
      setResume(null);
      router.refresh();
    }
  }, [state.success, router]);

  async function handleFile(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      toast.error("That file is over 4 MB.");
      return;
    }

    setParsing(true);

    const dataUrl = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(file);
    });

    // Only text-ish files yield anything useful to parse. A PDF still gets
    // stored — the recruiter can read it — it just fills nothing in.
    let text = "";
    if (
      file.type.startsWith("text/") ||
      /\.(txt|md|markdown)$/i.test(file.name)
    ) {
      text = await file.text();
    }

    setResume({ url: dataUrl, text });
    setParsed(text ? parseResume(text) : null);
    setParsing(false);

    if (!text) {
      toast.info("Resume attached. Autofill only works on text files.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <UserPlus className="size-4" aria-hidden />
        Add candidate
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a candidate</DialogTitle>
          <DialogDescription>For {jobTitle}.</DialogDescription>
        </DialogHeader>

        <form
          action={action}
          className="max-h-[70vh] space-y-5 overflow-y-auto pr-1"
        >
          <FormError message={state.error} />
          <input type="hidden" name="jobPostingId" value={jobId} />
          <input type="hidden" name="resumeUrl" value={resume?.url ?? ""} />
          <input type="hidden" name="resumeText" value={resume?.text ?? ""} />

          <div className="bg-muted/40 flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.pdf,.doc,.docx,text/*,application/pdf"
              className="sr-only"
              aria-label="Resume file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={parsing}
              onClick={() => fileRef.current?.click()}
            >
              {parsing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="size-4" aria-hidden />
              )}
              {resume ? "Replace resume" : "Attach resume"}
            </Button>
            <p className="text-muted-foreground text-xs">
              {parsed
                ? "Filled in what we could read. Check it before saving."
                : "A text resume fills the fields below in. Everything stays editable."}
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="First name"
              name="firstName"
              error={state.fieldErrors?.firstName}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  key={`first-${parsed?.firstName ?? ""}`}
                  defaultValue={parsed?.firstName ?? ""}
                  maxLength={80}
                />
              )}
            </FormField>

            <FormField label="Last name" name="lastName">
              {(p) => (
                <Input
                  {...p}
                  key={`last-${parsed?.lastName ?? ""}`}
                  defaultValue={parsed?.lastName ?? ""}
                  maxLength={80}
                />
              )}
            </FormField>

            <FormField
              label="Email"
              name="email"
              error={state.fieldErrors?.email}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  key={`email-${parsed?.email ?? ""}`}
                  type="email"
                  defaultValue={parsed?.email ?? ""}
                />
              )}
            </FormField>

            <FormField label="Phone" name="phone">
              {(p) => (
                <Input
                  {...p}
                  key={`phone-${parsed?.phone ?? ""}`}
                  type="tel"
                  defaultValue={parsed?.phone ?? ""}
                />
              )}
            </FormField>

            <FormField label="Current company" name="currentCompany">
              {(p) => (
                <Input
                  {...p}
                  key={`co-${parsed?.currentCompany ?? ""}`}
                  defaultValue={parsed?.currentCompany ?? ""}
                  maxLength={120}
                />
              )}
            </FormField>

            <FormField label="Source" name="source">
              {(p) => (
                <select
                  {...p}
                  defaultValue="direct"
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="direct">Direct</option>
                  <option value="referral">Referral</option>
                  <option value="linkedin">LinkedIn</option>
                  <option value="agency">Agency</option>
                  <option value="careers-page">Careers page</option>
                </select>
              )}
            </FormField>

            <FormField label="Current CTC" name="currentCtc">
              {(p) => <Input {...p} type="number" min={0} className="tabular-nums" />}
            </FormField>

            <FormField label="Expected CTC" name="expectedCtc">
              {(p) => <Input {...p} type="number" min={0} className="tabular-nums" />}
            </FormField>

            <FormField label="Notice period (days)" name="noticePeriodDays">
              {(p) => <Input {...p} type="number" min={0} max={365} className="tabular-nums" />}
            </FormField>

            <FormField label="Owner" name="ownerId">
              {(p) => (
                <select
                  {...p}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="">The role&apos;s recruiter</option>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <FormField
            label="Skills"
            name="skills"
            hint="Comma separated. Pulled from the resume where possible."
          >
            {(p) => (
              <Input
                {...p}
                key={`skills-${parsed?.skills.join(",") ?? ""}`}
                defaultValue={parsed?.skills.join(", ") ?? ""}
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
              Add candidate
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
