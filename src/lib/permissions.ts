/**
 * The permission catalogue.
 *
 * PRD §6 asks for "a granular, configurable permission matrix (not hardcoded
 * roles)". So: roles are rows in the database holding an array of the keys
 * below, and every authorisation decision in the app is a permission check —
 * never `if (role === 'ADMIN')`. An Org Admin can compose "Payroll-only HR" or
 * "Read-only Auditor" without a code change.
 *
 * This file is the single source of truth. The About page renders the matrix
 * straight from it, so the documentation cannot drift from the enforcement.
 */

export const PERMISSION_GROUPS = [
  "Organisation",
  "People",
  "Attendance",
  "Leave",
  "Insights",
] as const;

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

/**
 * How wide a read/approve permission reaches.
 * `self` — only the acting user's own records.
 * `team` — the acting user's direct and indirect reports.
 * `all`  — every record in the organisation.
 */
export type Scope = "self" | "team" | "all";

export interface PermissionDef {
  key: string;
  label: string;
  group: PermissionGroup;
  description: string;
  /** Marks permissions that expose salary, bank or government-ID data. */
  sensitive?: boolean;
}

export const PERMISSIONS = [
  // --- Organisation -------------------------------------------------------
  {
    key: "org.read",
    label: "View organisation settings",
    group: "Organisation",
    description: "See company profile, locations, departments and policies.",
  },
  {
    key: "org.update",
    label: "Edit organisation settings",
    group: "Organisation",
    description: "Change company profile, working days, fiscal year, timezone.",
  },
  {
    key: "structure.manage",
    label: "Manage structure",
    group: "Organisation",
    description: "Create and edit departments, designations and locations.",
  },
  {
    key: "holiday.manage",
    label: "Manage holiday calendar",
    group: "Organisation",
    description: "Add or remove holidays, per location.",
  },
  {
    key: "shift.manage",
    label: "Manage shifts",
    group: "Organisation",
    description: "Define working hours, grace periods and half-day thresholds.",
  },
  {
    key: "role.manage",
    label: "Manage roles & permissions",
    group: "Organisation",
    description:
      "Create custom roles and change what each role can do. Grants full control of the org.",
    sensitive: true,
  },
  {
    key: "user.invite",
    label: "Invite users",
    group: "Organisation",
    description: "Send email invitations and assign a role to new users.",
  },
  {
    key: "customfield.manage",
    label: "Manage custom fields",
    group: "Organisation",
    description: "Add organisation-specific fields to the employee record.",
  },
  {
    key: "audit.read",
    label: "View audit log",
    group: "Organisation",
    description: "Read the immutable record of sensitive actions.",
  },

  // --- People -------------------------------------------------------------
  {
    key: "directory.read",
    label: "View directory",
    group: "People",
    description: "Browse colleagues' names, roles, departments and work contact.",
  },
  {
    key: "employee.read.self",
    label: "View own record",
    group: "People",
    description: "See one's own full employee record.",
  },
  {
    key: "employee.read.team",
    label: "View team records",
    group: "People",
    description: "See full records for direct and indirect reports.",
  },
  {
    key: "employee.read.all",
    label: "View all records",
    group: "People",
    description: "See full records for every employee in the organisation.",
  },
  {
    key: "employee.create",
    label: "Add employees",
    group: "People",
    description: "Create employee records and import from CSV.",
  },
  {
    key: "employee.update",
    label: "Edit employees",
    group: "People",
    description: "Change job details, reporting lines and personal information.",
  },
  {
    key: "employee.update.self",
    label: "Edit own profile",
    group: "People",
    description: "Update one's own contact, address and emergency details.",
  },
  {
    key: "employee.delete",
    label: "Delete employees",
    group: "People",
    description: "Permanently remove an employee record and their data.",
    sensitive: true,
  },
  {
    key: "employee.compensation.read",
    label: "View compensation",
    group: "People",
    description: "See salary and CTC figures.",
    sensitive: true,
  },
  {
    key: "employee.sensitive.read",
    label: "View bank & ID details",
    group: "People",
    description:
      "Decrypt and read bank account, PAN and Aadhaar numbers. Every read is audited.",
    sensitive: true,
  },

  // --- Attendance ---------------------------------------------------------
  {
    key: "attendance.checkin",
    label: "Check in & out",
    group: "Attendance",
    description: "Record one's own attendance.",
  },
  {
    key: "attendance.read.self",
    label: "View own attendance",
    group: "Attendance",
    description: "See one's own attendance history.",
  },
  {
    key: "attendance.read.team",
    label: "View team attendance",
    group: "Attendance",
    description: "See attendance for direct and indirect reports.",
  },
  {
    key: "attendance.read.all",
    label: "View all attendance",
    group: "Attendance",
    description: "See attendance across the organisation.",
  },
  {
    key: "attendance.regularize.request",
    label: "Request regularisation",
    group: "Attendance",
    description: "Ask for a missed punch to be corrected.",
  },
  {
    key: "attendance.regularize.approve.team",
    label: "Approve team regularisation",
    group: "Attendance",
    description: "Decide regularisation requests from one's reports.",
  },
  {
    key: "attendance.regularize.approve.all",
    label: "Approve any regularisation",
    group: "Attendance",
    description: "Decide regularisation requests for anyone, overriding managers.",
  },
  {
    key: "attendance.manage",
    label: "Edit attendance records",
    group: "Attendance",
    description: "Directly amend attendance data. Always audited.",
    sensitive: true,
  },

  // --- Leave --------------------------------------------------------------
  {
    key: "leave.request",
    label: "Apply for leave",
    group: "Leave",
    description: "Submit and cancel one's own leave requests.",
  },
  {
    key: "leave.read.self",
    label: "View own leave",
    group: "Leave",
    description: "See one's own balances, ledger and request history.",
  },
  {
    key: "leave.read.team",
    label: "View team leave",
    group: "Leave",
    description: "See balances and requests for direct and indirect reports.",
  },
  {
    key: "leave.read.all",
    label: "View all leave",
    group: "Leave",
    description: "See leave data across the organisation.",
  },
  {
    key: "leave.approve.team",
    label: "Approve team leave",
    group: "Leave",
    description: "Decide leave requests from one's reports.",
  },
  {
    key: "leave.approve.all",
    label: "Approve any leave",
    group: "Leave",
    description: "Decide any leave request, overriding the reporting manager.",
  },
  {
    key: "leave.type.manage",
    label: "Manage leave types",
    group: "Leave",
    description: "Define leave types, accrual rules and carry-forward caps.",
  },
  {
    key: "leave.balance.adjust",
    label: "Adjust balances",
    group: "Leave",
    description:
      "Credit or debit leave balances manually. Writes a ledger entry with a reason.",
    sensitive: true,
  },

  // --- Insights -----------------------------------------------------------
  {
    key: "report.read.team",
    label: "View team reports",
    group: "Insights",
    description: "Headcount and attendance summaries for one's own team.",
  },
  {
    key: "report.read.org",
    label: "View organisation reports",
    group: "Insights",
    description: "Headcount, attrition, diversity and leave trends org-wide.",
  },
  {
    key: "announcement.manage",
    label: "Publish announcements",
    group: "Insights",
    description: "Post company-wide or targeted announcements.",
  },
] as const satisfies readonly PermissionDef[];

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];

