"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CircleSlash, Loader2, OctagonAlert, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { assignTaskAction, setTaskStatusAction } from "@/lib/actions/journeys";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The checklist itself.
 *
 * One click to complete, because that is the action taken ninety times out of a
 * hundred and burying it behind a menu would make the screen a chore. Skip and
 * block sit beside it as secondary buttons rather than in a dropdown: on a
 * clearance checklist "not applicable" is a legitimate outcome that HR needs to
 * be able to record without hunting for it.
 *
 * Overdue is computed on the server and passed down, so every viewer sees the
 * same answer regardless of their machine's clock or timezone.
 */

export interface JourneyTaskView {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: "PENDING" | "DONE" | "SKIPPED" | "BLOCKED";
  dueLabel: string;
  isOverdue: boolean;
  note: string | null;
  assignee: { id: string; name: string } | null;
}

export interface AssigneeOption {
  id: string;
  name: string;
}

export function JourneyTasks({
  tasks,
  assignable,
  canManage,
  canComplete,
}: {
  tasks: JourneyTaskView[];
  assignable: AssigneeOption[];
  canManage: boolean;
  canComplete: boolean;
}) {
  const grouped = groupByCategory(tasks);

  return (
    <div className="space-y-6">
      {grouped.map(([category, items]) => (
        <section key={category}>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            {category}
            <span className="ml-2 font-normal tabular-nums">
              {items.filter((t) => t.status === "DONE").length}/{items.length}
            </span>
          </h3>
          <ul className="surface divide-y overflow-hidden">
            {items.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                assignable={assignable}
                canManage={canManage}
                canComplete={canComplete}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TaskRow({
  task,
  assignable,
  canManage,
  canComplete,
}: {
  task: JourneyTaskView;
  assignable: AssigneeOption[];
  canManage: boolean;
  canComplete: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [assignee, setAssignee] = useState(task.assignee?.id ?? "");
  const router = useRouter();

  const done = task.status === "DONE";
  const skipped = task.status === "SKIPPED";
  const blocked = task.status === "BLOCKED";
  const settled = done || skipped;

  function setStatus(status: JourneyTaskView["status"]) {
    startTransition(async () => {
      const result = await setTaskStatusAction(task.id, status);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  function reassign(value: string) {
    setAssignee(value);
    startTransition(async () => {
      const result = await assignTaskAction(task.id, value || null);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(value ? "Task reassigned" : "Task unassigned");
      router.refresh();
    });
  }

  return (
    <li className={cn("flex flex-wrap items-start gap-3 p-4", settled && "opacity-70")}>
      {canComplete ? (
        <button
          type="button"
          onClick={() => setStatus(done ? "PENDING" : "DONE")}
          disabled={pending}
          aria-pressed={done}
          aria-label={done ? `Reopen ${task.title}` : `Complete ${task.title}`}
          className={cn(
            "focus-visible:ring-ring mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors outline-none focus-visible:ring-3 disabled:opacity-50",
            done
              ? "bg-success border-success text-white"
              : "border-input hover:border-foreground/40",
          )}
        >
          {pending ? (
            <Loader2 className="size-3 animate-spin" aria-hidden />
          ) : done ? (
            <Check className="size-3.5" aria-hidden />
          ) : null}
        </button>
      ) : (
        <span className="mt-0.5 size-5 shrink-0" aria-hidden />
      )}

      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done && "line-through")}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-muted-foreground measure mt-0.5 text-xs">
            {task.description}
          </p>
        )}

        <div className="text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className={cn("tabular-nums", task.isOverdue && "text-destructive font-medium")}>
            {task.isOverdue ? "Overdue — " : "Due "}
            {task.dueLabel}
          </span>
          {task.assignee && !canManage && <span>· {task.assignee.name}</span>}
          {skipped && <StatusBadge label="Skipped" tone="neutral" />}
          {blocked && <StatusBadge label="Blocked" tone="critical" />}
        </div>

        {task.note && (
          <p className="bg-muted measure mt-2 rounded-md px-2.5 py-1.5 text-xs">
            {task.note}
          </p>
        )}
      </div>

      {canManage && (
        <select
          value={assignee}
          onChange={(e) => reassign(e.target.value)}
          disabled={pending}
          aria-label={`Owner of ${task.title}`}
          className="border-input bg-background h-8 max-w-[11rem] shrink-0 rounded-lg border px-2 text-xs"
        >
          <option value="">Unassigned</option>
          {assignable.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      )}

      {canComplete && !done && (
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setStatus(skipped ? "PENDING" : "SKIPPED")}
            title={skipped ? "Un-skip" : "Not applicable"}
          >
            {skipped ? (
              <Undo2 className="size-3.5" aria-hidden />
            ) : (
              <CircleSlash className="size-3.5" aria-hidden />
            )}
            <span className="sr-only sm:not-sr-only">
              {skipped ? "Undo" : "Skip"}
            </span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setStatus(blocked ? "PENDING" : "BLOCKED")}
            title={blocked ? "Unblock" : "Mark blocked"}
          >
            <OctagonAlert className="size-3.5" aria-hidden />
            <span className="sr-only">{blocked ? "Unblock" : "Block"}</span>
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Grouped by owning function rather than listed flat. A clearance checklist is
 * worked by four different teams, and "everything IT still owes" is the
 * question each of them actually has.
 */
function groupByCategory(
  tasks: JourneyTaskView[],
): [string, JourneyTaskView[]][] {
  const map = new Map<string, JourneyTaskView[]>();
  for (const task of tasks) {
    const list = map.get(task.category) ?? [];
    list.push(task);
    map.set(task.category, list);
  }
  return Array.from(map.entries());
}
