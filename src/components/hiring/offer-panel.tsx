"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileSignature, Loader2, UserCheck } from "lucide-react";
import { toast } from "sonner";

import {
  convertOfferAction,
  createOfferAction,
  decideOfferAction,
} from "@/lib/actions/hiring";
import type { FormState } from "@/lib/actions/auth";
import { formatMoney } from "@/lib/money";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OfferStatusBadge } from "./hiring-bits";

export interface OfferView {
  id: string;
  status: string;
  annualCtc: number;
  designation: string | null;
  joiningLabel: string;
  expiresLabel: string | null;
  sentLabel: string | null;
  respondedLabel: string | null;
  declineReason: string | null;
  convertedEmployeeId: string | null;
}

/**
 * Offers, and the moment hiring becomes employment.
 *
 * "Convert to employee" is the only button here that writes outside the hiring
 * module: it creates the employee record, links the offer to it, and starts the
 * onboarding checklist. Keeping it a single explicit action — rather than a
 * side effect of marking an offer accepted — is what lets a recruiter accept an
 * offer today and have HR create the record when the paperwork lands.
 */
export function OfferPanel({
  candidateId,
  candidateName,
  suggestedDesignation,
  offers,
  currency,
  canManage,
  canCreateEmployee,
}: {
  candidateId: string;
  candidateName: string;
  suggestedDesignation: string;
  offers: OfferView[];
  currency: string;
  canManage: boolean;
  canCreateEmployee: boolean;
}) {
  const live = offers.find((o) =>
    ["DRAFT", "SENT", "ACCEPTED"].includes(o.status),
  );

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Offer</h2>
        {canManage && !live && (
          <CreateOfferDialog
            candidateId={candidateId}
            candidateName={candidateName}
            suggestedDesignation={suggestedDesignation}
            currency={currency}
          />
        )}
      </div>

      {offers.length === 0 ? (
        <div className="surface text-muted-foreground p-6 text-center text-sm">
          No offer has been made.
        </div>
      ) : (
        <ul className="space-y-3">
          {offers.map((offer) => (
            <li key={offer.id} className="surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatMoney(offer.annualCtc, currency)}
                    <span className="text-muted-foreground ml-2 text-sm font-normal">
                      a year
                    </span>
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {offer.designation ?? "—"} · joining {offer.joiningLabel}
                    {offer.expiresLabel && ` · expires ${offer.expiresLabel}`}
                  </p>
                  {offer.sentLabel && (
                    <p className="text-muted-foreground text-xs">
                      Sent {offer.sentLabel}
                      {offer.respondedLabel &&
                        ` · answered ${offer.respondedLabel}`}
                    </p>
                  )}
                </div>
                <OfferStatusBadge status={offer.status} />
              </div>

              {offer.declineReason && (
                <p className="bg-muted measure mt-3 rounded-md px-3 py-2 text-sm">
                  {offer.declineReason}
                </p>
              )}

              {canManage && (
                <OfferActions
                  offer={offer}
                  canCreateEmployee={canCreateEmployee}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OfferActions({
  offer,
  canCreateEmployee,
}: {
  offer: OfferView;
  canCreateEmployee: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const router = useRouter();

  function decide(status: "SENT" | "ACCEPTED" | "DECLINED" | "WITHDRAWN") {
    startTransition(async () => {
      const result = await decideOfferAction(offer.id, status, reason);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Offer marked ${status.toLowerCase()}`);
      setDeclining(false);
      setReason("");
      router.refresh();
    });
  }

  if (offer.convertedEmployeeId) {
    return (
      <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
        Converted to an employee record.
      </p>
    );
  }

  if (declining) {
    return (
      <div className="mt-3 space-y-3 border-t pt-3">
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          aria-label="Why the offer was declined"
          placeholder="What did they say? Compensation, counter-offer, timing…"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setDeclining(false)}>
            Back
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={pending}
            onClick={() => decide("DECLINED")}
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Record decline
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
      {offer.status === "DRAFT" && (
        <Button size="sm" disabled={pending} onClick={() => decide("SENT")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Mark sent
        </Button>
      )}

      {offer.status === "SENT" && (
        <>
          <Button size="sm" disabled={pending} onClick={() => decide("ACCEPTED")}>
            Accepted
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => setDeclining(true)}
          >
            Declined
          </Button>
        </>
      )}

      {offer.status === "ACCEPTED" && canCreateEmployee && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            if (
              !confirm(
                "Create an employee record from this offer? Their onboarding checklist starts too.",
              )
            ) {
              return;
            }
            startTransition(async () => {
              const result = await convertOfferAction(offer.id);
              if (result?.error) toast.error(result.error);
            });
          }}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <UserCheck className="size-4" aria-hidden />
          )}
          Convert to employee
        </Button>
      )}

      {["DRAFT", "SENT"].includes(offer.status) && (
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => decide("WITHDRAWN")}
          className="ml-auto"
        >
          Withdraw
        </Button>
      )}
    </div>
  );
}

function CreateOfferDialog({
  candidateId,
  candidateName,
  suggestedDesignation,
  currency,
}: {
  candidateId: string;
  candidateName: string;
  suggestedDesignation: string;
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    createOfferAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Offer drafted");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <FileSignature className="size-4" aria-hidden />
        Draft offer
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft an offer</DialogTitle>
          <DialogDescription>
            For {candidateName}. Drafting moves them to the offer stage; nothing
            is sent until you mark it sent.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          <input type="hidden" name="candidateId" value={candidateId} />

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label={`Annual CTC (${currency})`}
              name="annualCtc"
              error={state.fieldErrors?.annualCtc}
              required
            >
              {(p) => (
                <Input {...p} type="number" min={0} className="tabular-nums" />
              )}
            </FormField>

            <FormField
              label="Joining date"
              name="joiningDate"
              error={state.fieldErrors?.joiningDate}
              required
            >
              {(p) => <Input {...p} type="date" />}
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Designation" name="designation">
              {(p) => (
                <Input {...p} defaultValue={suggestedDesignation} maxLength={120} />
              )}
            </FormField>

            <FormField
              label="Offer expires"
              name="expiresOn"
              hint="Optional — a deadline the candidate sees."
            >
              {(p) => <Input {...p} type="date" />}
            </FormField>
          </div>

          <FormField
            label="Notes"
            name="letterBody"
            hint="Anything specific to this offer — a joining bonus, a relocation arrangement."
          >
            {(p) => <Textarea {...p} rows={4} maxLength={20_000} />}
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
              Draft it
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
