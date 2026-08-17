import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";

import { requirePermission, can, canAny } from "@/lib/auth";
import {
  getTicket,
  listTicketCategories,
  queueOwners,
} from "@/lib/queries/helpdesk";
import { formatDate, formatRelative } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { Field } from "@/components/settings/panel";
import {
  PriorityBadge,
  SlaBadge,
  TicketStatusBadge,
} from "@/components/helpdesk/ticket-bits";
import {
  TicketControls,
  TicketReply,
} from "@/components/helpdesk/ticket-workspace";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(
    "ticket.raise",
    "ticket.read.all",
    "ticket.manage",
  );
  const { id } = await params;
  const ticket = await getTicket(session, id);
  return { title: ticket ? `#${ticket.number} ${ticket.subject}` : "Ticket" };
}

/**
 * One ticket, as a conversation.
 *
 * Internal notes are visually distinct rather than merely labelled, and they
 * are excluded from the query entirely for anyone who cannot work the queue —
 * so a styling mistake on this page cannot become a disclosure.
 */
export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "ticket.raise",
    "ticket.read.all",
    "ticket.manage",
  );

  const { id } = await params;
  const ticket = await getTicket(session, id);
  if (!ticket) notFound();

  const worksQueue = can(session, "ticket.manage");
  const isRequester = ticket.requesterId === session.employee?.id;
  const canReply =
    (worksQueue || isRequester) &&
    ticket.status !== "CLOSED";

  const [owners, queues] = await Promise.all([
    worksQueue ? queueOwners(session) : Promise.resolve([]),
    worksQueue ? listTicketCategories(session) : Promise.resolve([]),
  ]);

  return (
    <PageShell className="max-w-5xl">
      <Link
        href={canAny(session, "ticket.read.all", "ticket.manage") ? "/helpdesk" : "/me"}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {canAny(session, "ticket.read.all", "ticket.manage") ? "Helpdesk" : "My space"}
      </Link>

      <PageHeader
        title={ticket.subject}
        description={`#${ticket.number} · ${ticket.category?.name ?? "No queue"} · raised ${formatRelative(ticket.createdAt)}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <TicketStatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        <SlaBadge dueAt={ticket.dueAt} resolvedAt={ticket.resolvedAt} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <article className="surface p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <PersonCell
                firstName={ticket.requester.firstName}
                lastName={ticket.requester.lastName}
                avatarUrl={ticket.requester.avatarUrl}
                secondary={
                  ticket.requester.department?.name ??
                  ticket.requester.employeeCode
                }
                size="sm"
              />
              <time
                className="text-muted-foreground text-xs"
                dateTime={ticket.createdAt.toISOString()}
              >
                {formatDate(ticket.createdAt)}
              </time>
            </div>
            <p className="measure text-sm whitespace-pre-wrap">{ticket.body}</p>
          </article>

          {ticket.comments.map((comment) => (
            <article
              key={comment.id}
              className={
                comment.isInternal
                  ? "border-warning/40 bg-warning-subtle rounded-lg border p-4"
                  : "surface p-4"
              }
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {comment.author?.name ?? "Someone"}
                  {comment.isInternal && (
                    <span className="text-warning ml-2 inline-flex items-center gap-1 text-xs font-normal">
                      <Lock className="size-3" aria-hidden />
                      Internal note
                    </span>
                  )}
                </p>
                <time
                  className="text-muted-foreground text-xs"
                  dateTime={comment.createdAt.toISOString()}
                >
                  {formatRelative(comment.createdAt)}
                </time>
              </div>
              <p className="measure text-sm whitespace-pre-wrap">{comment.body}</p>
            </article>
          ))}

          {canReply ? (
            <TicketReply ticketId={ticket.id} canWriteInternal={worksQueue} />
          ) : (
            <p className="text-muted-foreground text-sm">
              This ticket is closed. Raise a new one if something is still
              outstanding.
            </p>
          )}
        </div>

        <aside className="space-y-4">
          {worksQueue ? (
            <TicketControls
              ticketId={ticket.id}
              status={ticket.status}
              assigneeId={ticket.assigneeId}
              priority={ticket.priority}
              categoryId={ticket.categoryId}
              owners={owners.map((o) => ({
                id: o.id,
                name: `${o.firstName} ${o.lastName}`,
              }))}
              queues={queues
                .filter((q) => q.isActive)
                .map((q) => ({ id: q.id, name: q.name }))}
            />
          ) : (
            <div className="surface p-4">
              <h2 className="mb-3 text-sm font-semibold">Details</h2>
              <dl className="space-y-3">
                <Field label="Queue" value={ticket.category?.name} />
                <Field
                  label="Owner"
                  value={
                    ticket.assignee
                      ? `${ticket.assignee.firstName} ${ticket.assignee.lastName}`
                      : "Not yet picked up"
                  }
                />
                <Field
                  label="Answer expected"
                  value={ticket.dueAt ? formatDate(ticket.dueAt) : null}
                />
              </dl>
            </div>
          )}

          <div className="surface p-4">
            <h2 className="mb-3 text-sm font-semibold">Timeline</h2>
            <dl className="space-y-3">
              <Field label="Raised" value={formatDate(ticket.createdAt)} />
              <Field
                label="First reply"
                value={
                  ticket.firstResponseAt
                    ? formatRelative(ticket.firstResponseAt)
                    : "Not yet"
                }
              />
              <Field
                label="Resolved"
                value={ticket.resolvedAt ? formatDate(ticket.resolvedAt) : null}
              />
            </dl>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
