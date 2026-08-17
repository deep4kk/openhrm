import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ClipboardList } from "lucide-react";

import { requireAuth, can, canAny } from "@/lib/auth";
import { getResignation, settlementInputs } from "@/lib/queries/exits";
import { formatDate, today } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { PersonAvatar } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { Field } from "@/components/settings/panel";
import { LinkButton } from "@/components/link-button";
import {
  CompleteExitButton,
  ResignationDecision,
  WithdrawResignationButton,
} from "@/components/exits/exit-controls";
import { ExitInterviewForm } from "@/components/exits/exit-interview-form";
import { SettlementForm } from "@/components/exits/settlement-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireAuth();
  const { id } = await params;
  const resignation = await getResignation(session, id);
  return {
    title: resignation
      ? `Exit — ${resignation.employee.firstName} ${resignation.employee.lastName}`
      : "Exit",
  };
}

const STATUS = {
  SUBMITTED: { label: "Awaiting decision", tone: "warning" as const },
  ACCEPTED: { label: "On notice", tone: "info" as const },
  REJECTED: { label: "Declined", tone: "neutral" as const },
  WITHDRAWN: { label: "Withdrawn", tone: "neutral" as const },
  COMPLETED: { label: "Left", tone: "neutral" as const },
};

/**
 * One exit, end to end.
 *
 * Clearance, exit interview and settlement in the order they happen, each
 * gated on its own permission — the settlement calculator only appears for
 * `settlement.manage`, so an HR generalist can run the clearance without
 * seeing anyone's gratuity figure.
 */
