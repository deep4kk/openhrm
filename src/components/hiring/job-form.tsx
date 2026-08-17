"use client";

import { useActionState, useState } from "react";
import { Loader2, Save } from "lucide-react";

import { saveJobAction } from "@/lib/actions/hiring";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export interface JobDraft {
  id?: string;
  title: string;
  departmentId: string;
  locationId: string;
  employmentType: string;
  openings: string;
  description: string;
  requirements: string;
  minCtc: string;
  maxCtc: string;
  hiringManagerId: string;
  recruiterId: string;
  closesOn: string;
  isPublic: boolean;
  status: string;
}

export const EMPTY_JOB: JobDraft = {
  title: "",
  departmentId: "",
  locationId: "",
  employmentType: "FULL_TIME",
  openings: "1",
  description: "",
  requirements: "",
  minCtc: "",
  maxCtc: "",
  hiringManagerId: "",
  recruiterId: "",
  closesOn: "",
  isPublic: true,
  status: "DRAFT",
};

interface Option {
  id: string;
  name: string;
}

/**
 * Writing a requisition.
 *
 * The description field is the public advert, not an internal note — so the
 * hint says so, and the salary band sits next to a switch that decides whether
 * the world sees this page at all. Getting those two next to each other is what
 * stops a band intended for the hiring committee ending up on the careers site.
 */
export function JobForm({
  job = EMPTY_JOB,
  departments,
  locations,
  employees,
  currency,
}: {
  job?: JobDraft;
  departments: Option[];
  locations: Option[];
  employees: Option[];
  currency: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveJobAction,
    {},
  );
  const [isPublic, setIsPublic] = useState(job.isPublic);
  const [status, setStatus] = useState(job.status);

  const selectClass =
    "border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm";

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      {job.id && <input type="hidden" name="id" value={job.id} />}

      <div className="surface space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <FormField
            label="Job title"
            name="title"
            error={state.fieldErrors?.title}
            required
          >
            {(p) => <Input {...p} defaultValue={job.title} maxLength={140} />}
          </FormField>

          <FormField
            label="Openings"
            name="openings"
            error={state.fieldErrors?.openings}
            required
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                max={500}
                defaultValue={job.openings}
                className="tabular-nums"
              />
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Department" name="departmentId">
            {(p) => (
              <select {...p} defaultValue={job.departmentId} className={selectClass}>
                <option value="">Unassigned</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Location" name="locationId">
            {(p) => (
              <select {...p} defaultValue={job.locationId} className={selectClass}>
                <option value="">Any / remote</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Employment type" name="employmentType" required>
            {(p) => (
              <select
                {...p}
                defaultValue={job.employmentType}
                className={selectClass}
              >
                <option value="FULL_TIME">Full time</option>
                <option value="PART_TIME">Part time</option>
                <option value="CONTRACT">Contract</option>
                <option value="INTERN">Intern</option>
                <option value="CONSULTANT">Consultant</option>
              </select>
            )}
          </FormField>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField label="Hiring manager" name="hiringManagerId">
            {(p) => (
              <select
                {...p}
                defaultValue={job.hiringManagerId}
                className={selectClass}
              >
                <option value="">Not set</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField
            label="Recruiter"
            name="recruiterId"
            hint="Owns new applications by default."
          >
            {(p) => (
              <select {...p} defaultValue={job.recruiterId} className={selectClass}>
                <option value="">Not set</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            )}
          </FormField>

          <FormField label="Closes on" name="closesOn">
            {(p) => <Input {...p} type="date" defaultValue={job.closesOn} />}
          </FormField>
        </div>
      </div>

      <FormField
        label="About the role"
        name="description"
        error={state.fieldErrors?.description}
        required
        hint="This is the public advert. Markdown works — headings, lists, bold."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={12}
            defaultValue={job.description}
            maxLength={20_000}
            className="font-mono text-xs leading-relaxed"
          />
        )}
      </FormField>

      <FormField
        label="What we're looking for"
        name="requirements"
        hint="Also public. Keep the must-haves short — long lists put good people off applying."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={6}
            defaultValue={job.requirements}
            maxLength={10_000}
            className="font-mono text-xs leading-relaxed"
          />
        )}
      </FormField>

      <div className="surface space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label={`Salary band, from (${currency})`} name="minCtc">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                defaultValue={job.minCtc}
                className="tabular-nums"
              />
            )}
          </FormField>

          <FormField
            label={`Salary band, to (${currency})`}
            name="maxCtc"
            error={state.fieldErrors?.maxCtc}
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                defaultValue={job.maxCtc}
                className="tabular-nums"
              />
            )}
          </FormField>
        </div>

        <div className="flex items-start gap-3">
          <Checkbox
            id="isPublic"
            name="isPublic"
            checked={isPublic}
            onCheckedChange={(v) => setIsPublic(v === true)}
          />
          <Label htmlFor="isPublic" className="font-normal">
            List it on the public careers page
            <span className="text-muted-foreground mt-0.5 block text-xs">
              {isPublic
                ? "Anyone with the link sees the title, description and requirements — the salary band stays internal either way."
                : "Kept internal. You can still add candidates by hand."}
            </span>
          </Label>
        </div>

        <FormField
          label="Status"
          name="status"
          required
          hint={
            status === "OPEN"
              ? "Open roles accept applications."
              : "Only open roles appear on the careers page."
          }
        >
          {(p) => (
            <select
              {...p}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={selectClass}
            >
              <option value="DRAFT">Draft — not advertised</option>
              <option value="OPEN">Open — accepting applications</option>
              <option value="ON_HOLD">On hold</option>
              <option value="CLOSED">Closed</option>
              <option value="FILLED">Filled</option>
            </select>
          )}
        </FormField>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {job.id ? "Save changes" : "Create role"}
        </Button>
      </div>
    </form>
  );
}
