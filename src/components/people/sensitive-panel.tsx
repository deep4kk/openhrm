"use client";

import { useState, useTransition } from "react";
import { Eye, Loader2, ShieldAlert } from "lucide-react";

import { revealSensitiveAction } from "@/lib/actions/employees";
import { Button } from "@/components/ui/button";

/**
 * Bank and government-ID numbers, hidden until asked for.
 *
 * The plaintext is never sent with the page — it is fetched by an action that
 * decrypts server-side and writes an audit entry naming whoever asked. That way
 * "who looked at this person's bank details" is an answerable question, and a
 * cached page or a browser history entry never contains the values.
 */
export function SensitivePanel({
  employeeId,
  maskedAccount,
  maskedPan,
  bankName,
  ifsc,
}: {
  employeeId: string;
  maskedAccount: string;
  maskedPan: string;
  bankName: string | null;
  ifsc: string | null;
}) {
  const [revealed, setRevealed] = useState<{
    bankAccountNumber?: string;
    panNumber?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reveal() {
    startTransition(async () => {
      const result = await revealSensitiveAction(employeeId);
      if (result.error) setError(result.error);
      else setRevealed(result);
    });
  }

  return (
    <div className="space-y-4">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Field label="Bank" value={bankName ?? "—"} />
        <Field label="IFSC" value={ifsc ?? "—"} mono />
        <Field
          label="Account number"
          value={revealed?.bankAccountNumber ?? maskedAccount}
          mono
        />
        <Field label="PAN" value={revealed?.panNumber ?? maskedPan} mono />
      </dl>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}

      {!revealed && (
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-3">
          <ShieldAlert
            className="text-muted-foreground mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p className="text-muted-foreground text-xs leading-relaxed">
              These values are encrypted at rest. Revealing them is recorded in
              the audit log against your name.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2.5"
              onClick={reveal}
              disabled={pending}
            >
              {pending ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Eye className="size-3.5" aria-hidden="true" />
              )}
              Reveal
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
