"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { setSalaryAction } from "@/lib/actions/payroll";
import type { FormState } from "@/lib/actions/auth";
import { formatMoney } from "@/lib/money";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Compensation on the employee record.
 *
 * Shows the history, not just the current figure, because "what were they on in
 * March?" is the question that actually gets asked — during an appraisal,
 * during a settlement, and whenever a payslip is queried. Each row is a signed,
 * dated decision with the name of whoever made it.
 */

export interface SalaryRow {
  id: string;
  annualCtc: number;
  structureName: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  note: string | null;
  createdBy: string | null;
}

export function CompensationPanel({
  employeeId,
  currency,
  history,
  structures,
  canEdit,
}: {
  employeeId: string;
  currency: string;
  history: SalaryRow[];
  structures: { value: string; label: string }[];
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    setSalaryAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Compensation recorded");
      setOpen(false);
    }
  }, [state.success]);

  const current = history.find((row) => row.effectiveTo === null) ?? history[0];

  return (
    <div className="space-y-4">
      {current ? (
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-muted-foreground text-xs">Annual CTC</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">
              {formatMoney(current.annualCtc, currency)}
            </p>
            <p className="text-muted-foreground mt-1 text-xs">
              {current.structureName} · effective {current.effectiveFrom}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Monthly gross (approx.)</p>
            <p className="mt-1 text-sm tabular-nums">
              {formatMoney(current.annualCtc / 12, currency)}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              Payroll works out the exact figure — CTC includes employer
              contributions, so it isn&apos;t a straight twelfth.
            </p>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No salary structure assigned. This employee will be skipped by payroll
          until one is set.
        </p>
      )}

      {history.length > 1 && (
        <div className="border-t pt-4">
          <h3 className="text-muted-foreground mb-2.5 text-xs font-medium">
            History
          </h3>
          <ul className="space-y-2">
            {history.slice(1).map((row) => (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3 text-sm"
              >
                <span className="text-muted-foreground">
                  {row.effectiveFrom} – {row.effectiveTo ?? "present"}
                  {row.createdBy && ` · ${row.createdBy}`}
                </span>
                <span className="tabular-nums">
                  {formatMoney(row.annualCtc, currency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {canEdit && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="outline" size="sm" />}>
            <Pencil className="size-4" aria-hidden />
            {current ? "Revise compensation" : "Set compensation"}
          </DialogTrigger>

          <DialogContent className="sm:max-w-md">
            <form action={formAction} className="space-y-4">
              <DialogHeader>
                <DialogTitle>
                  {current ? "Revise compensation" : "Set compensation"}
                </DialogTitle>
                <DialogDescription>
                  This records a new dated figure. The previous one is closed
                  rather than overwritten, so old payslips stay explainable.
                </DialogDescription>
              </DialogHeader>

              <input type="hidden" name="employeeId" value={employeeId} />
              <FormError message={state.error} />

              <FormField
                label="Salary structure"
                name="structureId"
                required
                error={state.fieldErrors?.structureId}
              >
                {(props) => (
                  <select
                    {...props}
                    defaultValue={structures[0]?.value}
                    className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
                  >
                    {structures.map((structure) => (
                      <option key={structure.value} value={structure.value}>
                        {structure.label}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>

              <FormField
                label="Annual CTC"
                name="annualCtc"
                required
                error={state.fieldErrors?.annualCtc}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="number"
                    step="10000"
                    defaultValue={current?.annualCtc}
                  />
                )}
              </FormField>

              <FormField
                label="Effective from"
                name="effectiveFrom"
                required
                error={state.fieldErrors?.effectiveFrom}
              >
                {(props) => (
                  <Input
                    {...props}
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                  />
                )}
              </FormField>

              <FormField
                label="Note"
                name="note"
                hint="Why — an appraisal, a promotion, a correction."
                error={state.fieldErrors?.note}
              >
                {(props) => <Input {...props} />}
              </FormField>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
