"use client";

import { useState, useTransition } from "react";
import { Ban, Calculator, CheckCheck, Landmark } from "lucide-react";
import { toast } from "sonner";

import {
  approvePayrollAction,
  calculatePayrollAction,
  cancelPayrollRunAction,
  markPayrollPaidAction,
} from "@/lib/actions/payroll";
import { Button } from "@/components/ui/button";
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

/**
 * The one action a run is actually waiting for.
 *
 * A payroll screen with Calculate, Approve, Mark paid and Cancel all live at
 * once invites the wrong click on the wrong day. Each state offers its next
 * step and nothing else.
 *
 * Approval is the only irreversible step, so it is the only one that asks —
 * and the confirmation says what actually becomes true (employees can see their
 * payslips), not "are you sure".
 */
export function RunActions({
  runId,
  status,
  payslipCount,
  canRun,
  canApprove,
}: {
  runId: string;
  status: string;
  payslipCount: number;
  canRun: boolean;
  canApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState<"approve" | "cancel" | null>(null);

  function run(action: () => Promise<{ error?: string; success?: boolean }>, ok: string) {
    startTransition(async () => {
      const result = await action();
      if (result.error && !result.success) {
        toast.error(result.error);
        return;
      }
      // A partial success — for instance employees skipped for want of a salary
      // structure — reports both outcomes rather than only the cheerful one.
      if (result.error) toast.warning(result.error);
      toast.success(ok);
      setConfirming(null);
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {canRun && (status === "DRAFT" || status === "REVIEW") && (
          <Button
            variant={status === "DRAFT" ? "default" : "outline"}
            disabled={pending}
            onClick={() =>
              run(
                () => calculatePayrollAction(runId),
                status === "DRAFT" ? "Payroll calculated" : "Payroll recalculated",
              )
            }
          >
            <Calculator className="size-4" aria-hidden />
            {status === "DRAFT" ? "Calculate" : "Recalculate"}
          </Button>
        )}

        {canApprove && status === "REVIEW" && payslipCount > 0 && (
          <Button disabled={pending} onClick={() => setConfirming("approve")}>
            <CheckCheck className="size-4" aria-hidden />
            Approve & release
          </Button>
        )}

        {canApprove && status === "APPROVED" && (
          <Button
            disabled={pending}
            onClick={() =>
              run(() => markPayrollPaidAction(runId), "Marked as disbursed")
            }
          >
            <Landmark className="size-4" aria-hidden />
            Mark paid
          </Button>
        )}

        {canRun && (status === "DRAFT" || status === "REVIEW") && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Cancel this run"
            disabled={pending}
            onClick={() => setConfirming("cancel")}
          >
            <Ban />
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => !open && setConfirming(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "approve"
                ? `Release ${payslipCount} payslip${payslipCount === 1 ? "" : "s"}?`
                : "Cancel this payroll run?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "approve"
                ? "Every employee in this run will be able to see and download their payslip immediately, and the figures become fixed — corrections have to be made in a later run. Loan instalments and approved expense claims are settled at the same time."
                : "The calculated payslips are discarded. Nothing has been shown to employees, so nothing is lost that can't be recalculated."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Back</AlertDialogCancel>
            <AlertDialogAction
              variant={confirming === "cancel" ? "destructive" : "default"}
              disabled={pending}
              onClick={() =>
                confirming === "approve"
                  ? run(
                      () => approvePayrollAction(runId),
                      "Payroll approved — payslips released",
                    )
                  : run(() => cancelPayrollRunAction(runId), "Run cancelled")
              }
            >
              {pending
                ? "Working…"
                : confirming === "approve"
                  ? "Approve & release"
                  : "Cancel run"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
