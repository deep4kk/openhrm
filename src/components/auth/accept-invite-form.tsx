"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { acceptInvitationAction, type FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AcceptInviteForm({
  token,
  email,
  name,
  orgName,
  roleName,
}: {
  token: string;
  email: string;
  name: string;
  orgName: string;
  roleName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    acceptInvitationAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Join {orgName}
        </h1>
        <p className="text-muted-foreground text-sm">
          You&apos;ve been invited as {roleName}. Set a password and you&apos;re
          in.
        </p>
      </div>

      <FormError message={state.error} />

      {/* Shown, not editable — the invitation is bound to this address. */}
      <div className="space-y-2">
        <p className="text-sm font-medium">Email</p>
        <div className="bg-muted text-muted-foreground rounded-lg border px-3 py-2 text-sm">
          {email}
        </div>
      </div>

      <FormField
        label="Your name"
        name="name"
        error={state.fieldErrors?.name}
        required
      >
        {(p) => <Input {...p} defaultValue={name} autoFocus autoComplete="name" />}
      </FormField>

      <FormField
        label="Choose a password"
        name="password"
        error={state.fieldErrors?.password}
        hint="At least 10 characters. A short phrase works well."
        required
      >
        {(p) => (
          <div className="relative">
            <Input
              {...p}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? (
                <EyeOff className="size-4" aria-hidden="true" />
              ) : (
                <Eye className="size-4" aria-hidden="true" />
              )}
            </button>
          </div>
        )}
      </FormField>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {pending ? "Setting up…" : "Join " + orgName}
      </Button>
    </form>
  );
}
