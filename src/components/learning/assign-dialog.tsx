"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { assignCourseAction } from "@/lib/actions/learning";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface AssignableEmployee {
  id: string;
  name: string;
  department: string | null;
}

/**
 * Assigning training.
 *
 * Selection is by person, with a "whole department" shortcut, because that is
 * how the request actually arrives: "everyone in Sales needs the new POSH
 * module." Offering department-level assignment as its own concept in the data
 * model would then need reconciling every time someone changes team — this way
 * the enrollment rows are the record, and they stay put.
 */
export function AssignCourseDialog({
  courseId,
  courseTitle,
  employees,
}: {
  courseId: string;
  courseTitle: string;
  employees: AssignableEmployee[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dueOn, setDueOn] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const departments = Array.from(
    new Set(employees.map((e) => e.department).filter(Boolean)),
  ) as string[];

  function toggle(id: string) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDepartment(department: string) {
    const ids = employees
      .filter((e) => e.department === department)
      .map((e) => e.id);
    const allSelected = ids.every((id) => selected.has(id));

    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />} disabled={employees.length === 0}>
        <UserPlus className="size-4" aria-hidden />
        Assign
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign {courseTitle}</DialogTitle>
          <DialogDescription>
            Everyone you pick gets a notification and it appears in their space.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="assign-due">Due by</Label>
            <Input
              id="assign-due"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Optional. Overdue training is flagged on the tracking screen.
            </p>
          </div>

          {departments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t pt-4">
              {departments.map((department) => (
                <Button
                  key={department}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => toggleDepartment(department)}
                >
                  All of {department}
                </Button>
              ))}
            </div>
          )}

          <ul className="max-h-64 space-y-1 overflow-y-auto border-t pt-4">
            {employees.map((employee) => (
              <li key={employee.id} className="flex items-center gap-3">
                <Checkbox
                  id={`assign-${employee.id}`}
                  checked={selected.has(employee.id)}
                  onCheckedChange={() => toggle(employee.id)}
                />
                <Label
                  htmlFor={`assign-${employee.id}`}
                  className="flex-1 font-normal"
                >
                  {employee.name}
                  {employee.department && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {employee.department}
                    </span>
                  )}
                </Label>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <p className="text-muted-foreground text-sm tabular-nums">
              {selected.size} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                disabled={pending || selected.size === 0}
                onClick={() =>
                  startTransition(async () => {
                    const result = await assignCourseAction(
                      courseId,
                      Array.from(selected),
                      dueOn || undefined,
                    );
                    if (result.error) {
                      toast.error(result.error);
                      return;
                    }
                    toast.success(
                      `Assigned to ${selected.size} ${selected.size === 1 ? "person" : "people"}`,
                    );
                    setSelected(new Set());
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Assign
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
