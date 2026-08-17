"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  Loader2,
  Lock,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteEmployeeDocumentAction,
  openEmployeeDocumentAction,
  uploadEmployeeDocumentAction,
} from "@/lib/actions/policies";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * The per-employee document vault (PRD §8.3).
 *
 * Two behaviours here are deliberate and worth keeping:
 *
 *  - Opening a document goes through a server action rather than being a plain
 *    link. The file is a `data:` URI on the row, so a link would work — but
 *    reading someone's passport scan is exactly the kind of access PRD §8.28
 *    wants logged, and a link logs nothing.
 *
 *  - Expiry is shown as a badge that turns critical before the date, not after.
 *    A visa that expired yesterday is a problem nobody can fix; one expiring in
 *    three weeks is a task.
 */

const CATEGORIES = [
  { value: "ID_PROOF", label: "ID proof" },
  { value: "CONTRACT", label: "Contract" },
  { value: "CERTIFICATE", label: "Certificate" },
  { value: "EDUCATION", label: "Education" },
  { value: "PAYROLL", label: "Payroll" },
  { value: "MEDICAL", label: "Medical" },
  { value: "OTHER", label: "Other" },
];

const MAX_BYTES = 4 * 1024 * 1024;

export interface VaultDocument {
  id: string;
  name: string;
  category: string;
  fileName: string;
  sizeBytes: number | null;
  issuedOn: string | null;
  expiresOn: string | null;
  /** Days until expiry; negative when already past. Null when it never expires. */
  daysToExpiry: number | null;
  isConfidential: boolean;
  uploadedBy: string | null;
  uploadedOn: string;
}

export function DocumentVault({
  employeeId,
  employeeName,
  documents,
  canManage,
}: {
  employeeId: string;
  employeeName: string;
  documents: VaultDocument[];
  canManage: boolean;
}) {
  return (
    <section className="surface p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            Documents
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {documents.length}
            </span>
          </h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            ID proofs, contracts and certificates. Every open is recorded in the
            audit log.
          </p>
        </div>
        {canManage && (
          <UploadDialog employeeId={employeeId} employeeName={employeeName} />
        )}
      </div>

      {documents.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Nothing on file yet.
        </p>
      ) : (
        <ul className="divide-y">
          {documents.map((document) => (
            <DocumentRow
              key={document.id}
              document={document}
              canManage={canManage}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function DocumentRow({
  document: doc,
  canManage,
}: {
  document: VaultDocument;
  canManage: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const expiry = expiryBadge(doc.daysToExpiry, doc.expiresOn);

  return (
    <li className="flex flex-wrap items-center gap-3 py-3 first:pt-0">
      <FileText className="text-muted-foreground size-4 shrink-0" aria-hidden />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await openEmployeeDocumentAction(doc.id);
                if (result.error || !result.url) {
                  toast.error(result.error ?? "Could not open that document.");
                  return;
                }
                window.open(result.url, "_blank", "noopener,noreferrer");
              })
            }
            className="text-sm font-medium hover:underline disabled:opacity-60"
          >
            {doc.name}
          </button>
          {doc.isConfidential && (
            <span
              className="text-muted-foreground inline-flex items-center gap-1 text-xs"
              title="Only visible to HR and the employee"
            >
              <Lock className="size-3" aria-hidden />
              Confidential
            </span>
          )}
          {expiry && <StatusBadge label={expiry.label} tone={expiry.tone} />}
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs">
          {CATEGORIES.find((c) => c.value === doc.category)?.label ?? doc.category}
          {" · "}
          {doc.fileName}
          {doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""}
          {doc.uploadedBy ? ` · added by ${doc.uploadedBy}` : ""}
        </p>
      </div>

      {canManage && (
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          aria-label={`Delete ${doc.name}`}
          onClick={() => {
            if (!confirm(`Delete "${doc.name}"? This cannot be undone.`)) return;
            startTransition(async () => {
              const result = await deleteEmployeeDocumentAction(doc.id);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              toast.success("Document deleted");
              router.refresh();
            });
          }}
        >
          {pending ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Trash2 />
          )}
        </Button>
      )}
    </li>
  );
}

function UploadDialog({
  employeeId,
  employeeName,
}: {
  employeeId: string;
  employeeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadEmployeeDocumentAction,
    {},
  );
  const [file, setFile] = useState<{
    url: string;
    name: string;
    size: number;
    type: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Document added");
      setOpen(false);
      setFile(null);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Upload className="size-4" aria-hidden />
        Add document
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a document</DialogTitle>
          <DialogDescription>
            Goes on {employeeName}&apos;s record. Files are stored in the database,
            so a database backup includes them — and they are capped at 4 MB.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          <input type="hidden" name="employeeId" value={employeeId} />
          <input type="hidden" name="fileUrl" value={file?.url ?? ""} />
          <input type="hidden" name="fileName" value={file?.name ?? ""} />
          <input type="hidden" name="mimeType" value={file?.type ?? ""} />
          <input type="hidden" name="sizeBytes" value={file?.size ?? ""} />

          <div className="space-y-2">
            <Label htmlFor="vault-file">File</Label>
            <input
              ref={inputRef}
              id="vault-file"
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              onChange={(event) => {
                const picked = event.target.files?.[0];
                if (!picked) return;

                if (picked.size > MAX_BYTES) {
                  setError("That file is over 4 MB.");
                  event.target.value = "";
                  return;
                }

                const reader = new FileReader();
                reader.onload = () => {
                  setError(null);
                  setFile({
                    url: String(reader.result),
                    name: picked.name,
                    size: picked.size,
                    type: picked.type,
                  });
                };
                reader.readAsDataURL(picked);
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              className="w-full justify-start"
            >
              <Paperclip className="size-4" aria-hidden />
              {file ? `${file.name} · ${formatBytes(file.size)}` : "Choose a file"}
            </Button>
            {(error || state.fieldErrors?.fileUrl) && (
              <p role="alert" className="text-destructive text-xs">
                {error ?? state.fieldErrors?.fileUrl}
              </p>
            )}
          </div>

          <FormField
            label="Name"
            name="name"
            error={state.fieldErrors?.name}
            required
            hint="What it is, in words — “Passport”, “Signed contract 2026”."
          >
            {(p) => <Input {...p} maxLength={160} />}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Category" name="category" required>
              {(p) => (
                <select
                  {...p}
                  defaultValue="ID_PROOF"
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Issued on" name="issuedOn">
              {(p) => <Input {...p} type="date" />}
            </FormField>
          </div>

          <FormField
            label="Expires on"
            name="expiresOn"
            hint="Visas and passports get a reminder before this date."
          >
            {(p) => <Input {...p} type="date" />}
          </FormField>

          <div className="flex items-start gap-3">
            <Checkbox id="isConfidential" name="isConfidential" />
            <Label htmlFor="isConfidential" className="font-normal">
              Confidential
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Hidden from reporting managers. Only HR and the employee see it.
              </span>
            </Label>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !file}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Add it
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function expiryBadge(
  days: number | null,
  expiresOn: string | null,
): { label: string; tone: "critical" | "warning" | "neutral" } | null {
  if (days === null || !expiresOn) return null;
  if (days < 0) return { label: `Expired ${expiresOn}`, tone: "critical" };
  if (days <= 30) return { label: `Expires in ${days} days`, tone: "critical" };
  if (days <= 90) return { label: `Expires ${expiresOn}`, tone: "warning" };
  return { label: `Valid to ${expiresOn}`, tone: "neutral" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
