import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { resolveEmployeeScope } from "../scope";
import { formatDate } from "../dates";
import { formatMoney } from "../money";
import type { PermissionKey } from "../permissions";

/**
 * The custom report builder (PRD §8.13).
 *
 * The whole design is in the schema comment on `SavedReport`: a saved report is
 * *data*, not SQL. It names a dataset from this file and a list of column keys
 * from that dataset's own catalogue, and the server maps them onto a query it
 * wrote itself.
 *
 * That constraint is doing real work. If a report stored a WHERE clause, every
 * person who could build a report could read another tenant — and a report
 * builder is exactly the feature you would hand to a junior analyst. Here the
 * worst a malicious definition can do is name a column that does not exist,
 * which is dropped.
 *
 * Each dataset also declares the permission it requires and whether it is
 * scoped to a reporting line, so a manager building a headcount report gets
 * their team and an HR manager gets the organisation — from the same
 * definition.
 */

export type CellValue = string | number | null;

export interface ColumnDef {
  key: string;
  label: string;
  /** Right-aligns and formats as a figure. */
  numeric?: boolean;
}

export interface FilterDef {
  key: string;
  label: string;
  type: "select" | "date" | "text";
  options?: { value: string; label: string }[];
}

export interface DatasetDef {
  key: string;
  label: string;
  description: string;
  /** Any one of these is enough to run it. */
  permissions: PermissionKey[];
  columns: ColumnDef[];
  filters: FilterDef[];
  /** The permission family used to scope rows to a reporting line. */
  scopeBase?: string;
}