export default async function ExitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  const resignation = await getResignation(session, id);
  if (!resignation) notFound();

  const isLeaver = resignation.employeeId === session.employee?.id;
  const mayManage = can(session, "exit.manage");
  const maySettle = can(session, "settlement.manage");

  if (!isLeaver && !canAny(session, "exit.read.all", "exit.manage", "settlement.manage")) {
    notFound();
  }

  const inputs = maySettle ? await settlementInputs(session, id) : null;

  const tasks = resignation.clearance?.tasks ?? [];
  const now = today();
  const cleared = tasks.filter(
    (t) => t.status === "DONE" || t.status === "SKIPPED",
  ).length;
  const outstanding = tasks.length - cleared;

  const lastDay =
    resignation.lastWorkingDayApproved ?? resignation.lastWorkingDayRequested;
  const status = STATUS[resignation.status as keyof typeof STATUS];

  const blockers: string[] = [];
  if (outstanding > 0) {
    blockers.push(`${outstanding} clearance task${outstanding === 1 ? "" : "s"} open`);
  }
  if (resignation.settlement && resignation.settlement.status !== "PAID") {
    blockers.push("Full and final settlement not paid");
  }

  return (
    <PageShell className="max-w-4xl">
      <Link
        href={isLeaver && !mayManage ? "/me" : "/exits"}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {isLeaver && !mayManage ? "My space" : "Exits"}
      </Link>

      <div className="surface flex flex-wrap items-start gap-4 p-5">
        <PersonAvatar
          firstName={resignation.employee.firstName}
          lastName={resignation.employee.lastName}
          avatarUrl={resignation.employee.avatarUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <PageHeader
            title={`${resignation.employee.firstName} ${resignation.employee.lastName}`}
            description={[
              resignation.employee.designation?.title,
              resignation.employee.department?.name,
              resignation.employee.employeeCode,
            ]
              .filter(Boolean)
              .join(" · ")}
            actions={
              (isLeaver || mayManage) &&
              ["SUBMITTED", "ACCEPTED"].includes(resignation.status) ? (
                <WithdrawResignationButton id={resignation.id} />
              ) : undefined
            }
          />

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <StatusBadge label={status.label} tone={status.tone} />
            <span className="text-muted-foreground text-xs tabular-nums">
              Joined {formatDate(resignation.employee.dateOfJoining)} · last day{" "}
              {formatDate(lastDay)}
              {!resignation.lastWorkingDayApproved && " (requested)"}
            </span>
            <span className="text-muted-foreground text-xs">
              {resignation.exitType.toLowerCase().replace(/_/g, " ")}
            </span>
          </div>
        </div>
      </div>

      <section className="surface p-5">
        <h2 className="text-sm font-semibold">Why they are leaving</h2>
        <p className="measure mt-2 text-sm whitespace-pre-wrap">
          {resignation.reason}
        </p>
        {resignation.decisionNote && (
          <p className="bg-muted measure mt-3 rounded-md px-3 py-2 text-sm">
            <span className="font-medium">
              {resignation.decidedBy
                ? `${resignation.decidedBy.firstName}:`
                : "Note:"}
            </span>{" "}
            {resignation.decisionNote}
          </p>
        )}
        <dl className="mt-4 grid gap-x-6 gap-y-3 border-t pt-4 sm:grid-cols-3">
          <Field
            label="Submitted"
            value={formatDate(resignation.submittedAt)}
          />
          <Field
            label="Notice period"
            value={`${resignation.noticePeriodDays} days`}
          />
          <Field
            label="Reports to"
            value={
              resignation.employee.manager
                ? `${resignation.employee.manager.firstName} ${resignation.employee.manager.lastName}`
                : null
            }
          />
        </dl>
      </section>

      {mayManage && resignation.status === "SUBMITTED" && (
        <ResignationDecision
          resignationId={resignation.id}
          requestedDate={resignation.lastWorkingDayRequested
            .toISOString()
            .slice(0, 10)}
        />
      )}

      {resignation.clearance && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold">
              Clearance
              <span className="text-muted-foreground ml-2 font-normal tabular-nums">
                {cleared}/{tasks.length}
              </span>
            </h2>
            <LinkButton
              href={`/journeys/${resignation.clearance.id}`}
              variant="outline"
              size="sm"
            >
              <ClipboardList className="size-4" aria-hidden />
              Work the checklist
            </LinkButton>
          </div>

          <div className="surface space-y-4 p-5">
            <ProgressBar
              percent={tasks.length === 0 ? 0 : (cleared / tasks.length) * 100}
              label={`${cleared} of ${tasks.length} done`}
              tone={cleared === tasks.length ? "positive" : "brand"}
            />

            <ul className="divide-y">
              {tasks.map((task) => {
                const late =
                  task.status === "PENDING" && task.dueDate && task.dueDate < now;
                return (
                  <li
                    key={task.id}
                    className="flex items-center justify-between gap-3 py-2 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">{task.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {task.category}
                        {task.assignee &&
                          ` · ${task.assignee.firstName} ${task.assignee.lastName}`}
                        {task.dueDate && ` · due ${formatDate(task.dueDate)}`}
                      </p>
                    </div>
                    {task.status === "DONE" ? (
                      <StatusBadge label="Done" tone="positive" />
                    ) : task.status === "SKIPPED" ? (
                      <StatusBadge label="N/A" tone="neutral" />
                    ) : task.status === "BLOCKED" ? (
                      <StatusBadge label="Blocked" tone="critical" />
                    ) : (
                      <StatusBadge
                        label={late ? "Overdue" : "Pending"}
                        tone={late ? "critical" : "warning"}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {(isLeaver || mayManage) && resignation.status !== "SUBMITTED" && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Exit interview</h2>
          <div className="surface p-5">
            <ExitInterviewForm
              resignationId={resignation.id}
              isLeaver={isLeaver}
              existing={
                resignation.exitInterview
                  ? {
                      primaryReason: resignation.exitInterview.primaryReason,
                      overallRating: resignation.exitInterview.overallRating,
                      wouldRecommend: resignation.exitInterview.wouldRecommend,
                      whatWorked: resignation.exitInterview.whatWorked,
                      whatDidNot: resignation.exitInterview.whatDidNot,
                      suggestions: resignation.exitInterview.suggestions,
                      submittedAt: resignation.exitInterview.submittedAt,
                      conductedByName: resignation.exitInterview.conductedBy
                        ? `${resignation.exitInterview.conductedBy.firstName} ${resignation.exitInterview.conductedBy.lastName}`
                        : null,
                    }
                  : null
              }
            />
          </div>
        </section>
      )}

      {maySettle && inputs && resignation.status === "ACCEPTED" && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Full and final settlement</h2>
          <SettlementForm
            resignationId={resignation.id}
            currency={session.org.currency}
            inputs={inputs}
            existing={
              resignation.settlement
                ? {
                    status: resignation.settlement.status,
                    leaveEncashmentDays: Number(
                      resignation.settlement.leaveEncashmentDays,
                    ),
                    leaveEncashmentAmount: Number(
                      resignation.settlement.leaveEncashmentAmount,
                    ),
                    gratuityAmount: Number(resignation.settlement.gratuityAmount),
                    pendingSalary: Number(resignation.settlement.pendingSalary),
                    pendingReimbursements: Number(
                      resignation.settlement.pendingReimbursements,
                    ),
                    loanRecovery: Number(resignation.settlement.loanRecovery),
                    noticePayRecovery: Number(
                      resignation.settlement.noticePayRecovery,
                    ),
                    otherDeductions: Number(
                      resignation.settlement.otherDeductions,
                    ),
                    netPayable: Number(resignation.settlement.netPayable),
                    note: resignation.settlement.note,
                    approvedByName:
                      resignation.settlement.approvedBy?.name ?? null,
                  }
                : null
            }
          />
        </section>
      )}

      {mayManage && resignation.status === "ACCEPTED" && (
        <CompleteExitButton id={resignation.id} blockers={blockers} />
      )}
    </PageShell>
  );
}
