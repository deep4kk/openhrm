import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { resolveEmployeeScope, employeeSelfFilter } from "../scope";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Employee reads.
 *
 * Every function here takes the session and applies the caller's scope before
 * touching the database, so a manager querying "all employees" gets their team
 * and nothing else — the filtering is not left to the page.
 */

export interface EmployeeFilters {
  search?: string;
  departmentId?: string;
  locationId?: string;
  status?: string;
  page?: number;
  perPage?: number;
}

export async function listEmployees(
  session: AuthContext,
  filters: EmployeeFilters = {},
) {
  const db = orgDb(session.org.id);

  // Directory access is the floor: someone who can only read the directory
  // still sees names and departments, just not the full record.
  const scope = await resolveEmployeeScope(session, "employee.read");
  const directoryOnly =
    !scope && session.role.permissions.includes("directory.read");

  if (!scope && !directoryOnly) {
    return { employees: [], total: 0, page: 1, perPage: 25, directoryOnly: false };
  }

  const perPage = Math.min(Math.max(filters.perPage ?? 25, 5), 100);
  const page = Math.max(filters.page ?? 1, 1);

  const where: Prisma.EmployeeWhereInput = {
    ...(scope ? employeeSelfFilter(scope) : {}),
    ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
    ...(filters.locationId ? { locationId: filters.locationId } : {}),
    ...(filters.status
      ? { status: filters.status as Prisma.EnumEmployeeStatusFilter["equals"] }
      : { status: { not: "EXITED" } }),
    ...(filters.search
      ? {
          OR: [
            { firstName: { contains: filters.search, mode: "insensitive" } },
            { lastName: { contains: filters.search, mode: "insensitive" } },
            { workEmail: { contains: filters.search, mode: "insensitive" } },
            { employeeCode: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [employees, total] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
        location: { select: { id: true, name: true } },
        manager: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.employee.count({ where }),
  ]);

  return {
    employees,
    total,
    page,
    perPage,
    directoryOnly,
  };
}

export async function getEmployee(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);

  return db.employee.findFirst({
    where: { id },
    include: {
      department: true,
      designation: true,
      location: true,
      shift: true,
      manager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          designation: { select: { title: true } },
        },
      },
      reports: {
        where: { status: { not: "EXITED" } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          designation: { select: { title: true } },
        },
        orderBy: { firstName: "asc" },
      },
      user: { select: { id: true, email: true, lastLoginAt: true, role: true } },
      customValues: { include: { definition: true } },
    },
  });
}

/** Options used by filters and forms — cheap, cached per request by React. */
export async function getOrgOptions(session: AuthContext) {
  const db = orgDb(session.org.id);

  const [departments, designations, locations, shifts] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" } }),
    db.designation.findMany({ orderBy: [{ level: "desc" }, { title: "asc" }] }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.shift.findMany({ orderBy: { name: "asc" } }),
  ]);

  return { departments, designations, locations, shifts };
}

/** Managers to pick from when assigning a reporting line. */
export async function getManagerOptions(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.employee.findMany({
    where: { status: { not: "EXITED" } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: { select: { title: true } },
    },
    orderBy: [{ firstName: "asc" }],
  });
}

/**
 * The next employee code in sequence.
 *
 * Reads the highest numeric suffix rather than counting rows, so deleting an
 * employee doesn't cause the next hire to reuse a code.
 */
export async function nextEmployeeCode(session: AuthContext): Promise<string> {
  const db = orgDb(session.org.id);
  const latest = await db.employee.findFirst({
    orderBy: { employeeCode: "desc" },
    select: { employeeCode: true },
  });

  if (!latest) return "EMP-001";

  const match = latest.employeeCode.match(/^(.*?)(\d+)$/);
  if (!match) return `EMP-${String(Date.now()).slice(-6)}`;

  const [, prefix, digits] = match;
  const next = String(Number(digits) + 1).padStart(digits!.length, "0");
  return `${prefix}${next}`;
}

