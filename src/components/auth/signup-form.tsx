"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";

import { signupAction, type FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const initialState: FormState = {};

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, initialState);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">
          Create your organisation
        </h1>
        <p className="text-muted-foreground text-sm">
          Free, and free forever. No card, no per-employee pricing.
        </p>
      </div>

      <FormError message={state.error} />

      <FormField
        label="Organisation name"
        name="orgName"
        error={state.fieldErrors?.orgName}
        hint="What your company is called. You can change this later."
        required
      >
        {(props) => (
          <Input {...props} autoFocus placeholder="Acme Technologies" autoComplete="organization" />
        )}
      </FormField>

      <FormField label="Your name" name="name" error={state.fieldErrors?.name} required>
        {(props) => <Input {...props} placeholder="Deepak Sharma" autoComplete="name" />}
      </FormField>

      <FormField
        label="Work email"
        name="email"
        error={state.fieldErrors?.email}
        required
      >
        {(props) => (
          <Input
            {...props}
            type="email"
            placeholder="you@company.com"
            autoComplete="username"
          />
        )}
      </FormField>

      <FormField
        label="Password"
        name="password"
        error={state.fieldErrors?.password}
        required
      >
        {(props) => (
          <div className="relative">
            <Input
              {...props}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

      <PasswordChecklist password={password} />

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {pending ? "Creating…" : "Create organisation"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-brand font-medium underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}

/**
 * Live requirements rather than a strength meter. A meter tells you "weak" and
 * leaves you guessing; a checklist tells you exactly what is missing. Rendered
 * with `aria-live="polite"` so it is announced without stealing focus.
 */
function PasswordChecklist({ password }: { password: string }) {
  const rules = [
    { label: "At least 10 characters", met: password.length >= 10 },
    {
      label: "Not a common password",
      met:
        password.length > 0 &&
        !["password", "12345678", "qwerty", "letmein", "welcome"].some((c) =>
          password.toLowerCase().includes(c),
        ),
    },
  ];

  if (!password) {
    return (
      <p className="text-muted-foreground text-xs">
        Use at least 10 characters. A short phrase beats a short password.
      </p>
    );
  }

  return (
    <ul aria-live="polite" className="space-y-1.5">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={cn(
            "flex items-center gap-2 text-xs transition-colors",
            rule.met ? "text-success" : "text-muted-foreground",
          )}
        >
          <span
            className={cn(
              "flex size-3.5 items-center justify-center rounded-full border",
              rule.met ? "border-success bg-success text-white" : "border-current",
            )}
            aria-hidden="true"
          >
            {rule.met && <Check className="size-2.5" strokeWidth={3} />}
          </span>
          {rule.label}
          <span className="sr-only">{rule.met ? " — met" : " — not yet met"}</span>
        </li>
      ))}
    </ul>
  );
}
