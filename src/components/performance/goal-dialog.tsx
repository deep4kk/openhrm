"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Target } from "lucide-react";
import { toast } from "sonner";

import { saveGoalAction } from "@/lib/actions/performance";
import type { FormState } from "@/lib/actions/auth";
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

export interface GoalDraft {
  id?: string;
  title: string;
  description: string;
  level: string;
  ownerId: string;
  departmentId: string;
  parentId: string;
  metric: string;
  targetValue: string;
  currentValue: string;
  unit: string;
  weight: string;
  startDate: string;
  dueDate: string;
  status: string;
  cycleId: string;
}

interface Option {
  id: string;
  name: string;
}

/**
 * Setting a goal.
 *
 * The level picker drives which of owner/department is asked for, because a
 * company goal with an individual owner is a category error and offering both
 * fields at once invites it. Cascading is expressed by choosing a parent —
 * that is the whole of "company → department → individual" the PRD asks for,
 * with no separate hierarchy to maintain.
 */
export function GoalDialog({
  goal,
  employees,
  departments,
  parents,
  cycles,
  trigger,
}: {
  goal?: GoalDraft;
  employees: Option[];
  departments: Option[];
  parents: Option[];
  cycles: Option[];
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveGoalAction,
    {},
  );
  const [level, setLevel] = useState(goal?.level ?? "INDIVIDUAL");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(goal?.id ? "Goal updated" : "Goal set");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, goal?.id, router]);

  const selectClass =
    "border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm";

  const thisYear = new Date().getFullYear();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={(trigger as React.ReactElement) ?? <Button />}>
        {trigger ? undefined : (
          <>
            <Plus className="size-4" aria-hidden />
            Set a goal
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{goal?.id ? "Edit goal" : "Set a goal"}</DialogTitle>
          <DialogDescription>
            Give it a number where you can. A goal with a metric can report its
            own progress; one without needs someone to judge it every week.
          </DialogDescription>
        </DialogHeader>

        <form
          action={action}
          className="max-h-[70vh] space-y-5 overflow-y-auto pr-1"
        >
          <FormError message={state.error} />
          {goal?.id && <input type="hidden" name="id" value={goal.id} />}

          <FormField
            label="Goal"
            name="title"
            error={state.fieldErrors?.title}
            required
          >
            {(p) => <Input {...p} defaultValue={goal?.title} maxLength={200} />}
          </FormField>

          <FormField label="What good looks like" name="description">
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                defaultValue={goal?.description}
                maxLength={2000}
              />
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Level" name="level" required>
              {(p) => (
                <select
                  {...p}
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  className={selectClass}
                >
                  <option value="COMPANY">Company</option>
                  <option value="DEPARTMENT">Department</option>
                  <option value="INDIVIDUAL">Individual</option>
                </select>
              )}
            </FormField>

            {level === "INDIVIDUAL" ? (
              <FormField
                label="Owner"
                name="ownerId"
                error={state.fieldErrors?.ownerId}
                required
              >
                {(p) => (
                  <select {...p} defaultValue={goal?.ownerId} className={selectClass}>
                    <option value="">Choose someone…</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            ) : level === "DEPARTMENT" ? (
              <FormField
                label="Department"
                name="departmentId"
                error={state.fieldErrors?.departmentId}
                required
              >
                {(p) => (
                  <select
                    {...p}
                    defaultValue={goal?.departmentId}
                    className={selectClass}
                  >
                    <option value="">Choose a department…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            ) : (
              <FormField label="Owner" name="ownerId" hint="Company goals have no single owner.">
                {(p) => <Input {...p} disabled value="" />}
              </FormField>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Metric"
              name="metric"
              hint="What is being counted."
            >
              {(p) => (
                <Input {...p} defaultValue={goal?.metric} maxLength={120} />
              )}
            </FormField>

            <FormField label="Target" name="targetValue">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  step="0.01"
                  defaultValue={goal?.targetValue}
                  className="tabular-nums"
                />
              )}
            </FormField>

            <FormField label="Unit" name="unit">
              {(p) => (
                <Input
                  {...p}
                  defaultValue={goal?.unit}
                  maxLength={20}
                  placeholder="%, ₹, tickets"
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Starts"
              name="startDate"
              error={state.fieldErrors?.startDate}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  defaultValue={goal?.startDate ?? `${thisYear}-01-01`}
                />
              )}
            </FormField>

            <FormField
              label="Due"
              name="dueDate"
              error={state.fieldErrors?.dueDate}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  defaultValue={goal?.dueDate ?? `${thisYear}-12-31`}
                />
              )}
            </FormField>

            <FormField
              label="Weight"
              name="weight"
              hint="Relative importance, 1–100."
              required
            >
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={goal?.weight ?? "10"}
                  className="tabular-nums"
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <FormField
              label="Rolls up into"
              name="parentId"
              error={state.fieldErrors?.parentId}
              hint="Cascade from a company or department goal."
            >
              {(p) => (
                <select {...p} defaultValue={goal?.parentId} className={selectClass}>
                  <option value="">Nothing — stands alone</option>
                  {parents
                    .filter((parent) => parent.id !== goal?.id)
                    .map((parent) => (
                      <option key={parent.id} value={parent.id}>
                        {parent.name}
                      </option>
                    ))}
                </select>
              )}
            </FormField>

            <FormField label="Review cycle" name="cycleId">
              {(p) => (
                <select {...p} defaultValue={goal?.cycleId} className={selectClass}>
                  <option value="">Not tied to a cycle</option>
                  {cycles.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>

            <FormField label="Status" name="status" required>
              {(p) => (
                <select
                  {...p}
                  defaultValue={goal?.status ?? "ACTIVE"}
                  className={selectClass}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="ACTIVE">On track</option>
                  <option value="AT_RISK">At risk</option>
                  <option value="ACHIEVED">Achieved</option>
                  <option value="MISSED">Missed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              )}
            </FormField>
          </div>

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
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Target className="size-4" aria-hidden />
              )}
              {goal?.id ? "Save goal" : "Set goal"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
