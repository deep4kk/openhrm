"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { createLoanAction } from "@/lib/actions/payroll";
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
import { formatMoney } from "@/lib/money";

export function NewLoanDialog({
  employees,
}: {
  employees: { value: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [principal, setPrincipal] = useState(50000);
  const [installments, setInstallments] = useState(10);
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    createLoanAction,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success("Advance issued");
      setOpen(false);
    }
  }, [state.success]);

  const now = new Date();
  // The instalment shown here is the same ceiling the server applies, so the
  // number in the dialog is the number that will be deducted.
  const perMonth =
    installments > 0 ? Math.ceil(principal / installments) : principal;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden />
        Issue advance
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <form action={formAction} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Issue a salary advance</DialogTitle>
            <DialogDescription>
              Payroll recovers one instalment each time a run is approved, until
              it is repaid.
            </DialogDescription>
          </DialogHeader>

          <FormError message={state.error} />

          <FormField
            label="Employee"
            name="employeeId"
            required
            error={state.fieldErrors?.employeeId}
          >
            {(props) => (
              <select
                {...props}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
              >
                <option value="">Choose someone</option>
                {employees.map((employee) => (
                  <option key={employee.value} value={employee.value}>
                    {employee.label}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label="Reason"
            name="reason"
            required
            error={state.fieldErrors?.reason}
          >
            {(props) => (
              <Input {...props} placeholder="Medical emergency, deposit, …" />
            )}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Amount"
              name="principal"
              required
              error={state.fieldErrors?.principal}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  step="1000"
                  value={principal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                />
              )}
            </FormField>

            <FormField
              label="Instalments"
              name="installmentsTotal"
              required
              error={state.fieldErrors?.installmentsTotal}
            >
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min="1"
                  max="60"
                  value={installments}
                  onChange={(e) => setInstallments(Number(e.target.value))}
                />
              )}
            </FormField>
          </div>

          <p className="text-muted-foreground text-xs">
            {formatMoney(perMonth)} will be deducted each month for{" "}
            {installments} month{installments === 1 ? "" : "s"}.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Recovery starts"
              name="startMonth"
              required
              error={state.fieldErrors?.startMonth}
            >
              {(props) => (
                <select
                  {...props}
                  defaultValue={String(now.getMonth() + 1)}
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
              name="startYear"
              required
              error={state.fieldErrors?.startYear}
            >
              {(props) => (
                <Input {...props} type="number" defaultValue={now.getFullYear()} />
              )}
            </FormField>
          </div>

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
              {pending ? "Issuing…" : "Issue advance"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
