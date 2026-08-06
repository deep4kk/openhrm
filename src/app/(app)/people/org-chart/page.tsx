import type { Metadata } from "next";
import { Network } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { getOrgChart } from "@/lib/queries/employees";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { OrgChart } from "@/components/people/org-chart";

export const metadata: Metadata = { title: "Org chart" };

/**
 * The org chart is a read of the same reporting lines the permission system
 * uses to decide what a manager can see, so it is scoped the same way: a
 * manager gets their own subtree with themselves at the top, not a truncated
 * view of the company's.
 */
export default async function OrgChartPage() {
  const session = await requirePermission(
    "employee.read.all",
    "employee.read.team",
    "directory.read",
  );

  const { roots, unassigned, total, partial } = await getOrgChart(session);
  const canOpenProfile =
    can(session, "employee.read.all") || can(session, "employee.read.team");

  return (
    <PageShell className="max-w-5xl">
      <PageHeader
        title="Org chart"
        description={
          partial
            ? "Your reporting line. Managers see their own team; the whole company needs org-wide access."
            : "Who reports to whom, built from the reporting manager on each employee record."
        }
        actions={
          <LinkButton href="/people" variant="outline" size="sm">
            Back to people
          </LinkButton>
        }
      />

      {total === 0 ? (
        <div className="surface">
          <EmptyState
            icon={Network}
            title="No one to chart yet"
            description="Once employees have a reporting manager set on their record, the hierarchy appears here."
            action={
              can(session, "employee.create") ? (
                <LinkButton href="/people/new">Add an employee</LinkButton>
              ) : undefined
            }
          />
        </div>
      ) : roots.length === 0 && unassigned.length > 0 ? (
        <div className="surface">
          <EmptyState
            icon={Network}
            title="No reporting lines set"
            description={`All ${total} people are visible, but none has a reporting manager — so there is no hierarchy to draw yet. Set a manager on an employee record to start the chart.`}
            action={
              can(session, "employee.update") ? (
                <LinkButton href="/people">Open people</LinkButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="surface p-4 sm:p-5">
          <OrgChart
            roots={roots}
            unassigned={unassigned}
            canOpenProfile={canOpenProfile}
          />
        </div>
      )}
    </PageShell>
  );
}