/** Headcount by department, for the dashboard and reports. */
export async function headcountByDepartment(session: AuthContext) {
  const db = orgDb(session.org.id);

  const [grouped, departments] = await Promise.all([
    db.employee.groupBy({
      by: ["departmentId"],
      where: { status: { not: "EXITED" } },
      _count: { _all: true },
    }),
    db.department.findMany({ select: { id: true, name: true } }),
  ]);

  const nameById = new Map(departments.map((d) => [d.id, d.name]));

  return grouped
    .map((row) => ({
      departmentId: row.departmentId,
      name: row.departmentId
        ? (nameById.get(row.departmentId) ?? "Unknown")
        : "Unassigned",
      count: row._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function headcountSummary(session: AuthContext) {
  const db = orgDb(session.org.id);

  const [active, onLeave, notice, joinedThisMonth, exitedThisYear] =
    await Promise.all([
      db.employee.count({ where: { status: { in: ["ACTIVE", "ON_LEAVE"] } } }),
      db.employee.count({ where: { status: "ON_LEAVE" } }),
      db.employee.count({ where: { status: "NOTICE_PERIOD" } }),
      db.employee.count({
        where: {
          dateOfJoining: {
            gte: new Date(
              Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1),
            ),
          },
        },
      }),
      db.employee.count({
        where: {
          status: "EXITED",
          dateOfExit: {
            gte: new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1)),
          },
        },
      }),
    ]);

  return { active, onLeave, notice, joinedThisMonth, exitedThisYear };
}

// ---------------------------------------------------------------------------
// Org chart
// ---------------------------------------------------------------------------

export interface OrgChartNode {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  location: string | null;
  /** Everyone below this person, however deep. Drives the "+N" summary. */
  totalReports: number;
  children: OrgChartNode[];
}

export interface OrgChartResult {
  roots: OrgChartNode[];
  /** People visible to the caller whose manager is not set and who lead nobody. */
  unassigned: OrgChartNode[];
  total: number;
  /** True when the caller only sees their own reporting line, not the whole org. */
  partial: boolean;
}

/**
 * The reporting tree, restricted to whoever the caller may read.
 *
 * Built in one query and assembled in memory rather than with a recursive CTE:
 * the whole visible set is needed anyway to draw the chart, so fetching it once
 * and linking parents to children is both fewer round trips and simpler to read.
 *
 * A manager sees their own subtree with themselves at the top. That falls out of
 * the scoping naturally — their own manager isn't in the visible set, so they
 * become a root rather than a dangling child.
 */
export async function getOrgChart(
  session: AuthContext,
): Promise<OrgChartResult> {
  const db = orgDb(session.org.id);

  const scope = await resolveEmployeeScope(session, "employee.read");
  const directoryOnly =
    !scope && session.role.permissions.includes("directory.read");

  if (!scope && !directoryOnly) {
    return { roots: [], unassigned: [], total: 0, partial: true };
  }

  const employees = await db.employee.findMany({
    where: {
      ...(scope ? employeeSelfFilter(scope) : {}),
      status: { not: "EXITED" },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      employeeCode: true,
      managerId: true,
      designation: { select: { title: true, level: true } },
      department: { select: { name: true } },
      location: { select: { name: true } },
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  });

  const nodes = new Map<string, OrgChartNode>();
  for (const employee of employees) {
    nodes.set(employee.id, {
      id: employee.id,
      firstName: employee.firstName,
      lastName: employee.lastName,
      avatarUrl: employee.avatarUrl,
      employeeCode: employee.employeeCode,
      designation: employee.designation?.title ?? null,
      department: employee.department?.name ?? null,
      location: employee.location?.name ?? null,
      totalReports: 0,
      children: [],
    });
  }

  const managerOf = new Map(employees.map((e) => [e.id, e.managerId]));

  const roots: OrgChartNode[] = [];
  for (const employee of employees) {
    const node = nodes.get(employee.id)!;
    // A manager outside the visible set is treated as absent, which is what
    // makes a scoped view come out as a well-formed tree instead of orphans.
    // Self-management is treated the same way rather than as a one-node loop.
    const parent =
      employee.managerId && employee.managerId !== employee.id
        ? nodes.get(employee.managerId)
        : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const seniority = new Map(
    employees.map((e) => [e.id, e.designation?.level ?? 0]),
  );

  const visited = new Set<string>();

  // Most senior first, then alphabetical — the order a person would draw it.
  function sortTree(node: OrgChartNode): number {
    if (visited.has(node.id)) {
      // Unreachable once cycles are broken below; kept as a hard stop so bad
      // data can never recurse forever here or in the renderer.
      node.children = [];
      return 0;
    }
    visited.add(node.id);

    node.children.sort(
      (a, b) =>
        (seniority.get(b.id) ?? 0) - (seniority.get(a.id) ?? 0) ||
        a.firstName.localeCompare(b.firstName),
    );
    node.totalReports = node.children.reduce(
      (sum, child) => sum + 1 + sortTree(child),
      0,
    );
    return node.totalReports;
  }

  for (const root of roots) sortTree(root);

  // Anyone still unvisited sits in a reporting cycle — A reports to B, B reports
  // to A. The database permits it (managerId is just a nullable self-reference),
  // so the chart has to survive it rather than hang. Break the loop by detaching
  // the first member from its manager and promoting it to a root.
  for (const node of nodes.values()) {
    if (visited.has(node.id)) continue;

    const managerId = managerOf.get(node.id);
    const parent = managerId ? nodes.get(managerId) : undefined;
    if (parent) {
      parent.children = parent.children.filter((child) => child.id !== node.id);
    }
    roots.push(node);
    sortTree(node);
  }

  roots.sort(
    (a, b) =>
      b.totalReports - a.totalReports ||
      (seniority.get(b.id) ?? 0) - (seniority.get(a.id) ?? 0) ||
      a.firstName.localeCompare(b.firstName),
  );

  // Someone with no manager and no reports isn't a hierarchy — showing them as
  // a one-person tree alongside the real chart is noise, so they get their own
  // section underneath.
  const leadingRoots = roots.filter((node) => node.children.length > 0);
  const unassigned = roots.filter((node) => node.children.length === 0);

  return {
    roots: leadingRoots,
    unassigned,
    total: employees.length,
    partial: scope?.scope !== "all",
  };
}
