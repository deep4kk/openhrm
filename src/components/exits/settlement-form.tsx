"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  computeSettlementAction,
  setSettlementStatusAction,
} from "@/lib/actions/exits";
import type { FormState } from "@/lib/actions/auth";
import { formatMoney } from "@/lib/money";
import { FormError } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * The full and final settlement.
 *
 * Every figure is prefilled from the employee's own record — leave balances,
 * outstanding loans, approved-but-unpaid claims, notice shortfall — and every
 * figure is editable, with the working shown beside it. A settlement that
 * arrives as a single number nobody can reconstruct is one the leaver will
 * dispute, and rightly.
 *
 * The gratuity line is explicitly labelled an estimate: the Indian formula
 * needs a basic-wage figure this app derives from the default structure, and
 * an org with a different structure needs to check it.
 */

export interface SettlementInputs {
  encashableDays: number;
  leaveEncashmentAmount: number;
  gratuityEligible: boolean;
  gratuityAmount: number;
  servedYears: number;
  monthlyGross: number;
  perDay: number;
  outstandingLoans: number;
  pendingReimbursements: number;
  shortfallDays: number;
  noticePayRecovery: number;
  unreturnedAssets: { name: string; tag: string }[];
}

export interface ExistingSettlement {
  status: string;
  leaveEncashmentDays: number;
  leaveEncashmentAmount: number;
  gratuityAmount: number;
  pendingSalary: number;
  pendingReimbursements: number;
  loanRecovery: number;
  noticePayRecovery: number;
  otherDeductions: number;
  netPayable: number;
  note: string | null;
  approvedByName: string | null;
}

