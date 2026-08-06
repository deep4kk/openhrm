"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateOrganizationAction } from "@/lib/actions/settings";
import type { FormState } from "@/lib/actions/auth";
import type { LocaleOption } from "@/lib/locale";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface OrganizationFormValues {
  name: string;
  industry: string;
  website: string;
  country: string;
  currency: string;
  timezone: string;
  fiscalYearStartMonth: string;
  workingDays: number[];
}

/**
 * The company profile.
 *
 * Three of these fields are not cosmetic: `workingDays` decides which days
 * attendance is expected on, `fiscalYearStartMonth` sets the leave-year
 * boundary that accruals reset against, and `timezone` decides what "today"
 * means for a check-in. The hints say so, because an admin changing them
 * casually would be changing everyone's balances.
 */
export function OrganizationForm({
  values,
  countries,
  currencies,
  timezones,
  months,
  weekdays,
}: {
  values: OrganizationFormValues;
  countries: LocaleOption[];
  currencies: LocaleOption[];
  timezones: LocaleOption[];
  months: LocaleOption[];
  weekdays: readonly { value: number; label: string; short: string }[];
}) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    updateOrganizationAction,
    {},
  );

  useEffect(() => {
    if (state.success) toast.success("Organisation updated");
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          label="Organisation name"
          name="name"
          error={state.fieldErrors?.name}
          required
        >
          {(p) => <Input {...p} defaultValue={values.name} />}
        </FormField>

        <FormField label="Industry" name="industry" error={state.fieldErrors?.industry}>
          {(p) => <Input {...p} defaultValue={values.industry} />}
        </FormField>

        <FormField
          label="Website"
          name="website"
          error={state.fieldErrors?.website}
          className="sm:col-span-2"
        >
          {(p) => (
            <Input {...p} defaultValue={values.website} placeholder="https://" />
          )}
        </FormField>

        <FormField label="Country" name="country" error={state.fieldErrors?.country} required>
          {(p) => (
            <NativeSelect {...p} defaultValue={values.country} options={countries} />
          )}
        </FormField>

        <FormField
          label="Currency"
          name="currency"
          error={state.fieldErrors?.currency}
          hint="Used wherever salary figures appear."
          required
        >
          {(p) => (
            <NativeSelect {...p} defaultValue={values.currency} options={currencies} />
          )}
        </FormField>

        <FormField
          label="Timezone"
          name="timezone"
          error={state.fieldErrors?.timezone}
          hint="Decides which calendar day a check-in belongs to."
          required
        >
          {(p) => (
            <NativeSelect {...p} defaultValue={values.timezone} options={timezones} />
          )}
        </FormField>

        <FormField
          label="Leave year starts"
          name="fiscalYearStartMonth"
          error={state.fieldErrors?.fiscalYearStartMonth}
          hint="Accruals reset and carry-forward is applied at this boundary."
          required
        >
          {(p) => (
            <NativeSelect
              {...p}
              defaultValue={values.fiscalYearStartMonth}
              options={months}
            />
          )}
        </FormField>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Working days</legend>
        <p className="text-muted-foreground text-xs">
          Days outside this set are marked as a weekly off, and leave taken on
          them isn&apos;t deducted from anyone&apos;s balance.
        </p>

        <div className="flex flex-wrap gap-x-5 gap-y-2.5">
          {weekdays.map((day) => (
            <div key={day.value} className="flex items-center gap-2">
              <Checkbox
                id={`working-day-${day.value}`}
                name="workingDays"
                value={String(day.value)}
                defaultChecked={values.workingDays.includes(day.value)}
              />
              <Label htmlFor={`working-day-${day.value}`} className="font-normal">
                {day.label}
              </Label>
            </div>
          ))}
        </div>

        {state.fieldErrors?.workingDays && (
          <p role="alert" className="text-destructive text-xs">
            {state.fieldErrors.workingDays}
          </p>
        )}
      </fieldset>

      <div className="flex justify-end border-t pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

/**
 * A native <select>. Deliberate: it is keyboard- and screen-reader-correct for
 * free, and on a phone it opens the OS picker — which matters a lot for a list
 * of 400 timezones.
 */
function NativeSelect({
  options,
  className,
  ...props
}: React.ComponentProps<"select"> & { options: LocaleOption[] }) {
  return (
    <select
      {...props}
      className={cn(
        "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3",
        className,
      )}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
