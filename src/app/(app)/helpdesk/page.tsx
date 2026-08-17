import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { requirePermission, can, canAny } from "@/lib/auth";
import {
  helpdeskSummary,
  listTicketCategories,
  listTickets,
  queueOwners,
} from "@/lib/queries/helpdesk";
import {
  deleteTicketCategoryAction,
  saveTicketCategoryAction,
} from "@/lib/actions/helpdesk";
import { formatRelative } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { PersonCell } from "@/components/people/person-avatar";
import { Panel } from "@/components/settings/panel";
import { RecordEditor } from "@/components/settings/record-editor";
import { RaiseTicketDialog } from "@/components/helpdesk/raise-ticket-dialog";
import {
  PriorityBadge,
  SlaBadge,
  TicketStatusBadge,
} from "@/components/helpdesk/ticket-bits";

export const metadata: Metadata = { title: "Helpdesk" };

/**
 * The HR queue.
 *
 * Sorted so live tickets come first and the SLA badge sits at the end of each
 * row, because working a queue is triage: the reader is scanning for what is
 * about to breach, not reading subjects in order.
 */
export default async function HelpdeskPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    owner?: string;
  }>;
}) {
  const session = await requirePermission("ticket.read.all", "ticket.manage");
  const filters = await searchParams;

  const [tickets, categories, summary, owners] = await Promise.all([
    listTickets(session, {
      q: filters.q,
      status: filters.status ?? "live",
      categoryId: filters.category,
      assigneeId: filters.owner,
    }),
    listTicketCategories(session),
    helpdeskSummary(session),
    queueOwners(session),
  ]);

  const mayManageQueues = can(session, "ticket.category.manage");

  return (
    <PageShell>
      <PageHeader
        title="Helpdesk"
        description="Every question employees have asked HR, with a clock on each one."
        actions={
          can(session, "ticket.raise") && (
            <RaiseTicketDialog
              label="Raise a ticket"
              queues={categories
                .filter((c) => c.isActive)
                .map((c) => ({
                  id: c.id,
                  name: c.name,
                  description: c.description,
                  slaHours: c.slaHours,
                }))}
            />
          )
        }
      />

      {summary && (
        <StatRow>
          <StatTile label="Live tickets" value={summary.open} detail="not yet resolved" />
          <StatTile
            label="Unassigned"
            value={summary.unassigned}
            detail="nobody has picked them up"
            tone={summary.unassigned > 0 ? "warning" : "positive"}
          />
          <StatTile
            label="Past SLA"
            value={summary.breaching}
            detail={`${summary.dueSoon} due within 8 hours`}
            tone={summary.breaching > 0 ? "critical" : "positive"}
          />
          <StatTile
            label="Resolved this month"
            value={summary.resolvedThisMonth}
            tone="positive"
          />
        </StatRow>
      )}

      <FilterBar
        searchPlaceholder="Search subject or body"
        searchLabel="Search tickets"
        count={tickets.length}
        countNoun={["ticket", "tickets"]}
        selects={[
          {
            key: "status",
            label: "Filter by status",
            options: [
              { value: "live", label: "Live" },
              { value: "all", label: "Everything" },
              { value: "OPEN", label: "Open" },
              { value: "IN_PROGRESS", label: "In progress" },
              { value: "WAITING", label: "Waiting" },
              { value: "RESOLVED", label: "Resolved" },
              { value: "CLOSED", label: "Closed" },
            ],
            width: "w-[9rem]",
          },
          {
            key: "category",
            label: "Filter by queue",
            options: [
              { value: "all", label: "All queues" },
              ...categories.map((c) => ({ value: c.id, label: c.name })),
            ],
          },
          {
            key: "owner",
            label: "Filter by owner",
            options: [
              { value: "all", label: "Any owner" },
              { value: "mine", label: "Mine" },
              { value: "unassigned", label: "Unassigned" },
            ],
            width: "w-[9rem]",
          },
        ]}
      />

      <div className="surface overflow-hidden">
        {tickets.length === 0 ? (
          <EmptyState
            icon={LifeBuoy}
            title="Nothing in the queue"
            description="When someone asks HR a question through the app it lands here, routed to the right queue with an SLA."
          />
        ) : (
          <ul className="divide-y">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/helpdesk/${ticket.id}`}
                  className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                >
                  <span className="text-muted-foreground w-12 shrink-0 font-mono text-xs">
                    #{ticket.number}
                  </span>

                  <div className="min-w-[14rem] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium">{ticket.subject}</p>
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {ticket.category?.name ?? "No queue"} · raised{" "}
                      {formatRelative(ticket.createdAt)}
                      {ticket._count.comments > 0 &&
                        ` · ${ticket._count.comments} repl${
                          ticket._count.comments === 1 ? "y" : "ies"
                        }`}
                    </p>
                  </div>

                  <div className="min-w-[10rem]">
                    <PersonCell
                      firstName={ticket.requester.firstName}
                      lastName={ticket.requester.lastName}
                      avatarUrl={ticket.requester.avatarUrl}
                      secondary={
                        ticket.assignee
                          ? `→ ${ticket.assignee.firstName}`
                          : "unassigned"
                      }
                      size="xs"
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <SlaBadge dueAt={ticket.dueAt} resolvedAt={ticket.resolvedAt} />
                    <TicketStatusBadge status={ticket.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      {mayManageQueues && (
        <Panel
          title="Queues"
          count={categories.length}
          description="The SLA on a queue is stamped onto each ticket when it is raised, so editing it here never moves a deadline that has already been promised."
        >
          <RecordEditor
            canManage
            noun="queue"
            addLabel="Add queue"
            emptyMessage="No queues yet."
            saveAction={saveTicketCategoryAction}
            deleteAction={deleteTicketCategoryAction}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              {
                name: "slaHours",
                label: "Resolve within (hours)",
                type: "number",
              },
              {
                name: "description",
                label: "What belongs here",
                type: "textarea",
                width: "full",
              },
              {
                name: "defaultAssigneeId",
                label: "Default owner",
                type: "select",
                width: "full",
                placeholder: "Nobody — leave in the shared queue",
                options: owners.map((o) => ({
                  value: o.id,
                  label: `${o.firstName} ${o.lastName}`,
                })),
              },
            ]}
            records={categories.map((c) => ({
              id: c.id,
              title: c.name,
              subtitle: [
                `${c.slaHours}h SLA`,
                c.defaultAssignee
                  ? `owned by ${c.defaultAssignee.firstName}`
                  : "shared queue",
                `${c._count.tickets} ticket${c._count.tickets === 1 ? "" : "s"}`,
              ].join(" · "),
              badges: c.isActive ? [] : [{ label: "Hidden", tone: "warning" as const }],
              values: {
                name: c.name,
                slaHours: String(c.slaHours),
                description: c.description ?? "",
                defaultAssigneeId: c.defaultAssigneeId ?? "",
              },
            }))}
          />
        </Panel>
      )}

      {!canAny(session, "ticket.manage") && (
        <p className="text-muted-foreground text-xs">
          You can see every ticket but not work them — replying, assigning and
          resolving need the &ldquo;work the queue&rdquo; permission.
        </p>
      )}
    </PageShell>
  );
}
