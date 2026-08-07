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
  "Payroll",
  "Onboarding",
  "Documents",
  "Assets",
  "Expenses",
  "Helpdesk",
  "Recruitment",
  "Performance",
  "Learning",
  "Engagement",
  "Exit",
  "Insights",
  "Platform",
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
    key: "report.build",
    label: "Build custom reports",
    group: "Insights",
    description:
      "Compose, save and share reports from the datasets you already have access to.",
  },

  // --- Payroll ------------------------------------------------------------
  {
    key: "payroll.read.self",
    label: "View own payslips",
    group: "Payroll",
    description: "Download one's own payslips and salary history.",
  },
  {
    key: "payroll.read.all",
    label: "View all payroll",
    group: "Payroll",
    description: "See payroll runs and every employee's payslip.",
    sensitive: true,
  },
  {
    key: "payroll.run",
    label: "Run payroll",
    group: "Payroll",
    description: "Create a monthly run, calculate it, and revise it while in draft.",
    sensitive: true,
  },
  {
    key: "payroll.approve",
    label: "Approve & release payroll",
    group: "Payroll",
    description:
      "Lock a run, publish payslips to employees and mark it paid. Separate from running it so one person can't do both.",
    sensitive: true,
  },
  {
    key: "payroll.structure.manage",
    label: "Manage salary structures",
    group: "Payroll",
    description: "Define salary components and the structures that combine them.",
    sensitive: true,
  },
  {
    key: "payroll.statutory.manage",
    label: "Manage statutory rules",
    group: "Payroll",
    description:
      "Configure the compliance pack — PF, ESI, professional tax and TDS rates.",
    sensitive: true,
  },
  {
    key: "payroll.compensation.manage",
    label: "Set compensation",
    group: "Payroll",
    description: "Assign salary structures and record raises. Always audited.",
    sensitive: true,
  },
  {
    key: "loan.manage",
    label: "Manage loans & advances",
    group: "Payroll",
    description: "Issue salary advances and set their recovery schedule.",
    sensitive: true,
  },

  // --- Onboarding ---------------------------------------------------------
  {
    key: "journey.read.self",
    label: "See own journey",
    group: "Onboarding",
    description: "Follow one's own onboarding or exit checklist.",
  },
  {
    key: "journey.read.all",
    label: "See all journeys",
    group: "Onboarding",
    description: "Track every onboarding and offboarding in progress.",
  },
  {
    key: "journey.manage",
    label: "Manage journeys",
    group: "Onboarding",
    description: "Start, edit and cancel onboarding and offboarding checklists.",
  },
  {
    key: "journey.template.manage",
    label: "Manage checklist templates",
    group: "Onboarding",
    description: "Define the tasks, owners and timings a new joiner runs through.",
  },
  {
    key: "task.complete",
    label: "Complete assigned tasks",
    group: "Onboarding",
    description: "Tick off checklist tasks assigned to you.",
  },

  // --- Documents ----------------------------------------------------------
  {
    key: "document.read.self",
    label: "View own documents",
    group: "Documents",
    description: "Open one's own contracts, certificates and ID proofs.",
  },
  {
    key: "document.read.team",
    label: "View team documents",
    group: "Documents",
    description: "Open documents for direct and indirect reports.",
  },
  {
    key: "document.read.all",
    label: "View all documents",
    group: "Documents",
    description: "Open any employee's document vault.",
    sensitive: true,
  },
  {
    key: "document.manage",
    label: "Manage documents",
    group: "Documents",
    description: "Upload, replace and delete employee documents.",
  },
  {
    key: "policy.read",
    label: "Read policies",
    group: "Documents",
    description: "Read published company policies and acknowledge them.",
  },
  {
    key: "policy.manage",
    label: "Manage policies",
    group: "Documents",
    description:
      "Write, publish and version policies, and see who has acknowledged them.",
  },
  {
    key: "letter.manage",
    label: "Issue letters",
    group: "Documents",
    description:
      "Generate offer, experience, relieving and increment letters from templates.",
  },

  // --- Assets -------------------------------------------------------------
  {
    key: "asset.read.self",
    label: "View own assets",
    group: "Assets",
    description: "See what company equipment is issued to you.",
  },
  {
    key: "asset.read.all",
    label: "View asset register",
    group: "Assets",
    description: "See every asset and who holds it.",
  },
  {
    key: "asset.manage",
    label: "Manage assets",
    group: "Assets",
    description: "Add assets, issue them to employees and record returns.",
  },

  // --- Expenses -----------------------------------------------------------
  {
    key: "expense.submit",
    label: "Claim expenses",
    group: "Expenses",
    description: "Submit expense claims with receipts.",
  },
  {
    key: "expense.read.self",
    label: "View own claims",
    group: "Expenses",
    description: "Track one's own claims and reimbursements.",
  },
  {
    key: "expense.read.team",
    label: "View team claims",
    group: "Expenses",
    description: "See claims from direct and indirect reports.",
  },
  {
    key: "expense.read.all",
    label: "View all claims",
    group: "Expenses",
    description: "See expense claims across the organisation.",
  },
  {
    key: "expense.approve.team",
    label: "Approve team claims",
    group: "Expenses",
    description: "Decide expense claims from one's reports.",
  },
  {
    key: "expense.approve.all",
    label: "Approve any claim",
    group: "Expenses",
    description: "Decide any expense claim, overriding the reporting manager.",
  },
  {
    key: "expense.reimburse",
    label: "Reimburse claims",
    group: "Expenses",
    description:
      "Mark approved claims paid, or attach them to the next payroll run.",
    sensitive: true,
  },
  {
    key: "expense.category.manage",
    label: "Manage expense categories",
    group: "Expenses",
    description: "Define categories, per-claim caps and receipt requirements.",
  },

  // --- Helpdesk -----------------------------------------------------------
  {
    key: "ticket.raise",
    label: "Raise tickets",
    group: "Helpdesk",
    description: "Ask HR a question and follow the answer.",
  },
  {
    key: "ticket.read.all",
    label: "View all tickets",
    group: "Helpdesk",
    description: "See every ticket raised in the organisation.",
  },
  {
    key: "ticket.manage",
    label: "Work the queue",
    group: "Helpdesk",
    description: "Assign, reply to, resolve and close tickets.",
  },
  {
    key: "ticket.category.manage",
    label: "Manage ticket queues",
    group: "Helpdesk",
    description: "Define categories, SLA targets and default owners.",
  },

  // --- Recruitment --------------------------------------------------------
  {
    key: "job.read",
    label: "View job openings",
    group: "Recruitment",
    description: "See open roles and their pipelines.",
  },
  {
    key: "job.manage",
    label: "Manage job openings",
    group: "Recruitment",
    description: "Create, publish and close job postings.",
  },
  {
    key: "candidate.read",
    label: "View candidates",
    group: "Recruitment",
    description: "See applicants, resumes and pipeline stage.",
  },
  {
    key: "candidate.manage",
    label: "Manage candidates",
    group: "Recruitment",
    description: "Move candidates through the pipeline, rate and reject them.",
  },
  {
    key: "interview.manage",
    label: "Schedule interviews",
    group: "Recruitment",
    description: "Book interviews and assign interviewers.",
  },
  {
    key: "interview.feedback",
    label: "Submit interview feedback",
    group: "Recruitment",
    description: "Fill in the scorecard for interviews you are on.",
  },
  {
    key: "offer.manage",
    label: "Manage offers",
    group: "Recruitment",
    description: "Draft, send and withdraw offers, and convert a hire to an employee.",
    sensitive: true,
  },

  // --- Performance --------------------------------------------------------
  {
    key: "goal.read.self",
    label: "View own goals",
    group: "Performance",
    description: "See and update progress on one's own goals.",
  },
  {
    key: "goal.read.team",
    label: "View team goals",
    group: "Performance",
    description: "See goals for direct and indirect reports.",
  },
  {
    key: "goal.read.all",
    label: "View all goals",
    group: "Performance",
    description: "See company, department and individual goals org-wide.",
  },
  {
    key: "goal.manage",
    label: "Set goals",
    group: "Performance",
    description: "Create and assign goals, including cascading company goals.",
  },
  {
    key: "review.participate",
    label: "Take part in reviews",
    group: "Performance",
    description: "Write self-reviews and reviews assigned to you.",
  },
  {
    key: "review.read.team",
    label: "Read team reviews",
    group: "Performance",
    description: "Read completed reviews for one's reports.",
  },
  {
    key: "review.read.all",
    label: "Read all reviews",
    group: "Performance",
    description: "Read every review in a cycle, including private notes.",
    sensitive: true,
  },
  {
    key: "review.cycle.manage",
    label: "Run review cycles",
    group: "Performance",
    description: "Open, advance and close appraisal cycles.",
  },
  {
    key: "oneonone.manage",
    label: "Log 1:1s",
    group: "Performance",
    description: "Record 1:1 agendas, notes and action items with your reports.",
  },

  // --- Learning -----------------------------------------------------------
  {
    key: "course.read",
    label: "Take courses",
    group: "Learning",
    description: "Open assigned courses, work through lessons and take quizzes.",
  },
  {
    key: "course.manage",
    label: "Manage courses",
    group: "Learning",
    description: "Build the course library, write lessons and quizzes, publish.",
  },
  {
    key: "enrollment.manage",
    label: "Assign training",
    group: "Learning",
    description: "Assign courses to people, teams or departments with due dates.",
  },
  {
    key: "enrollment.read.all",
    label: "Track completion",
    group: "Learning",
    description: "See who has completed which training, and who is overdue.",
  },

  // --- Engagement ---------------------------------------------------------
  {
    key: "announcement.manage",
    label: "Publish announcements",
    group: "Engagement",
    description: "Post company-wide or targeted announcements.",
  },
  {
    key: "survey.respond",
    label: "Answer surveys",
    group: "Engagement",
    description: "Take part in polls, surveys and eNPS pulses.",
  },
  {
    key: "survey.manage",
    label: "Run surveys",
    group: "Engagement",
    description: "Write surveys, open and close them, and read the results.",
  },

  // --- Exit ---------------------------------------------------------------
  {
    key: "exit.request",
    label: "Resign",
    group: "Exit",
    description: "Submit and withdraw one's own resignation.",
  },
  {
    key: "exit.read.all",
    label: "View exits",
    group: "Exit",
    description: "See resignations, clearance progress and exit interviews.",
  },
  {
    key: "exit.manage",
    label: "Manage exits",
    group: "Exit",
    description:
      "Accept or decline resignations, set the last working day, run clearance.",
  },
  {
    key: "settlement.manage",
    label: "Settle full & final",
    group: "Exit",
    description:
      "Compute and approve final settlements, including leave encashment and gratuity.",
    sensitive: true,
  },

  // --- Platform -----------------------------------------------------------
  {
    key: "apikey.manage",
    label: "Manage API keys",
    group: "Platform",
    description:
      "Issue and revoke keys for the public API. A key can never exceed the permissions granted to it.",
    sensitive: true,
  },
  {
    key: "webhook.manage",
    label: "Manage webhooks",
    group: "Platform",
    description: "Register endpoints, choose events and inspect delivery history.",
    sensitive: true,
  },
  {
    key: "branding.manage",
    label: "Manage branding",
    group: "Platform",
    description: "Set the logo, brand colour and login tagline for this instance.",
  },
  {
    key: "integration.manage",
    label: "Manage integrations",
    group: "Platform",
    description: "Connect Slack or Teams so HR alerts land where people work.",
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
  "recruiter",
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
  "payroll.read.self",
  "journey.read.self",
  "task.complete",
  "document.read.self",
  "policy.read",
  "asset.read.self",
  "expense.submit",
  "expense.read.self",
  "ticket.raise",
  "goal.read.self",
  "review.participate",
  "course.read",
  "survey.respond",
  "exit.request",
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
  "document.read.team",
  "expense.read.team",
  "expense.approve.team",
  "job.read",
  "candidate.read",
  "interview.feedback",
  "goal.read.team",
  "goal.manage",
  "review.read.team",
  "oneonone.manage",
];

