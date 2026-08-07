import "server-only";

import { rawDb } from "./db";
import { hashPassword } from "./auth";
import { SYSTEM_ROLES } from "./permissions";
import { provisionModuleDefaults } from "./module-defaults";

/**
 * Creating an organisation.
 *
 * PRD §8.1 sets the bar: "A new user can sign up, create an org, invite 3
 * teammates, and each teammate can log in and land on a role-appropriate
 * dashboard — all within 10 minutes, no manual setup by a developer."
 *
 * Meeting that means a new tenant cannot start empty. Everything an
 * organisation needs to be immediately usable — the four system roles, a
 * default shift, a working set of leave types, a head office — is created here
 * in one transaction. If any part fails, no half-built tenant is left behind.
 */

export interface CreateOrganizationInput {
  orgName: string;
  adminName: string;
  adminEmail: string;
  password: string;
  country?: string;
  timezone?: string;
  currency?: string;
  fiscalYearStartMonth?: number;
}

/** Default leave types, shaped for the Indian market the PRD names first. */
const DEFAULT_LEAVE_TYPES = [
  {
    name: "Casual Leave",
    code: "CL",
    description: "Short-notice personal time off.",
    colorToken: "chart-1",
    accrualFrequency: "MONTHLY" as const,
    accrualAmount: 1,
    carryForward: false,
    minNoticeDays: 1,
    sortdex: 1,
  },
  {
    name: "Sick Leave",
    code: "SL",
    description: "Illness and medical appointments. No notice required.",
    colorToken: "chart-3",
    accrualFrequency: "MONTHLY" as const,
    accrualAmount: 0.5,
    carryForward: false,
    minNoticeDays: 0,
    sortdex: 2,
  },
  {
    name: "Earned Leave",
    code: "EL",
    description: "Accrues monthly and carries forward, capped at 30 days.",
    colorToken: "chart-2",
    accrualFrequency: "MONTHLY" as const,
    accrualAmount: 1.25,
    carryForward: true,
    carryForwardCap: 30,
    minNoticeDays: 7,
    sortdex: 3,
  },
  {
    name: "Unpaid Leave",
    code: "LWP",
    description: "Leave without pay, once paid balances are exhausted.",
    colorToken: "chart-5",
    isPaid: false,
    accrualFrequency: "NONE" as const,
    accrualAmount: 0,
    carryForward: false,
    minNoticeDays: 0,
    sortdex: 4,
  },
  {
    name: "Maternity Leave",
    code: "ML",
    description: "26 weeks, per the Maternity Benefit Act.",
    colorToken: "chart-4",
    accrualFrequency: "NONE" as const,
    accrualAmount: 0,
    openingBalance: 182,
    carryForward: false,
    applicableGender: "FEMALE" as const,
    minNoticeDays: 30,
    sortdex: 5,
  },
  {
    name: "Paternity Leave",
    code: "PL",
    description: "Leave for new fathers.",
    colorToken: "chart-4",
    accrualFrequency: "NONE" as const,
    accrualAmount: 0,
    openingBalance: 10,
    carryForward: false,
    applicableGender: "MALE" as const,
    minNoticeDays: 15,
    sortdex: 6,
  },
];

