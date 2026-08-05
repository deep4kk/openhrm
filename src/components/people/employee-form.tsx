"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

import {
  createEmployeeAction,
  updateEmployeeAction,
} from "@/lib/actions/employees";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface Option {
  id: string;
  label: string;
}

export interface EmployeeFormValues {
  id?: string;
  firstName?: string;
  lastName?: string;
  workEmail?: string;
  personalEmail?: string;
  employeeCode?: string;
  phone?: string;
  dateOfBirth?: string;
  gender?: string;
  bloodGroup?: string;
  dateOfJoining?: string;
  departmentId?: string;
  designationId?: string;
  locationId?: string;
  managerId?: string;
  shiftId?: string;
  employmentType?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  emergencyContactRelation?: string;
  ctcAnnual?: string;
  bankName?: string;
  bankIfsc?: string;
}

/**
 * One form for creating and editing.
 *
 * Grouped into sections rather than presented as one 30-field wall — the
 * progressive-disclosure rule. Fields the viewer isn't allowed to write simply
 * aren't rendered, and the server refuses them anyway if they're forged.
 */
export function EmployeeForm({
  mode,
  values = {},
  options,
  canSeeCompensation,
  canSeeSensitive,
  canInvite,
  currency,
}: {
  mode: "create" | "edit";
  values?: EmployeeFormValues;
  options: {
    departments: Option[];
    designations: Option[];
    locations: Option[];
    shifts: Option[];
    managers: Option[];
  };
  canSeeCompensation: boolean;
  canSeeSensitive: boolean;
  canInvite: boolean;
  currency: string;
}) {
  const action = mode === "create" ? createEmployeeAction : updateEmployeeAction;
  const [state, formAction, pending] = useActionState<FormState, FormData>(
    action,
    {},
  );

  useEffect(() => {
    if (state.success) toast.success("Changes saved");
  }, [state.success]);

  return (
    <form action={formAction} className="space-y-8">
      {values.id && <input type="hidden" name="id" value={values.id} />}

      <FormError message={state.error} />

      <Section
        title="Personal"
        description="Who they are. Only name and work email are required to get started."
      >
        <FormField label="First name" name="firstName" error={state.fieldErrors?.firstName} required>
          {(p) => <Input {...p} defaultValue={values.firstName} autoFocus={mode === "create"} />}
        </FormField>

        <FormField label="Last name" name="lastName" error={state.fieldErrors?.lastName}>
          {(p) => <Input {...p} defaultValue={values.lastName} />}
        </FormField>

        <FormField label="Date of birth" name="dateOfBirth" error={state.fieldErrors?.dateOfBirth}>
          {(p) => <Input {...p} type="date" defaultValue={values.dateOfBirth} />}
        </FormField>

        <FormField label="Gender" name="gender" hint="Used for diversity reporting and gender-specific leave.">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.gender}>
              <option value="">Prefer not to say</option>
              <option value="FEMALE">Female</option>
              <option value="MALE">Male</option>
              <option value="OTHER">Other</option>
              <option value="UNDISCLOSED">Undisclosed</option>
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Blood group" name="bloodGroup">
          {(p) => <Input {...p} defaultValue={values.bloodGroup} placeholder="O+" />}
        </FormField>
      </Section>

      <Section title="Contact" description="How to reach them, and who to call in an emergency.">
        <FormField label="Work email" name="workEmail" error={state.fieldErrors?.workEmail} required>
          {(p) => <Input {...p} type="email" defaultValue={values.workEmail} />}
        </FormField>

        <FormField label="Personal email" name="personalEmail" error={state.fieldErrors?.personalEmail}>
          {(p) => <Input {...p} type="email" defaultValue={values.personalEmail} />}
        </FormField>

        <FormField label="Phone" name="phone">
          {(p) => <Input {...p} type="tel" defaultValue={values.phone} placeholder="+91 98765 43210" />}
        </FormField>

        <FormField label="Address" name="addressLine1" className="sm:col-span-2">
          {(p) => <Input {...p} defaultValue={values.addressLine1} />}
        </FormField>

        <FormField label="City" name="city">
          {(p) => <Input {...p} defaultValue={values.city} />}
        </FormField>

        <FormField label="State" name="state">
          {(p) => <Input {...p} defaultValue={values.state} />}
        </FormField>

        <FormField label="Postal code" name="postalCode">
          {(p) => <Input {...p} defaultValue={values.postalCode} inputMode="numeric" />}
        </FormField>

        <FormField label="Emergency contact" name="emergencyContactName">
          {(p) => <Input {...p} defaultValue={values.emergencyContactName} />}
        </FormField>

        <FormField label="Emergency phone" name="emergencyContactPhone">
          {(p) => <Input {...p} type="tel" defaultValue={values.emergencyContactPhone} />}
        </FormField>

        <FormField label="Relationship" name="emergencyContactRelation">
          {(p) => <Input {...p} defaultValue={values.emergencyContactRelation} placeholder="Spouse" />}
        </FormField>
      </Section>

      <Section title="Job" description="Where they sit in the organisation.">
        <FormField label="Employee code" name="employeeCode" error={state.fieldErrors?.employeeCode} required>
          {(p) => <Input {...p} defaultValue={values.employeeCode} className="font-mono" />}
        </FormField>

        <FormField label="Joining date" name="dateOfJoining" error={state.fieldErrors?.dateOfJoining} required>
          {(p) => <Input {...p} type="date" defaultValue={values.dateOfJoining} />}
        </FormField>

        <FormField label="Department" name="departmentId">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.departmentId}>
              <option value="">Unassigned</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Designation" name="designationId">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.designationId}>
              <option value="">Unassigned</option>
              {options.designations.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Reports to" name="managerId" hint="Approves their leave and attendance corrections.">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.managerId}>
              <option value="">Nobody</option>
              {options.managers
                .filter((m) => m.id !== values.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Location" name="locationId">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.locationId}>
              <option value="">Unassigned</option>
              {options.locations.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Shift" name="shiftId">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.shiftId}>
              <option value="">Default</option>
              {options.shifts.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </NativeSelect>
          )}
        </FormField>

        <FormField label="Employment type" name="employmentType">
          {(p) => (
            <NativeSelect {...p} defaultValue={values.employmentType ?? "FULL_TIME"}>
              <option value="FULL_TIME">Full time</option>
              <option value="PART_TIME">Part time</option>
              <option value="CONTRACT">Contract</option>
              <option value="INTERN">Intern</option>
              <option value="CONSULTANT">Consultant</option>
            </NativeSelect>
          )}
        </FormField>
      </Section>

      {canSeeCompensation && (
        <Section
          title="Compensation"
          description="Visible only to roles holding “View compensation”. Changes are audited."
        >
          <FormField label={`Annual CTC (${currency})`} name="ctcAnnual">
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                defaultValue={values.ctcAnnual}
                className="tabular"
              />
            )}
          </FormField>
        </Section>
      )}

      {canSeeSensitive && (
        <Section
          title="Bank & identity"
          description="Encrypted before it reaches the database. Leave blank to keep existing values."
        >
          <FormField label="Bank name" name="bankName">
            {(p) => <Input {...p} defaultValue={values.bankName} />}
          </FormField>

          <FormField label="IFSC" name="bankIfsc">
            {(p) => <Input {...p} defaultValue={values.bankIfsc} className="font-mono uppercase" />}
          </FormField>

          <FormField
            label="Account number"
            name="bankAccountNumber"
            hint={mode === "edit" ? "Blank keeps the stored number." : undefined}
          >
            {(p) => <Input {...p} autoComplete="off" className="font-mono" />}
          </FormField>

          <FormField
            label="PAN"
            name="panNumber"
            hint={mode === "edit" ? "Blank keeps the stored number." : undefined}
          >
            {(p) => <Input {...p} autoComplete="off" className="font-mono uppercase" />}
          </FormField>
        </Section>
      )}

      {mode === "create" && canInvite && (
        <div className="bg-muted/40 flex items-start gap-3 rounded-lg border p-4">
          <Checkbox id="sendInvite" name="sendInvite" defaultChecked />
          <div className="grid gap-1">
            <Label htmlFor="sendInvite" className="font-medium">
              Email them an invitation
            </Label>
            <p className="text-muted-foreground text-sm">
              They&apos;ll set their own password and land on their own space.
              You can also do this later from their profile.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 border-t pt-6">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
          {mode === "create" ? "Add employee" : "Save changes"}
        </Button>
        <LinkButton
          variant="ghost"
          href={values.id ? `/people/${values.id}` : "/people"}
        >
          Cancel
        </LinkButton>
      </div>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-6 border-t pt-6 first:border-t-0 first:pt-0 lg:grid-cols-[15rem_1fr]">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && (
          <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}

/**
 * A plain <select>. The styled Select is a listbox that doesn't post a value
 * with the form, and these fields must work in a no-JS submit.
 */
function NativeSelect({
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-9 w-full rounded-lg border px-2.5 text-sm transition-[color,box-shadow] outline-none focus-visible:ring-[3px]"
    >
      {children}
    </select>
  );
}
