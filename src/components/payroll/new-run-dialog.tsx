"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createPayrollRunAction } from "@/lib/actions/payroll";
import type { FormState } from "@/lib/actions/auth";
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
import { MONTHS } from "@/lib/locale";

/**
 * Starting a run.
 *
 * Defaults to the month that just ended, because that is what you are paying
 * for — offering "this month" as the default invites a run that is calculated
 * before half its attendance exists.
 */
export function NewPayrollRunDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createPayrollRunAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Payroll run started");
      setOpen(false);
    }
  }, [state.success]);

  const now = new Date();
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const defaultMonth = previous.getMonth() + 1;
  const defaultYear = previous.getFullYear();
  // Salaries usually land at the start of the following month.
  const defaultPayDate = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden />
        New run
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Start a payroll run</DialogTitle>
            <DialogDescription>
              This creates an empty run. Nothing is calculated and no payslip
              reaches anyone until you say so.
            </DialogDescription>
          </DialogHeader>

          <FormError message={state.error} />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Month"
              name="periodMonth"
              required
              error={state.fieldErrors?.periodMonth}
            >
              {(props) => (
                <select
                  {...props}
                  defaultValue={String(defaultMonth)}
                  className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
                >
                  {MONTHS.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField
              label="Year"
              name="periodYear"
              required
              error={state.fieldErrors?.periodYear}
            >
              {(props) => (
                <Input {...props} type="number" defaultValue={defaultYear} />
              )}
            </FormField>
          </div>

          <FormField
            label="Pay date"
            name="payDate"
            hint="When the money is expected to reach bank accounts."
            error={state.fieldErrors?.payDate}
          >
            {(props) => (
              <Input {...props} type="date" defaultValue={defaultPayDate} />
            )}
          </FormField>

          <FormField label="Note" name="note" error={state.fieldErrors?.note}>
            {(props) => (
              <Input {...props} placeholder="Optional — e.g. includes Diwali bonus" />
            )}
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
              {pending ? "Starting…" : "Start run"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