export const DATASETS: DatasetDef[] = [
  {
    key: "employees",
    label: "People",
    description:
      "One row per employee, with job details and tenure. The starting point for headcount, attrition and diversity reporting.",
    permissions: ["employee.read.all", "employee.read.team", "report.read.org"],
    scopeBase: "employee.read",
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "name", label: "Name" },
      { key: "workEmail", label: "Work email" },
      { key: "department", label: "Department" },
      { key: "designation", label: "Designation" },
      { key: "location", label: "Location" },
      { key: "manager", label: "Reports to" },
      { key: "employmentType", label: "Employment type" },
      { key: "status", label: "Status" },
      { key: "gender", label: "Gender" },
      { key: "dateOfJoining", label: "Joined" },
      { key: "dateOfExit", label: "Left" },
      { key: "tenureMonths", label: "Tenure (months)", numeric: true },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "", label: "Currently here" },
          { value: "ACTIVE", label: "Active" },
          { value: "NOTICE_PERIOD", label: "On notice" },
          { value: "EXITED", label: "Exited" },
          { value: "all", label: "Everyone, ever" },
        ],
      },
      { key: "department", label: "Department code", type: "text" },
      { key: "joinedAfter", label: "Joined after", type: "date" },
    ],
  },
  {
    key: "leave",
    label: "Leave",
    description:
      "One row per leave request, with type, dates and outcome. Use it for leave-liability and absence-pattern reporting.",
    permissions: ["leave.read.all", "leave.read.team", "report.read.org"],
    scopeBase: "leave.read",
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "leaveType", label: "Leave type" },
      { key: "startDate", label: "From" },
      { key: "endDate", label: "To" },
      { key: "days", label: "Days", numeric: true },
      { key: "status", label: "Status" },
      { key: "isPaid", label: "Paid" },
      { key: "approver", label: "Approved by" },
      { key: "reason", label: "Reason" },
    ],
    filters: [
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "PENDING", label: "Pending" },
          { value: "APPROVED", label: "Approved" },
          { value: "REJECTED", label: "Declined" },
          { value: "CANCELLED", label: "Cancelled" },
        ],
      },
      { key: "from", label: "Starting from", type: "date" },
      { key: "to", label: "Starting before", type: "date" },
    ],
  },
  {
    key: "attendance",
    label: "Attendance",
    description:
      "One row per employee per day. Large — filter to a month before running it.",
    permissions: ["attendance.read.all", "attendance.read.team", "report.read.org"],
    scopeBase: "attendance.read",
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "date", label: "Date" },
      { key: "checkIn", label: "In" },
      { key: "checkOut", label: "Out" },
      { key: "workedHours", label: "Hours", numeric: true },
      { key: "status", label: "Status" },
      { key: "isLate", label: "Late" },
    ],
    filters: [
      { key: "from", label: "From", type: "date" },
      { key: "to", label: "To", type: "date" },
      {
        key: "status",
        label: "Status",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "PRESENT", label: "Present" },
          { value: "ABSENT", label: "Absent" },
          { value: "HALF_DAY", label: "Half day" },
          { value: "ON_LEAVE", label: "On leave" },
        ],
      },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    description:
      "One row per payslip. Contains salary figures, so it needs payroll access rather than ordinary reporting access.",
    permissions: ["payroll.read.all"],
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "name", label: "Name" },
      { key: "department", label: "Department" },
      { key: "period", label: "Period" },
      { key: "paidDays", label: "Paid days", numeric: true },
      { key: "gross", label: "Gross", numeric: true },
      { key: "deductions", label: "Deductions", numeric: true },
      { key: "net", label: "Net pay", numeric: true },
      { key: "employerCost", label: "Employer contributions", numeric: true },
      { key: "status", label: "Run status" },
    ],
    filters: [
      { key: "year", label: "Year", type: "text" },
      { key: "month", label: "Month (1–12)", type: "text" },
    ],
  },
  {
    key: "recruitment",
    label: "Recruitment",
    description:
      "One row per candidate, with pipeline stage and source. The funnel and time-to-hire report.",
    permissions: ["candidate.read", "job.read", "report.read.org"],
    columns: [
      { key: "name", label: "Candidate" },
      { key: "email", label: "Email" },
      { key: "job", label: "Role" },
      { key: "department", label: "Department" },
      { key: "stage", label: "Stage" },
      { key: "source", label: "Source" },
      { key: "rating", label: "Rating", numeric: true },
      { key: "appliedAt", label: "Applied" },
      { key: "interviews", label: "Interviews", numeric: true },
      { key: "daysInPipeline", label: "Days in pipeline", numeric: true },
    ],
    filters: [
      {
        key: "stage",
        label: "Stage",
        type: "select",
        options: [
          { value: "", label: "Any" },
          { value: "APPLIED", label: "Applied" },
          { value: "SCREENING", label: "Screening" },
          { value: "INTERVIEW", label: "Interview" },
          { value: "OFFER", label: "Offer" },
          { value: "HIRED", label: "Hired" },
          { value: "REJECTED", label: "Rejected" },
        ],
      },
      { key: "from", label: "Applied after", type: "date" },
    ],
  },
];

export function getDataset(key: string): DatasetDef | undefined {
  return DATASETS.find((dataset) => dataset.key === key);
}

export function datasetsFor(session: AuthContext): DatasetDef[] {
  return DATASETS.filter((dataset) =>
    dataset.permissions.some((permission) =>
      session.role.permissions.includes(permission),
    ),
  );
}

export interface ReportResult {
  columns: ColumnDef[];
  rows: CellValue[][];
  truncated: boolean;
}

/** Hard ceiling. A report is for reading; an export of everything is `pg_dump`. */
const MAX_ROWS = 2000;

/**
 * Runs a saved or ad-hoc definition.
 *
 * Unknown column keys are dropped rather than erroring: a definition saved
 * before a column was renamed should still produce a report, minus that
 * column, rather than a stack trace.
 */