/**
 * The recruiter is deliberately *not* a superset of the employee role plus
 * extras — it is a different shape. Hiring authority without payroll, leave
 * approval or the employee database is exactly the composition the PRD's
 * "granular, configurable permission matrix" is meant to make expressible.
 */
const RECRUITER_PERMISSIONS: PermissionKey[] = [
  ...EMPLOYEE_PERMISSIONS,
  "job.read",
  "job.manage",
  "candidate.read",
  "candidate.manage",
  "interview.manage",
  "interview.feedback",
  "offer.manage",
  "letter.manage",
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
  "report.build",
  "announcement.manage",

  // Payroll: HR runs and releases it. Splitting `payroll.run` from
  // `payroll.approve` exists so an org that wants four eyes on payroll can
  // build a role that holds only one of them.
  "payroll.read.all",
  "payroll.run",
  "payroll.approve",
  "payroll.structure.manage",
  "payroll.statutory.manage",
  "payroll.compensation.manage",
  "loan.manage",

  "journey.read.all",
  "journey.manage",
  "journey.template.manage",

  "document.read.all",
  "document.manage",
  "policy.manage",
  "letter.manage",

  "asset.read.all",
  "asset.manage",

  "expense.read.all",
  "expense.approve.all",
  "expense.reimburse",
  "expense.category.manage",

  "ticket.read.all",
  "ticket.manage",
  "ticket.category.manage",

  "job.manage",
  "candidate.manage",
  "interview.manage",
  "offer.manage",

  "goal.read.all",
  "review.read.all",
  "review.cycle.manage",

  "course.manage",
  "enrollment.manage",
  "enrollment.read.all",

  "survey.manage",

  "exit.read.all",
  "exit.manage",
  "settlement.manage",
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
    key: "recruiter",
    name: "Recruiter",
    description:
      "Owns hiring end to end — postings, pipeline, interviews and offers — and nothing else. The PRD's optional recruiter persona, and the clearest demonstration that roles here are compositions of permissions rather than tiers.",
    permissions: dedupe(RECRUITER_PERMISSIONS),
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