const PERMISSION_BY_KEY = new Map<string, PermissionDef>(
  PERMISSIONS.map((p) => [p.key, p]),
);

export function getPermission(key: string): PermissionDef | undefined {
  return PERMISSION_BY_KEY.get(key);
}

export function permissionsInGroup(group: PermissionGroup): PermissionDef[] {
  return PERMISSIONS.filter((p) => p.group === group);
}

// ---------------------------------------------------------------------------
// System roles
// ---------------------------------------------------------------------------

export const SYSTEM_ROLE_KEYS = [
  "org_admin",
  "hr_manager",
  "manager",
  "employee",
] as const;

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

/** Everything an ordinary employee can do — the floor every role builds on. */
const EMPLOYEE_PERMISSIONS: PermissionKey[] = [
  "directory.read",
  "employee.read.self",
  "employee.update.self",
  "attendance.checkin",
  "attendance.read.self",
  "attendance.regularize.request",
  "leave.request",
  "leave.read.self",
];

/** A manager adds team visibility and approval authority. */
const MANAGER_PERMISSIONS: PermissionKey[] = [
  ...EMPLOYEE_PERMISSIONS,
  "employee.read.team",
  "attendance.read.team",
  "attendance.regularize.approve.team",
  "leave.read.team",
  "leave.approve.team",
  "report.read.team",
];

/** HR runs day-to-day operations org-wide, but cannot rewrite the permission
 *  system itself — that stays with the Org Admin. */
const HR_MANAGER_PERMISSIONS: PermissionKey[] = [
  ...MANAGER_PERMISSIONS,
  "org.read",
  "structure.manage",
  "holiday.manage",
  "shift.manage",
  "user.invite",
  "customfield.manage",
  "employee.read.all",
  "employee.create",
  "employee.update",
  "employee.compensation.read",
  "attendance.read.all",
  "attendance.regularize.approve.all",
  "attendance.manage",
  "leave.read.all",
  "leave.approve.all",
  "leave.type.manage",
  "leave.balance.adjust",
  "report.read.org",
  "announcement.manage",
];

export interface SystemRoleDef {
  key: SystemRoleKey;
  name: string;
  description: string;
  permissions: PermissionKey[];
}

export const SYSTEM_ROLES: SystemRoleDef[] = [
  {
    key: "org_admin",
    name: "Org Admin",
    description:
      "Full control, including roles, permissions and deletion. Held by whoever created the organisation.",
    permissions: [...ALL_PERMISSION_KEYS],
  },
  {
    key: "hr_manager",
    name: "HR Manager",
    description:
      "Runs HR operations across the organisation: people, attendance, leave and reporting.",
    permissions: dedupe(HR_MANAGER_PERMISSIONS),
  },
  {
    key: "manager",
    name: "Manager",
    description:
      "Sees and approves for their own reporting line. No organisation-wide access.",
    permissions: dedupe(MANAGER_PERMISSIONS),
  },
  {
    key: "employee",
    name: "Employee",
    description:
      "Self-service only: own profile, own attendance, own leave, plus the directory.",
    permissions: dedupe(EMPLOYEE_PERMISSIONS),
  },
];

function dedupe(keys: PermissionKey[]): PermissionKey[] {
  return Array.from(new Set(keys));
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export function hasPermission(
  granted: readonly string[],
  required: PermissionKey,
): boolean {
  return granted.includes(required);
}

export function hasAnyPermission(
  granted: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  return required.some((key) => granted.includes(key));
}

export function hasAllPermissions(
  granted: readonly string[],
  required: readonly PermissionKey[],
): boolean {
  return required.every((key) => granted.includes(key));
}

/**
 * Collapse a self/team/all permission family into the widest scope held.
 * Returns null when the user holds none of them — callers must then refuse.
 *
 *   resolveScope(perms, "leave.read") -> "all" | "team" | "self" | null
 */
export function resolveScope(
  granted: readonly string[],
  base: string,
): Scope | null {
  if (granted.includes(`${base}.all`)) return "all";
  if (granted.includes(`${base}.team`)) return "team";
  if (granted.includes(`${base}.self`)) return "self";
  return null;
}
