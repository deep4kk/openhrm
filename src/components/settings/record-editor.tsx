"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * One editor for every list in Settings.
 *
 * Departments, locations, shifts, holidays and leave types are all the same
 * interaction wearing different fields: a list you can add to, edit a row of,
 * and delete from. Writing that five times would mean five chances to forget
 * the error region, the loading state, or the delete confirmation. So the
 * screens declare *what* their fields are and this component owns *how* editing
 * behaves.
 *
 * The server actions are passed in as props. That works because a server action
 * crosses the boundary as a reference, not as code — and it keeps every
 * permission check where it belongs, on the server, in the action itself.
 */

export interface EditorOption {
  value: string;
  label: string;
}

interface FieldBase {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** Fields default to half width; `full` spans the dialog. */
  width?: "half" | "full";
}

export type EditorField = FieldBase &
  (
    | { type: "text" | "number" | "date" | "time"; step?: string; placeholder?: string }
    | { type: "select"; options: EditorOption[]; placeholder?: string }
    | { type: "checkbox" }
    | { type: "textarea" }
  );

export interface EditorRecord {
  id: string;
  title: string;
  /** Second line under the title — the details that identify the row. */
  subtitle?: string;
  badges?: { label: string; tone?: "neutral" | "info" | "positive" | "warning" }[];
  /** Current values, keyed by field name. Strings for inputs, booleans for checkboxes. */
  values: Record<string, string | boolean | undefined>;
}

export function RecordEditor({
  records,
  fields,
  saveAction,
  deleteAction,
  noun,
  addLabel,
  emptyMessage,
  canManage,
  className,
}: {
  records: EditorRecord[];
  fields: EditorField[];
  saveAction: (prev: FormState, formData: FormData) => Promise<FormState>;
  deleteAction?: (id: string) => Promise<FormState>;
  /** Singular, lower case — used in dialog titles and confirmations. */
  noun: string;
  addLabel: string;
  emptyMessage: string;
  canManage: boolean;
  className?: string;
}) {
  // `"new"` and a record are different modes of the same dialog.
  const [editing, setEditing] = useState<EditorRecord | "new" | null>(null);
  const [deleting, setDeleting] = useState<EditorRecord | null>(null);

  return (
    <div className={cn("space-y-4", className)}>
      {records.length === 0 ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {emptyMessage}
        </p>
      ) : (
        <ul className="divide-y">
          {records.map((record) => (
            <li
              key={record.id}
              className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{record.title}</p>
                  {record.badges?.map((badge) => (
                    <StatusBadge
                      key={badge.label}
                      label={badge.label}
                      tone={badge.tone ?? "neutral"}
                    />
                  ))}
                </div>
                {record.subtitle && (
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {record.subtitle}
                  </p>
                )}
              </div>

              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setEditing(record)}
                    aria-label={`Edit ${record.title}`}
                  >
                    <Pencil />
                  </Button>
                  {deleteAction && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setDeleting(record)}
                      aria-label={`Delete ${record.title}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus />
          {addLabel}
        </Button>
      )}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      >
        <DialogContent className="sm:max-w-lg">
          {editing !== null && (
            // Keyed so switching rows resets the form and its action state
            // instead of showing the previous row's values or errors.
            <RecordForm
              key={editing === "new" ? "new" : editing.id}
              record={editing === "new" ? null : editing}
              fields={fields}
              action={saveAction}
              noun={noun}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {deleteAction && (
        <DeleteConfirmation
          record={deleting}
          noun={noun}
          action={deleteAction}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function RecordForm({
  record,
  fields,
  action,
  noun,
  onDone,
}: {
  record: EditorRecord | null;
  fields: EditorField[];
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  noun: string;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success(record ? "Changes saved" : `${capitalise(noun)} added`);
      onDone();
    }
    // `onDone` closes the dialog, which unmounts this form — so this must not
    // re-run on identity changes of the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-4">
      <DialogHeader>
        <DialogTitle>
          {record ? `Edit ${noun}` : `Add ${noun}`}
        </DialogTitle>
        <DialogDescription>
          {record
            ? `Changes apply everywhere this ${noun} is used.`
            : `This becomes available across the app as soon as you save.`}
        </DialogDescription>
      </DialogHeader>

      {record && <input type="hidden" name="id" value={record.id} />}

      <FormError message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((field) => (
          <FieldControl
            key={field.name}
            field={field}
            value={record?.values[field.name]}
            error={state.fieldErrors?.[field.name]}
          />
        ))}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : record ? "Save changes" : `Add ${noun}`}
        </Button>
      </DialogFooter>
    </form>
  );
}

function FieldControl({
  field,
  value,
  error,
}: {
  field: EditorField;
  value: string | boolean | undefined;
  error?: string;
}) {
  const span = field.width === "full" ? "sm:col-span-2" : undefined;

  // A checkbox carries its own label, so it sits outside FormField's layout.
  if (field.type === "checkbox") {
    return (
      <div className={cn("flex items-start gap-2.5 sm:col-span-2", span)}>
        <Checkbox
          id={`field-${field.name}`}
          name={field.name}
          defaultChecked={value === true}
          className="mt-0.5"
        />
        <div>
          <Label htmlFor={`field-${field.name}`} className="font-normal">
            {field.label}
          </Label>
          {field.hint && (
            <p className="text-muted-foreground mt-0.5 text-xs">{field.hint}</p>
          )}
        </div>
      </div>
    );
  }

  const defaultValue = typeof value === "string" ? value : undefined;

  return (
    <FormField
      label={field.label}
      name={field.name}
      hint={field.hint}
      error={error}
      required={field.required}
      className={span}
    >
      {(props) => {
        if (field.type === "select") {
          return (
            <select
              {...props}
              defaultValue={defaultValue ?? ""}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
            >
              <option value="">{field.placeholder ?? "—"}</option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );
        }

        if (field.type === "textarea") {
          return <Textarea {...props} defaultValue={defaultValue} rows={2} />;
        }

        return (
          <Input
            {...props}
            type={field.type}
            step={field.step}
            placeholder={field.placeholder}
            defaultValue={defaultValue}
          />
        );
      }}
    </FormField>
  );
}

/**
 * Deleting configuration is not the same as deleting a row in a spreadsheet —
 * an employee's department is a foreign key pointing here. The server refuses
 * when anything still references the record and explains what; this surfaces
 * that answer rather than a generic failure toast.
 */
function DeleteConfirmation({
  record,
  noun,
  action,
  onClose,
}: {
  record: EditorRecord | null;
  noun: string;
  action: (id: string) => Promise<FormState>;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<string | null>(null);

  function confirm() {
    if (!record) return;
    startTransition(async () => {
      const result = await action(record.id);
      if (result.error) {
        setRefusal(result.error);
        return;
      }
      toast.success(`${capitalise(noun)} deleted`);
      close();
    });
  }

  function close() {
    setRefusal(null);
    onClose();
  }

  return (
    <AlertDialog
      open={record !== null}
      onOpenChange={(open) => !open && close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {refusal ? `Can't delete this ${noun}` : `Delete ${record?.title}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {refusal ??
              `This removes the ${noun} from the organisation. It can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>
            {refusal ? "Close" : "Cancel"}
          </AlertDialogCancel>
          {!refusal && (
            <AlertDialogAction
              variant="destructive"
              onClick={confirm}
              disabled={pending}
            >
              {pending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
