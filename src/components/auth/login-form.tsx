"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";

import { loginAction, type FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FormState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  // The action signals "this email matches accounts in several organisations"
  // by returning a sentinel rather than logging the user into an arbitrary one.
  const orgChoice = parseOrgChoice(state.error);

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground text-sm">
          Welcome back. Enter your details to continue.
        </p>
      </div>

      {!orgChoice && <FormError message={state.error} />}

      {orgChoice && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">
            You belong to more than one organisation. Which one?
          </legend>
          {orgChoice.map((org) => (
            <label
              key={org.id}
              className="hover:bg-accent has-checked:border-primary has-checked:bg-accent flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors"
            >
              <input
                type="radio"
                name="orgId"
                value={org.id}
                required
                className="accent-primary size-4"
              />
              {org.name}
            </label>
          ))}
        </fieldset>
      )}

      <FormField label="Work email" name="email" error={state.fieldErrors?.email} required>
        {(props) => (
          <Input
            {...props}
            type="email"
            autoComplete="username"
            autoFocus
            placeholder="you@company.com"
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
              autoComplete="current-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md transition-colors"
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
        {pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        No account yet?{" "}
        <Link
          href="/signup"
          className="text-brand font-medium underline-offset-4 hover:underline"
        >
          Create an organisation
        </Link>
      </p>
    </form>
  );
}

function parseOrgChoice(
  error?: string,
): { id: string; name: string }[] | null {
  if (!error?.startsWith("CHOOSE_ORG:")) return null;
  try {
    return JSON.parse(error.slice("CHOOSE_ORG:".length));
  } catch {
    return null;
  }
}
