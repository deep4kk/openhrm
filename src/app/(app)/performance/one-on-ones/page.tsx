import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, MessagesSquare } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { listOneOnOnes } from "@/lib/queries/performance";
import { getDirectReports } from "@/lib/scope";
import { orgDb } from "@/lib/db";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { OneOnOneDialog } from "@/components/performance/one-on-one-dialog";

export const metadata: Metadata = { title: "1:1s" };

/**
 * The 1:1 log.
 *
 * A 1:1 is between two people and is visible to exactly those two — not to HR,
 * not to skip-levels. That is enforced in `listOneOnOnes`, and it is the reason
 * anyone writes anything honest in the notes field.
 */
export default async function OneOnOnesPage() {
  const session = await requirePermission("oneonone.manage", "review.participate");

  const [meetings, reports] = await Promise.all([
    listOneOnOnes(session),
    session.employee && can(session, "oneonone.manage")
      ? getDirectReports(orgDb(session.org.id), session.employee.id)
      : Promise.resolve([]),
  ]);

  const mayLog = can(session, "oneonone.manage") && reports.length > 0;

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/performance"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Performance
      </Link>

      <PageHeader
        title="1:1s"
        description="Agendas, notes and what each of you agreed to do next. Visible only to the two people in the conversation."
        actions={
          mayLog && (
            <OneOnOneDialog
              reports={reports.map((r) => ({
                id: r.id,
                name: `${r.firstName} ${r.lastName}`,
              }))}
            />
          )
        }
      />

      {meetings.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={MessagesSquare}
            title="Nothing logged yet"
            description={
              mayLog
                ? "Write down what you agreed and it is there next time — which is the whole difference between a 1:1 that compounds and one that repeats."
                : "When your manager logs a 1:1 with you, it appears here."
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {meetings.map((meeting) => {
            const isManager = meeting.managerId === session.employee?.id;
            const other = isManager ? meeting.employee : meeting.manager;

            return (
              <li key={meeting.id} className="surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <PersonCell
                    firstName={other.firstName}
                    lastName={other.lastName}
                    avatarUrl={isManager ? meeting.employee.avatarUrl : null}
                    secondary={isManager ? "your report" : "your manager"}
                    size="sm"
                  />
                  <div className="flex items-center gap-2">
                    {meeting.completedAt ? (
                      <StatusBadge label="Held" tone="positive" />
                    ) : (
                      <StatusBadge label="Scheduled" tone="info" />
                    )}
                    <time
                      className="text-muted-foreground text-xs tabular-nums"
                      dateTime={meeting.scheduledAt.toISOString()}
                    >
                      {formatDate(meeting.scheduledAt)}
                    </time>
                  </div>
                </div>

                {meeting.agenda && (
                  <Block label="Agenda" body={meeting.agenda} />
                )}
                {meeting.notes && <Block label="Notes" body={meeting.notes} />}
                {meeting.actionItems && (
                  <Block label="Agreed next steps" body={meeting.actionItems} />
                )}

                {isManager && (
                  <div className="mt-4 border-t pt-3">
                    <OneOnOneDialog
                      reports={[
                        {
                          id: meeting.employeeId,
                          name: `${meeting.employee.firstName} ${meeting.employee.lastName}`,
                        },
                      ]}
                      meeting={{
                        id: meeting.id,
                        employeeId: meeting.employeeId,
                        scheduledAt: toLocalInput(meeting.scheduledAt),
                        agenda: meeting.agenda ?? "",
                        notes: meeting.notes ?? "",
                        actionItems: meeting.actionItems ?? "",
                        completed: meeting.completedAt !== null,
                      }}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="mt-4">
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="measure mt-1 text-sm whitespace-pre-wrap">{body}</p>
    </div>
  );
}

/** `datetime-local` wants a local-ish ISO string without the zone suffix. */
function toLocalInput(date: Date): string {
  return date.toISOString().slice(0, 16);
}