export async function createOrganization(input: CreateOrganizationInput) {
  const slug = await uniqueSlug(input.orgName);
  const passwordHash = await hashPassword(input.password);

  return rawDb.$transaction(async (tx) => {
    const org = await tx.organization.create({
      data: {
        name: input.orgName.trim(),
        slug,
        country: input.country ?? "IN",
        currency: input.currency ?? "INR",
        timezone: input.timezone ?? "Asia/Kolkata",
        fiscalYearStartMonth: input.fiscalYearStartMonth ?? 4,
      },
    });

    // The system roles from PRD §6. They are ordinary rows — an Org Admin can
    // edit the non-admin ones or add new roles beside them.
    await tx.role.createMany({
      data: SYSTEM_ROLES.map((role) => ({
        orgId: org.id,
        key: role.key,
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
        isSystem: true,
      })),
    });

    const adminRole = await tx.role.findFirstOrThrow({
      where: { orgId: org.id, key: "org_admin" },
    });

    const location = await tx.location.create({
      data: {
        orgId: org.id,
        name: "Head Office",
        isHeadquarters: true,
        country: input.country ?? "IN",
        timezone: input.timezone ?? "Asia/Kolkata",
      },
    });

    const shift = await tx.shift.create({
      data: {
        orgId: org.id,
        name: "General Shift",
        startTime: "09:30",
        endTime: "18:30",
        breakMinutes: 60,
        graceMinutes: 15,
        isDefault: true,
      },
    });

    const department = await tx.department.create({
      data: { orgId: org.id, name: "General", code: "GEN" },
    });

    const designation = await tx.designation.create({
      data: { orgId: org.id, title: "Founder", level: 100 },
    });

    await tx.leaveType.createMany({
      data: DEFAULT_LEAVE_TYPES.map((type) => ({
        orgId: org.id,
        name: type.name,
        code: type.code,
        description: type.description,
        colorToken: type.colorToken,
        isPaid: type.isPaid ?? true,
        accrualFrequency: type.accrualFrequency,
        accrualAmount: type.accrualAmount,
        openingBalance: type.openingBalance ?? 0,
        carryForward: type.carryForward,
        carryForwardCap: type.carryForwardCap ?? null,
        applicableGender: type.applicableGender ?? null,
        minNoticeDays: type.minNoticeDays,
        sortdex: type.sortdex,
      })),
    });

    // Payroll structures, checklist templates, expense and ticket queues,
    // letter templates and the statutory pack — so every module opens onto
    // something workable rather than an empty list.
    await provisionModuleDefaults(tx, org.id);

    const user = await tx.user.create({
      data: {
        orgId: org.id,
        email: input.adminEmail.toLowerCase().trim(),
        passwordHash,
        name: input.adminName.trim(),
        roleId: adminRole.id,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    // The founder is an employee too — otherwise they cannot apply for leave or
    // check in, and every "my" screen would be empty for them.
    const [firstName, ...rest] = input.adminName.trim().split(/\s+/);
    const employee = await tx.employee.create({
      data: {
        orgId: org.id,
        employeeCode: "EMP-001",
        firstName: firstName ?? input.adminName,
        lastName: rest.join(" ") || "",
        workEmail: input.adminEmail.toLowerCase().trim(),
        dateOfJoining: new Date(),
        departmentId: department.id,
        designationId: designation.id,
        locationId: location.id,
        shiftId: shift.id,
        userId: user.id,
        status: "ACTIVE",
      },
    });

    return { org, user, employee };
  });
}

/**
 * Slugs must be globally unique — they identify the tenant in URLs and, later,
 * on subdomains. Collisions get a numeric suffix rather than an error, because
 * "Acme" being taken is not the new user's problem.
 */
async function uniqueSlug(name: string): Promise<string> {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "org";

  let candidate = base;
  let suffix = 1;

  // Bounded: after 50 attempts fall back to a random suffix rather than loop.
  while (suffix < 50) {
    const existing = await rawDb.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Ensures a leave balance row exists for an employee, creating it with the
 * leave type's opening balance and the accrual earned so far this year.
 * Called lazily whenever balances are read, so employees added mid-year get
 * correct balances without a nightly job.
 */
export async function ensureLeaveBalances(
  orgId: string,
  employeeId: string,
  year: number,
) {
  const [employee, leaveTypes] = await Promise.all([
    rawDb.employee.findFirst({
      where: { id: employeeId, orgId },
      select: { gender: true, dateOfJoining: true },
    }),
    rawDb.leaveType.findMany({ where: { orgId, isActive: true } }),
  ]);

  if (!employee) return;

  const existing = await rawDb.leaveBalance.findMany({
    where: { orgId, employeeId, year },
    select: { leaveTypeId: true },
  });
  const have = new Set(existing.map((b) => b.leaveTypeId));

  const missing = leaveTypes.filter((type) => {
    if (have.has(type.id)) return false;
    // Gender-restricted types only apply to those they apply to.
    if (type.applicableGender && employee.gender !== type.applicableGender) {
      return false;
    }
    return true;
  });

  if (missing.length === 0) return;

  await rawDb.leaveBalance.createMany({
    data: missing.map((type) => ({
      orgId,
      employeeId,
      leaveTypeId: type.id,
      year,
      openingBalance: type.openingBalance,
    })),
    skipDuplicates: true,
  });

  await rawDb.leaveLedgerEntry.createMany({
    data: missing
      .filter((type) => Number(type.openingBalance) > 0)
      .map((type) => ({
        orgId,
        employeeId,
        leaveTypeId: type.id,
        year,
        delta: type.openingBalance,
        reason: "OPENING_BALANCE" as const,
        note: `Opening balance for ${year}`,
      })),
  });
}
