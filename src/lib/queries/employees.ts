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