export async function runReport(
  session: AuthContext,
  input: {
    dataset: string;
    columns: string[];
    filters: Record<string, string>;
  },
): Promise<ReportResult | null> {
  const dataset = getDataset(input.dataset);
  if (!dataset) return null;

  const permitted = dataset.permissions.some((permission) =>
    session.role.permissions.includes(permission),
  );
  if (!permitted) return null;

  const columns = dataset.columns.filter((column) =>
    input.columns.includes(column.key),
  );
  const chosen = columns.length > 0 ? columns : dataset.columns.slice(0, 6);

  const scope = dataset.scopeBase
    ? await resolveEmployeeScope(session, dataset.scopeBase)
    : null;

  const employeeFilter =
    scope && scope.scope !== "all" ? (scope.employeeIds ?? []) : null;

  const rows = await buildRows(session, dataset, input.filters, employeeFilter);

  return {
    columns: chosen,
    rows: rows.slice(0, MAX_ROWS).map((row) => chosen.map((c) => row[c.key] ?? null)),
    truncated: rows.length > MAX_ROWS,
  };
}

type Row = Record<string, CellValue>;

async function buildRows(
  session: AuthContext,
  dataset: DatasetDef,
  filters: Record<string, string>,
  employeeIds: string[] | null,
): Promise<Row[]> {
  const db = orgDb(session.org.id);
  const currency = session.org.currency;

  if (dataset.key === "employees") {
    const employees = await db.employee.findMany({
      where: {
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
        ...(filters.status === "all"
          ? {}
          : filters.status
            ? { status: filters.status as "ACTIVE" }
            : { status: { not: "EXITED" } }),
        ...(filters.department ? { department: { code: filters.department } } : {}),
        ...(filters.joinedAfter && !Number.isNaN(Date.parse(filters.joinedAfter))
          ? { dateOfJoining: { gte: new Date(filters.joinedAfter) } }
          : {}),
      },
      orderBy: [{ employeeCode: "asc" }],
      take: MAX_ROWS + 1,
      include: {
        department: { select: { name: true } },
        designation: { select: { title: true } },
        location: { select: { name: true } },
        manager: { select: { firstName: true, lastName: true } },
      },
    });

    const now = Date.now();
    return employees.map((employee) => ({
      employeeCode: employee.employeeCode,
      name: `${employee.firstName} ${employee.lastName}`,
      workEmail: employee.workEmail,
      department: employee.department?.name ?? null,
      designation: employee.designation?.title ?? null,
      location: employee.location?.name ?? null,
      manager: employee.manager
        ? `${employee.manager.firstName} ${employee.manager.lastName}`
        : null,
      employmentType: employee.employmentType,
      status: employee.status,
      gender: employee.gender,
      dateOfJoining: formatDate(employee.dateOfJoining),
      dateOfExit: employee.dateOfExit ? formatDate(employee.dateOfExit) : null,
      tenureMonths: Math.round(
        ((employee.dateOfExit?.getTime() ?? now) -
          employee.dateOfJoining.getTime()) /
          (30.44 * 86_400_000),
      ),
    }));
  }

  if (dataset.key === "leave") {
    const requests = await db.leaveRequest.findMany({
      where: {
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
        ...(filters.status ? { status: filters.status as "APPROVED" } : {}),
        ...(filters.from && !Number.isNaN(Date.parse(filters.from))
          ? { startDate: { gte: new Date(filters.from) } }
          : {}),
        ...(filters.to && !Number.isNaN(Date.parse(filters.to))
          ? { startDate: { lte: new Date(filters.to) } }
          : {}),
      },
      orderBy: { startDate: "desc" },
      take: MAX_ROWS + 1,
      include: {
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
        leaveType: { select: { name: true, isPaid: true } },
        approver: { select: { firstName: true, lastName: true } },
      },
    });

    return requests.map((request) => ({
      employeeCode: request.employee.employeeCode,
      name: `${request.employee.firstName} ${request.employee.lastName}`,
      department: request.employee.department?.name ?? null,
      leaveType: request.leaveType.name,
      startDate: formatDate(request.startDate),
      endDate: formatDate(request.endDate),
      days: Number(request.days),
      status: request.status,
      isPaid: request.leaveType.isPaid ? "Yes" : "No",
      approver: request.approver
        ? `${request.approver.firstName} ${request.approver.lastName}`
        : null,
      reason: request.reason,
    }));
  }

  if (dataset.key === "attendance") {
    const records = await db.attendanceRecord.findMany({
      where: {
        ...(employeeIds ? { employeeId: { in: employeeIds } } : {}),
        ...(filters.status ? { status: filters.status as "PRESENT" } : {}),
        ...(filters.from && !Number.isNaN(Date.parse(filters.from))
          ? { date: { gte: new Date(filters.from) } }
          : {}),
        ...(filters.to && !Number.isNaN(Date.parse(filters.to))
          ? { date: { lte: new Date(filters.to) } }
          : {}),
      },
      orderBy: [{ date: "desc" }],
      take: MAX_ROWS + 1,
      include: {
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
            department: { select: { name: true } },
          },
        },
      },
    });

    const time = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: session.org.timezone,
    });

    return records.map((record) => ({
      employeeCode: record.employee.employeeCode,
      name: `${record.employee.firstName} ${record.employee.lastName}`,
      department: record.employee.department?.name ?? null,
      date: formatDate(record.date),
      checkIn: record.checkInAt ? time.format(record.checkInAt) : null,
      checkOut: record.checkOutAt ? time.format(record.checkOutAt) : null,
      workedHours: record.workedMinutes
        ? Math.round((record.workedMinutes / 60) * 100) / 100
        : 0,
      status: record.status,
      isLate: record.isLate ? "Yes" : "No",
    }));
  }

  if (dataset.key === "payroll") {
    const year = Number(filters.year);
    const month = Number(filters.month);

    const payslips = await db.payslip.findMany({
      where: {
        run: {
          ...(Number.isFinite(year) && year > 2000 ? { periodYear: year } : {}),
          ...(Number.isFinite(month) && month >= 1 && month <= 12
            ? { periodMonth: month }
            : {}),
        },
      },
      orderBy: [{ createdAt: "desc" }],
      take: MAX_ROWS + 1,
      include: {
        run: { select: { periodMonth: true, periodYear: true, status: true } },
      },
    });

    // The payslip's own snapshot columns, not the live employee record: a
    // payslip has to keep saying what it said when it was issued, even after
    // the person transfers department or changes their name.
    return payslips.map((payslip) => ({
      employeeCode: payslip.employeeCode,
      name: payslip.employeeName,
      department: payslip.departmentName,
      period: `${String(payslip.run.periodMonth).padStart(2, "0")}/${payslip.run.periodYear}`,
      paidDays: Number(payslip.paidDays),
      gross: formatMoney(payslip.grossEarnings, currency),
      deductions: formatMoney(payslip.totalDeductions, currency),
      net: formatMoney(payslip.netPay, currency),
      employerCost: formatMoney(payslip.employerContributions, currency),
      status: payslip.run.status,
    }));
  }

  if (dataset.key === "recruitment") {
    const candidates = await db.candidate.findMany({
      where: {
        ...(filters.stage ? { stage: filters.stage as "APPLIED" } : {}),
        ...(filters.from && !Number.isNaN(Date.parse(filters.from))
          ? { appliedAt: { gte: new Date(filters.from) } }
          : {}),
      },
      orderBy: { appliedAt: "desc" },
      take: MAX_ROWS + 1,
      include: {
        job: {
          select: { title: true, department: { select: { name: true } } },
        },
        _count: { select: { interviews: true } },
      },
    });

    const now = Date.now();
    return candidates.map((candidate) => ({
      name: `${candidate.firstName} ${candidate.lastName}`.trim(),
      email: candidate.email,
      job: candidate.job.title,
      department: candidate.job.department?.name ?? null,
      stage: candidate.stage,
      source: candidate.source,
      rating: candidate.rating,
      appliedAt: formatDate(candidate.appliedAt),
      interviews: candidate._count.interviews,
      daysInPipeline: Math.round(
        (now - candidate.appliedAt.getTime()) / 86_400_000,
      ),
    }));
  }

  return [];
}
