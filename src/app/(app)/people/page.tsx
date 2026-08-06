import type { Metadata } from "next";
import Link from "next/link";
import { Network, Plus, Users } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { listEmployees, getOrgOptions } from "@/lib/queries/employees";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { PeopleFilters } from "@/components/people/people-filters";
import { PersonCell } from "@/components/people/person-avatar";
import { EmployeeStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await requirePermission(
    "employee.read.all",
    "employee.read.team",
    "directory.read",
  );

  const params = await searchParams;
  const [{ employees, total, page, perPage, directoryOnly }, options] =
    await Promise.all([
      listEmployees(session, {
        search: params.q,
        departmentId: params.department,
        locationId: params.location,
        status: params.status,
        page: Number(params.page) || 1,
      }),
      getOrgOptions(session),
    ]);

  const canAdd = can(session, "employee.create");
  const totalPages = Math.max(Math.ceil(total / perPage), 1);

  return (
    <PageShell>
      <PageHeader
        title="People"
        description={
          directoryOnly
            ? "Your colleagues across the organisation."
            : "Everyone on the team, with their role and reporting line."
        }
        actions={
          <>
            <LinkButton href="/people/org-chart" variant="outline">
              <Network className="size-4" aria-hidden="true" />
              Org chart
            </LinkButton>
            {canAdd && (
              <LinkButton href="/people/new">
                <Plus className="size-4" aria-hidden="true" />
                Add employee
              </LinkButton>
            )}
          </>
        }
      />

      <PeopleFilters
        departments={options.departments.map((d) => ({ id: d.id, name: d.name }))}
        locations={options.locations.map((l) => ({ id: l.id, name: l.name }))}
        total={total}
      />

      <div className="surface overflow-hidden">
        {employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nobody matches those filters"
            description="Try a different department or clear the search to see everyone."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="min-w-[13rem]">Name</TableHead>
                  <TableHead className="min-w-[10rem]">Designation</TableHead>
                  <TableHead className="min-w-[8rem]">Department</TableHead>
                  <TableHead className="min-w-[9rem]">Manager</TableHead>
                  <TableHead className="min-w-[7rem]">Location</TableHead>
                  <TableHead className="min-w-[7rem]">Joined</TableHead>
                  <TableHead className="min-w-[6rem]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id} className="group">
                    <TableCell>
                      {/* The whole row is reachable by keyboard through this
                          single link, rather than making every cell tabbable. */}
                      <Link
                        href={`/people/${employee.id}`}
                        className="focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <PersonCell
                          firstName={employee.firstName}
                          lastName={employee.lastName}
                          avatarUrl={employee.avatarUrl}
                          secondary={employee.employeeCode}
                        />
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {employee.designation?.title ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {employee.department?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {employee.manager
                        ? `${employee.manager.firstName} ${employee.manager.lastName}`
                        : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {employee.location?.name ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm tabular-nums">
                      {formatDate(employee.dateOfJoining)}
                    </TableCell>
                    <TableCell>
                      <EmployeeStatusBadge status={employee.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <nav
          className="flex items-center justify-between"
          aria-label="Pagination"
        >
          <p className="text-muted-foreground text-sm tabular-nums">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <LinkButton
              variant="outline"
              size="sm"
              disabled={page <= 1}
              href={buildPageHref(params, page - 1)}
            >
              Previous
            </LinkButton>
            <LinkButton
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              href={buildPageHref(params, page + 1)}
            >
              Next
            </LinkButton>
          </div>
        </nav>
      )}
    </PageShell>
  );
}

function buildPageHref(
  params: Record<string, string | undefined>,
  page: number,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value && key !== "page") query.set(key, value);
  }
  if (page > 1) query.set("page", String(page));
  const qs = query.toString();
  return qs ? `/people?${qs}` : "/people";
}
