"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { applyForLeaveAction } from "@/lib/actions/leave";
import type { FormState } from "@/lib/actions/auth";
import type { LeaveBalanceView } from "@/lib/queries/leave";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDays } from "./balance-cards";

/**
 * Applying for leave.
 *
 * The balance for the selected type is shown live next to the picker, so the
 * "you only have 2 days left" conversation happens before submitting rather
 * than as a rejection afterwards. The server re-checks everything regardless.
 */
export function ApplyLeaveDialog({
  balances,
}: {
  balances: LeaveBalanceView[];
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    applyForLeaveAction,
    {},
  );
  const router = useRouter();

  const [leaveTypeId, setLeaveTypeId] = useState(
    balances[0]?.leaveTypeId ?? "",
  );
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const selected = balances.find((b) => b.leaveTypeId === leaveTypeId);

  useEffect(() => {
    if (state.success) {
      toast.success("Leave requested", {
        description: "Your approver has been notified.",
      });
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  // A half day is a single date, so keep the two fields consistent.
  useEffect(() => {
    if (isHalfDay && startDate) setEndDate(startDate);
  }, [isHalfDay, startDate]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <CalendarPlus className="size-4" aria-hidden="true" />
        Apply for leave
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Your reporting manager will be notified and can approve or decline.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />

          <FormField
            label="Leave type"
            name="leaveTypeId"
            error={state.fieldErrors?.leaveTypeId}
            required
            hint={
              selected
                ? `${formatDays(selected.available)} available${
                    selected.minNoticeDays > 0
                      ? ` · needs ${selected.minNoticeDays} days' notice`
                      : ""
                  }`
                : undefined
            }
          >
            {(p) => (
              <select
                {...p}
                value={leaveTypeId}
                onChange={(e) => setLeaveTypeId(e.target.value)}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-[3px]"
              >
                {balances.map((b) => (
                  <option key={b.leaveTypeId} value={b.leaveTypeId}>
                    {b.name} — {formatDays(b.available)} left
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="From"
              name="startDate"
              error={state.fieldErrors?.startDate}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              label="To"
              name="endDate"
              error={state.fieldErrors?.endDate}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  disabled={isHalfDay}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              )}
            </FormField>
          </div>

          {selected?.allowHalfDay && (
            <div className="flex items-center gap-3">
              <Checkbox
                id="isHalfDay"
                name="isHalfDay"
                checked={isHalfDay}
                onCheckedChange={(v) => setIsHalfDay(v === true)}
              />
              <Label htmlFor="isHalfDay" className="font-normal">
                Half day only
              </Label>

              {isHalfDay && (
                <select
                  name="halfDaySession"
                  aria-label="Which half"
                  className="border-input bg-background ml-auto h-8 rounded-lg border px-2 text-sm"
                >
                  <option value="FIRST_HALF">First half</option>
                  <option value="SECOND_HALF">Second half</option>
                </select>
              )}
            </div>
          )}

          <FormField
            label="Reason"
            name="reason"
            error={state.fieldErrors?.reason}
            required
            hint="Your approver sees this. A line is enough."
          >
            {(p) => <Textarea {...p} rows={3} maxLength={500} />}
          </FormField>

          <FormField
            label="Contact while away"
            name="contactDuringLeave"
            hint="Optional — a phone number for anything urgent."
          >
            {(p) => <Input {...p} type="tel" />}
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
              {pending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Submit request
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
