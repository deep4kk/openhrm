"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { saveStatutorySettingsAction } from "@/lib/actions/payroll-settings";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/settings/panel";

/**
 * The statutory editor.
 *
 * Slabs are edited as JSON rather than through a row builder. That is a
 * deliberate trade: the audience for this screen is one admin per organisation
 * doing this once a year, and a JSON array of `{ upTo, rate }` is both exactly
 * what the engine consumes and easy to paste from a circular. A drag-and-drop
 * slab builder would be more code, more to get wrong, and slower for the person
 * actually using it. The server validates the shape and refuses anything it
 * cannot read.
 */

export interface StatutoryValues {
  countryCode: string;
  pfEnabled: boolean;
  pfWageCeiling: number;
  pfEmployeeRate: number;
  pfEmployerRate: number;
  pfCapAtCeiling: boolean;
  esiEnabled: boolean;
  esiWageCeiling: number;
  esiEmployeeRate: number;
  esiEmployerRate: number;
  ptEnabled: boolean;
  ptSlabs: string;
  tdsEnabled: boolean;
  tdsRegime: string;
  standardDeduction: number;
  tdsSlabs: string;
  gratuityEnabled: boolean;
  gratuityMinYears: number;
}

export function StatutoryForm({ setting }: { setting: StatutoryValues }) {
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    saveStatutorySettingsAction,
    {},
  );

  useEffect(() => {
    if (state.success) toast.success("Statutory settings saved");
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-6">
      <FormError message={state.error} />

      <Panel
        title="Provident fund"
        description="12% of basic from the employee, matched by the employer."
        action={<Toggle name="pfEnabled" defaultChecked={setting.pfEnabled} />}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Wage ceiling"
            name="pfWageCeiling"
            hint="Monthly basic above this is ignored when the cap is on."
            error={state.fieldErrors?.pfWageCeiling}
          >
            {(props) => (
              <Input {...props} type="number" defaultValue={setting.pfWageCeiling} />
            )}
          </FormField>
          <FormField
            label="Employee rate (%)"
            name="pfEmployeeRate"
            error={state.fieldErrors?.pfEmployeeRate}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.01"
                defaultValue={setting.pfEmployeeRate}
              />
            )}
          </FormField>
          <FormField
            label="Employer rate (%)"
            name="pfEmployerRate"
            error={state.fieldErrors?.pfEmployerRate}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.01"
                defaultValue={setting.pfEmployerRate}
              />
            )}
          </FormField>
        </div>

        <div className="mt-4 flex items-start gap-2.5">
          <Switch
            id="pfCapAtCeiling"
            name="pfCapAtCeiling"
            defaultChecked={setting.pfCapAtCeiling}
          />
          <div>
            <Label htmlFor="pfCapAtCeiling" className="font-normal">
              Cap the contribution at the wage ceiling
            </Label>
            <p className="text-muted-foreground mt-0.5 text-xs">
              On: PF is calculated on the ceiling for anyone earning more. Off:
              calculated on their full basic. Both practices are common — the
              difference shows on every payslip, so pick deliberately.
            </p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Employee state insurance"
        description="Applies only below the wage ceiling, and stops entirely above it."
        action={<Toggle name="esiEnabled" defaultChecked={setting.esiEnabled} />}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label="Wage ceiling"
            name="esiWageCeiling"
            error={state.fieldErrors?.esiWageCeiling}
          >
            {(props) => (
              <Input {...props} type="number" defaultValue={setting.esiWageCeiling} />
            )}
          </FormField>
          <FormField
            label="Employee rate (%)"
            name="esiEmployeeRate"
            error={state.fieldErrors?.esiEmployeeRate}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.01"
                defaultValue={setting.esiEmployeeRate}
              />
            )}
          </FormField>
          <FormField
            label="Employer rate (%)"
            name="esiEmployerRate"
            error={state.fieldErrors?.esiEmployerRate}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                step="0.01"
                defaultValue={setting.esiEmployerRate}
              />
            )}
          </FormField>
        </div>
      </Panel>

      <Panel
        title="Professional tax"
        description="A state levy. The slabs below ship with Karnataka's rates — change them for your state."
        action={<Toggle name="ptEnabled" defaultChecked={setting.ptEnabled} />}
      >
        <FormField
          label="Slabs"
          name="ptSlabs"
          hint='JSON, evaluated top to bottom on monthly gross. upTo: null means "and above".'
          error={state.fieldErrors?.ptSlabs}
        >
          {(props) => (
            <Textarea
              {...props}
              rows={6}
              defaultValue={setting.ptSlabs}
              className="font-mono text-xs"
            />
          )}
        </FormField>
      </Panel>

      <Panel
        title="Income tax (TDS)"
        description="An estimate, spread evenly over twelve months. It does not account for declared investments or other income."
        action={<Toggle name="tdsEnabled" defaultChecked={setting.tdsEnabled} />}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="Regime"
            name="tdsRegime"
            error={state.fieldErrors?.tdsRegime}
          >
            {(props) => (
              <select
                {...props}
                defaultValue={setting.tdsRegime}
                className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3"
              >
                <option value="NEW">New regime</option>
                <option value="OLD">Old regime</option>
              </select>
            )}
          </FormField>
          <FormField
            label="Standard deduction"
            name="standardDeduction"
            error={state.fieldErrors?.standardDeduction}
          >
            {(props) => (
              <Input
                {...props}
                type="number"
                defaultValue={setting.standardDeduction}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="Annual slabs"
          name="tdsSlabs"
          hint="JSON. Marginal rates — each band applies only to the income inside it. A 4% cess is added on top of the computed tax."
          error={state.fieldErrors?.tdsSlabs}
          className="mt-4"
        >
          {(props) => (
            <Textarea
              {...props}
              rows={10}
              defaultValue={setting.tdsSlabs}
              className="font-mono text-xs"
            />
          )}
        </FormField>
      </Panel>

      <Panel
        title="Gratuity"
        description="Used when computing a full & final settlement: 15 days of last-drawn basic per completed year, on a 26-day month."
        action={
          <Toggle name="gratuityEnabled" defaultChecked={setting.gratuityEnabled} />
        }
      >
        <FormField
          label="Minimum years of service"
          name="gratuityMinYears"
          hint="Gratuity does not vest below this. Five years is the statutory minimum in India."
          error={state.fieldErrors?.gratuityMinYears}
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min="0"
              max="20"
              defaultValue={setting.gratuityMinYears}
              className="w-28"
            />
          )}
        </FormField>
      </Panel>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </form>
  );
}

function Toggle({
  name,
  defaultChecked,
}: {
  name: string;
  defaultChecked: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch id={name} name={name} defaultChecked={defaultChecked} />
      <Label htmlFor={name} className="text-muted-foreground text-xs font-normal">
        Enabled
      </Label>
    </div>
  );
}