export function SettlementForm({
  resignationId,
  inputs,
  existing,
  currency,
}: {
  resignationId: string;
  inputs: SettlementInputs;
  existing: ExistingSettlement | null;
  currency: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    computeSettlementAction,
    {},
  );
  const router = useRouter();

  const seeded = existing && existing.status !== "PENDING";

  const [values, setValues] = useState({
    leaveEncashmentDays: String(
      seeded ? existing.leaveEncashmentDays : inputs.encashableDays,
    ),
    leaveEncashmentAmount: String(
      seeded ? existing.leaveEncashmentAmount : inputs.leaveEncashmentAmount,
    ),
    gratuityAmount: String(seeded ? existing.gratuityAmount : inputs.gratuityAmount),
    pendingSalary: String(seeded ? existing.pendingSalary : 0),
    pendingReimbursements: String(
      seeded ? existing.pendingReimbursements : inputs.pendingReimbursements,
    ),
    loanRecovery: String(seeded ? existing.loanRecovery : inputs.outstandingLoans),
    noticePayRecovery: String(
      seeded ? existing.noticePayRecovery : inputs.noticePayRecovery,
    ),
    otherDeductions: String(seeded ? existing.otherDeductions : 0),
  });

  useEffect(() => {
    if (state.success) {
      toast.success("Settlement computed");
      router.refresh();
    }
  }, [state.success, router]);

  const n = (key: keyof typeof values) => Number(values[key]) || 0;

  const payable =
    n("leaveEncashmentAmount") +
    n("gratuityAmount") +
    n("pendingSalary") +
    n("pendingReimbursements");
  const recoveries =
    n("loanRecovery") + n("noticePayRecovery") + n("otherDeductions");
  const net = payable - recoveries;

  const locked = existing?.status === "PAID";

  return (
    <form action={action} className="space-y-5">
      <FormError message={state.error} />
      <input type="hidden" name="resignationId" value={resignationId} />

      {inputs.unreturnedAssets.length > 0 && (
        <div className="border-warning/40 bg-warning-subtle rounded-lg border p-4 text-sm">
          <p className="font-medium">
            {inputs.unreturnedAssets.length} asset
            {inputs.unreturnedAssets.length === 1 ? "" : "s"} not yet returned
          </p>
          <ul className="mt-1.5 text-xs">
            {inputs.unreturnedAssets.map((asset) => (
              <li key={asset.tag}>
                {asset.name} <span className="font-mono">({asset.tag})</span>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-xs">
            Recover their value under &ldquo;other deductions&rdquo; if they are
            not handed back.
          </p>
        </div>
      )}

      <div className="surface divide-y">
        <Row
          label="Leave encashment"
          working={`${inputs.encashableDays} unused days × ${formatMoney(inputs.perDay, currency)} a day`}
        >
          <div className="flex gap-2">
            <Input
              name="leaveEncashmentDays"
              type="number"
              step="0.5"
              min={0}
              value={values.leaveEncashmentDays}
              onChange={(e) =>
                setValues((v) => ({
                  ...v,
                  leaveEncashmentDays: e.target.value,
                  leaveEncashmentAmount: String(
                    Math.round(Number(e.target.value) * inputs.perDay),
                  ),
                }))
              }
              disabled={locked}
              aria-label="Days to encash"
              className="w-20 tabular-nums"
            />
            <Amount
              name="leaveEncashmentAmount"
              value={values.leaveEncashmentAmount}
              onChange={(v) =>
                setValues((s) => ({ ...s, leaveEncashmentAmount: v }))
              }
              disabled={locked}
              label="Leave encashment amount"
            />
          </div>
        </Row>

        <Row
          label="Gratuity"
          working={
            inputs.gratuityEligible
              ? `${inputs.servedYears} years served — estimated at 15 days' basic per year. Check against your own structure.`
              : `${inputs.servedYears} years served — under the five-year threshold, so not payable by default.`
          }
        >
          <Amount
            name="gratuityAmount"
            value={values.gratuityAmount}
            onChange={(v) => setValues((s) => ({ ...s, gratuityAmount: v }))}
            disabled={locked}
            label="Gratuity"
          />
        </Row>

        <Row
          label="Salary owed"
          working={`Days worked in the final month, at ${formatMoney(inputs.perDay, currency)} a day`}
        >
          <Amount
            name="pendingSalary"
            value={values.pendingSalary}
            onChange={(v) => setValues((s) => ({ ...s, pendingSalary: v }))}
            disabled={locked}
            label="Salary owed"
          />
        </Row>

        <Row
          label="Reimbursements owed"
          working="Approved expense claims not yet paid"
        >
          <Amount
            name="pendingReimbursements"
            value={values.pendingReimbursements}
            onChange={(v) =>
              setValues((s) => ({ ...s, pendingReimbursements: v }))
            }
            disabled={locked}
            label="Reimbursements owed"
          />
        </Row>

        <Row
          label="Loan recovery"
          working="Outstanding balance on salary advances"
          deduction
        >
          <Amount
            name="loanRecovery"
            value={values.loanRecovery}
            onChange={(v) => setValues((s) => ({ ...s, loanRecovery: v }))}
            disabled={locked}
            label="Loan recovery"
          />
        </Row>

        <Row
          label="Notice shortfall"
          working={
            inputs.shortfallDays > 0
              ? `${inputs.shortfallDays} days not served × ${formatMoney(inputs.perDay, currency)}`
              : "Full notice served"
          }
          deduction
        >
          <Amount
            name="noticePayRecovery"
            value={values.noticePayRecovery}
            onChange={(v) => setValues((s) => ({ ...s, noticePayRecovery: v }))}
            disabled={locked}
            label="Notice shortfall"
          />
        </Row>

        <Row
          label="Other deductions"
          working="Unreturned assets, anything else agreed"
          deduction
        >
          <Amount
            name="otherDeductions"
            value={values.otherDeductions}
            onChange={(v) => setValues((s) => ({ ...s, otherDeductions: v }))}
            disabled={locked}
            label="Other deductions"
          />
        </Row>

        <div className="flex items-center justify-between gap-4 p-4">
          <div>
            <p className="text-sm font-semibold">Net payable</p>
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatMoney(payable, currency)} owed less{" "}
              {formatMoney(recoveries, currency)} recovered
            </p>
          </div>
          <p
            className={cn(
              "text-xl font-semibold tabular-nums",
              net < 0 && "text-destructive",
            )}
          >
            {formatMoney(net, currency)}
          </p>
        </div>
      </div>

      {net < 0 && (
        <p className="text-destructive text-xs">
          Recoveries exceed what is owed. The leaver owes the company this
          amount — make sure that is intended and agreed before approving.
        </p>
      )}

      <div className="space-y-2">
        <label htmlFor="settlement-note" className="text-sm font-medium">
          Note
        </label>
        <Textarea
          id="settlement-note"
          name="note"
          rows={2}
          defaultValue={existing?.note ?? ""}
          maxLength={2000}
          disabled={locked}
          placeholder="Anything agreed that isn't obvious from the numbers."
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="flex items-center gap-2">
          {existing && existing.status !== "PENDING" && (
            <StatusBadge
              label={
                existing.status === "PAID"
                  ? "Paid"
                  : existing.status === "APPROVED"
                    ? "Approved"
                    : "Computed"
              }
              tone={existing.status === "PAID" ? "positive" : "info"}
            />
          )}
          {existing?.approvedByName && (
            <span className="text-muted-foreground text-xs">
              approved by {existing.approvedByName}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {!locked && (
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Calculator className="size-4" aria-hidden />
              )}
              Save the figures
            </Button>
          )}
          {existing?.status === "COMPUTED" && (
            <StatusButton
              resignationId={resignationId}
              status="APPROVED"
              label="Approve"
            />
          )}
          {existing?.status === "APPROVED" && (
            <StatusButton
              resignationId={resignationId}
              status="PAID"
              label="Mark paid"
            />
          )}
        </div>
      </div>
    </form>
  );
}

function Row({
  label,
  working,
  deduction,
  children,
}: {
  label: string;
  working: string;
  deduction?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 p-4">
      <div className="min-w-0">
        <p className="text-sm">
          {label}
          {deduction && (
            <span className="text-muted-foreground ml-1.5 text-xs">
              (deducted)
            </span>
          )}
        </p>
        <p className="text-muted-foreground text-xs">{working}</p>
      </div>
      {children}
    </div>
  );
}

function Amount({
  name,
  value,
  onChange,
  disabled,
  label,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Input
      name={name}
      type="number"
      min={0}
      step="1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label={label}
      className="w-32 tabular-nums"
    />
  );
}

function StatusButton({
  resignationId,
  status,
  label,
}: {
  resignationId: string;
  status: "APPROVED" | "PAID";
  label: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      type="button"
      variant={status === "PAID" ? "default" : "outline"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setSettlementStatusAction(resignationId, status);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(`Settlement ${status.toLowerCase()}`);
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {label}
    </Button>
  );
}
