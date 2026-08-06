"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Organisation configuration writes.
 *
 * Everything the Settings screens can change lives here: the company profile,
 * the structure (departments, designations, locations), shifts, the holiday
 * calendar and leave types. They share one shape so the UI can share one form
 * component — `(prevState, formData) => FormState`, with an absent `id` meaning
 * "create" and a present one meaning "update".
 *
 * Two rules run through the whole file:
 *
 *  1. **Permission first, always on the server.** Each action names the
 *     permission it needs before it touches anything. `structure.manage` is not
 *     the same as `shift.manage`, and an org admin can compose a role that has
 *     one without the other.
 *
 *  2. **Never silently orphan records.** Every foreign key pointing at these
 *     tables is `ON DELETE SET NULL`, so deleting a department would quietly
 *     blank the department of everyone in it — no error, no trace. So deletes
 *     here refuse while anything still references the row, and say how many.
 *     Leave types go further: their balances and history cascade, so a type
 *     that has ever been used can only be deactivated, never deleted.
 */

// ---------------------------------------------------------------------------
// Shared field helpers
// ---------------------------------------------------------------------------

const optionalString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

/** An unchecked checkbox is absent from FormData entirely, not "false". */
const checkbox = z
  .unknown()
  .optional()
  .transform((v) => v === "on" || v === "true" || v === true);

function optionalNumber(message = "Enter a number") {
  return z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : Number(v)))
    .refine((v) => v === undefined || Number.isFinite(v), message);
}

function requiredNumber(message = "Enter a number") {
  return z.coerce.number({ error: message }).finite(message);
}

const timeOfDay = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm, e.g. 09:30");

/**
 * Refusal message for a delete that would leave records pointing at nothing.
 * Written as a sentence a non-engineer can act on, not "FK constraint".
 */
function inUse(
  noun: string,
  counts: { label: string; count: number }[],
  remedy: string,
): FormState {
  const parts = counts
    .filter((c) => c.count > 0)
    .map((c) => `${c.count} ${pluralise(c.label, c.count)}`);

  return {
    error: `This ${noun} is still used by ${listSentence(parts)}. ${remedy}`,
  };
}

/** Enough English to keep "ledger entry" from becoming "ledger entrys". */
function pluralise(noun: string, count: number): string {
  if (count === 1) return noun;
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}

function listSentence(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "other records";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** Every settings screen reads from these two routes. */
function revalidateSettings(path?: string) {
  revalidatePath("/settings");
  if (path) revalidatePath(path);
}

// ---------------------------------------------------------------------------
// Organisation profile
// ---------------------------------------------------------------------------

const organizationSchema = z.object({
  name: z.string().trim().min(1, "Organisation name is required").max(120),
  industry: optionalString,
  website: optionalString,
  country: z.string().trim().min(2, "Country is required").max(2),
  currency: z.string().trim().min(3, "Currency is required").max(3),
  timezone: z.string().trim().min(1, "Timezone is required").max(64),
  fiscalYearStartMonth: requiredNumber("Pick a month")
    .int()
    .min(1)
    .max(12),
});

export async function updateOrganizationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "org.update");

  const parsed = organizationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  // Multi-value fields survive `getAll`, not `Object.fromEntries` — that keeps
  // only the last checkbox of the group.
  const workingDays = formData
    .getAll("workingDays")
    .map((v) => Number(v))
    .filter((v) => Number.isInteger(v) && v >= 1 && v <= 7)
    .sort((a, b) => a - b);

  if (workingDays.length === 0) {
    return {
      fieldErrors: {
        workingDays: "Pick at least one working day — attendance and leave are counted against these.",
      },
    };
  }

  const db = orgDb(session.org.id);
  const before = await db.organization.findFirst({ where: { id: session.org.id } });
  if (!before) return { error: "That organisation no longer exists." };

  const after = await db.organization.update({
    where: { id: session.org.id },
    data: { ...parsed.data, workingDays },
  });

  await audit(session, {
    action: "org.updated",
    entityType: "Organization",
    entityId: after.id,
    summary: `Updated the organisation profile`,
    before: {
      name: before.name,
      timezone: before.timezone,
      currency: before.currency,
      fiscalYearStartMonth: before.fiscalYearStartMonth,
      workingDays: before.workingDays,
    },
    after: {
      name: after.name,
      timezone: after.timezone,
      currency: after.currency,
      fiscalYearStartMonth: after.fiscalYearStartMonth,
      workingDays: after.workingDays,
    },
  });

  revalidateSettings("/settings/organisation");
  // The org name and timezone are rendered in the shell on every page.
  revalidatePath("/", "layout");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

const departmentSchema = z.object({
  id: optionalString,
  name: z.string().trim().min(1, "Name is required").max(80),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(20)
    .transform((v) => v.toUpperCase()),
  parentId: optionalString,
  headId: optionalString,
});

export async function saveDepartmentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "structure.manage");

  const parsed = departmentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, ...input } = parsed.data;
  const db = orgDb(session.org.id);

  const clash = await db.department.findFirst({
    where: { code: input.code, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { fieldErrors: { code: "Another department already uses that code." } };
  }

  // A department that is its own ancestor makes the tree infinite. The direct
  // case is the one a form can produce; deeper cycles need a walk.
  if (id && input.parentId && (await createsCycle(db, id, input.parentId))) {
    return {
      fieldErrors: {
        parentId: "That would make the department its own parent, directly or through the chain above it.",
      },
    };
  }

  const data = {
    name: input.name,
    code: input.code,
    parentId: input.parentId ?? null,
    headId: input.headId ?? null,
  };

  if (id) {
    const before = await db.department.findFirst({ where: { id } });
    if (!before) return { error: "That department no longer exists." };

    const after = await db.department.update({ where: { id }, data });
    await audit(session, {
      action: "department.updated",
      entityType: "Department",
      entityId: id,
      summary: `Updated department ${after.name}`,
      before: { name: before.name, code: before.code, headId: before.headId },
      after: { name: after.name, code: after.code, headId: after.headId },
    });
  } else {
    const created = await db.department.create({
      data: { orgId: session.org.id, ...data },
    });
    await audit(session, {
      action: "department.created",
      entityType: "Department",
      entityId: created.id,
      summary: `Added department ${created.name} (${created.code})`,
      after: data,
    });
  }

  revalidateSettings("/settings/structure");
  revalidatePath("/people");
  return { success: true };
}

/** Walks up the proposed parent chain looking for `id`. */
async function createsCycle(
  db: ReturnType<typeof orgDb>,
  id: string,
  parentId: string,
): Promise<boolean> {
  let cursor: string | null = parentId;
  // The chain cannot be longer than the number of departments; the counter is a
  // belt-and-braces stop in case data already contains a cycle.
  for (let hops = 0; cursor && hops < 100; hops++) {
    if (cursor === id) return true;
    const node: { parentId: string | null } | null =
      await db.department.findFirst({
        where: { id: cursor },
        select: { parentId: true },
      });
    cursor = node?.parentId ?? null;
  }
  return false;
}

export async function deleteDepartmentAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "structure.manage");

  const db = orgDb(session.org.id);
  const department = await db.department.findFirst({ where: { id } });
  if (!department) return { error: "That department no longer exists." };

  const [employees, children] = await Promise.all([
    db.employee.count({ where: { departmentId: id } }),
    db.department.count({ where: { parentId: id } }),
  ]);

  if (employees > 0 || children > 0) {
    return inUse(
      "department",
      [
        { label: "employee", count: employees },
        { label: "sub-department", count: children },
      ],
      "Move them somewhere else first.",
    );
  }

  await db.department.delete({ where: { id } });
  await audit(session, {
    action: "department.deleted",
    entityType: "Department",
    entityId: id,
    summary: `Deleted department ${department.name} (${department.code})`,
    before: { name: department.name, code: department.code },
  });

  revalidateSettings("/settings/structure");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Designations
// ---------------------------------------------------------------------------

const designationSchema = z.object({
  id: optionalString,
  title: z.string().trim().min(1, "Title is required").max(80),
  level: requiredNumber("Level must be a number").int().min(0).max(100),
});

export async function saveDesignationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "structure.manage");

  const parsed = designationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, ...input } = parsed.data;
  const db = orgDb(session.org.id);

  const clash = await db.designation.findFirst({
    where: { title: input.title, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { fieldErrors: { title: "That designation already exists." } };
  }

  if (id) {
    const before = await db.designation.findFirst({ where: { id } });
    if (!before) return { error: "That designation no longer exists." };

    await db.designation.update({ where: { id }, data: input });
    await audit(session, {
      action: "designation.updated",
      entityType: "Designation",
      entityId: id,
      summary: `Updated designation ${input.title}`,
      before: { title: before.title, level: before.level },
      after: input,
    });
  } else {
    const created = await db.designation.create({
      data: { orgId: session.org.id, ...input },
    });
    await audit(session, {
      action: "designation.created",
      entityType: "Designation",
      entityId: created.id,
      summary: `Added designation ${created.title}`,
      after: input,
    });
  }

  revalidateSettings("/settings/structure");
  return { success: true };
}

export async function deleteDesignationAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "structure.manage");

  const db = orgDb(session.org.id);
  const designation = await db.designation.findFirst({ where: { id } });
  if (!designation) return { error: "That designation no longer exists." };

  const employees = await db.employee.count({ where: { designationId: id } });
  if (employees > 0) {
    return inUse(
      "designation",
      [{ label: "employee", count: employees }],
      "Give them a different designation first.",
    );
  }

  await db.designation.delete({ where: { id } });
  await audit(session, {
    action: "designation.deleted",
    entityType: "Designation",
    entityId: id,
    summary: `Deleted designation ${designation.title}`,
    before: { title: designation.title, level: designation.level },
  });

  revalidateSettings("/settings/structure");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

const locationSchema = z.object({
  id: optionalString,
  name: z.string().trim().min(1, "Name is required").max(80),
  addressLine1: optionalString,
  addressLine2: optionalString,
  city: optionalString,
  state: optionalString,
  country: z.string().trim().min(2, "Country is required").max(2),
  postalCode: optionalString,
  timezone: z.string().trim().min(1, "Timezone is required").max(64),
  isHeadquarters: checkbox,
});

export async function saveLocationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "structure.manage");

  const parsed = locationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, ...input } = parsed.data;
  const db = orgDb(session.org.id);

  const clash = await db.location.findFirst({
    where: { name: input.name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { fieldErrors: { name: "Another location already has that name." } };
  }

  const data = {
    name: input.name,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    country: input.country.toUpperCase(),
    postalCode: input.postalCode ?? null,
    timezone: input.timezone,
    isHeadquarters: input.isHeadquarters,
  };

  const saved = id
    ? await db.location.update({ where: { id }, data })
    : await db.location.create({ data: { orgId: session.org.id, ...data } });

  // Headquarters is a single flag, not a per-row opinion: promoting one demotes
  // the rest rather than leaving the org with two head offices.
  if (data.isHeadquarters) {
    await db.location.updateMany({
      where: { NOT: { id: saved.id }, isHeadquarters: true },
      data: { isHeadquarters: false },
    });
  }

  await audit(session, {
    action: id ? "location.updated" : "location.created",
    entityType: "Location",
    entityId: saved.id,
    summary: `${id ? "Updated" : "Added"} location ${saved.name}`,
    after: data,
  });

  revalidateSettings("/settings/locations");
  return { success: true };
}

export async function deleteLocationAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "structure.manage");

  const db = orgDb(session.org.id);
  const location = await db.location.findFirst({ where: { id } });
  if (!location) return { error: "That location no longer exists." };

  const employees = await db.employee.count({ where: { locationId: id } });
  if (employees > 0) {
    return inUse(
      "location",
      [{ label: "employee", count: employees }],
      "Move them to another location first.",
    );
  }

  await db.location.delete({ where: { id } });
  await audit(session, {
    action: "location.deleted",
    entityType: "Location",
    entityId: id,
    summary: `Deleted location ${location.name}`,
    before: { name: location.name, city: location.city },
  });

  revalidateSettings("/settings/locations");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

const shiftSchema = z.object({
  id: optionalString,
  name: z.string().trim().min(1, "Name is required").max(60),
  startTime: timeOfDay,
  endTime: timeOfDay,
  breakMinutes: requiredNumber("Break must be a number").int().min(0).max(480),
  graceMinutes: requiredNumber("Grace must be a number").int().min(0).max(240),
  halfDayHours: requiredNumber("Half-day hours must be a number").min(0).max(24),
  fullDayHours: requiredNumber("Full-day hours must be a number").min(0).max(24),
  isDefault: checkbox,
});

export async function saveShiftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "shift.manage");

  const parsed = shiftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, ...input } = parsed.data;

  if (input.halfDayHours > input.fullDayHours) {
    return {
      fieldErrors: {
        halfDayHours: "A half day cannot be longer than a full day.",
      },
    };
  }

  const db = orgDb(session.org.id);

  const clash = await db.shift.findFirst({
    where: { name: input.name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { fieldErrors: { name: "Another shift already has that name." } };
  }

  const saved = id
    ? await db.shift.update({ where: { id }, data: input })
    : await db.shift.create({ data: { orgId: session.org.id, ...input } });

  if (input.isDefault) {
    await db.shift.updateMany({
      where: { NOT: { id: saved.id }, isDefault: true },
      data: { isDefault: false },
    });
  }

  await audit(session, {
    action: id ? "shift.updated" : "shift.created",
    entityType: "Shift",
    entityId: saved.id,
    summary: `${id ? "Updated" : "Added"} shift ${saved.name} (${input.startTime}–${input.endTime})`,
    after: input,
  });

  revalidateSettings("/settings/shifts");
  return { success: true };
}

export async function deleteShiftAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "shift.manage");

  const db = orgDb(session.org.id);
  const shift = await db.shift.findFirst({ where: { id } });
  if (!shift) return { error: "That shift no longer exists." };

  const [employees, attendance] = await Promise.all([
    db.employee.count({ where: { shiftId: id } }),
    db.attendanceRecord.count({ where: { shiftId: id } }),
  ]);

  if (employees > 0 || attendance > 0) {
    return inUse(
      "shift",
      [
        { label: "employee", count: employees },
        { label: "attendance record", count: attendance },
      ],
      "Reassign them before deleting it, or attendance already recorded would lose the hours it was measured against.",
    );
  }

  await db.shift.delete({ where: { id } });
  await audit(session, {
    action: "shift.deleted",
    entityType: "Shift",
    entityId: id,
    summary: `Deleted shift ${shift.name}`,
    before: { name: shift.name, startTime: shift.startTime, endTime: shift.endTime },
  });

  revalidateSettings("/settings/shifts");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Holidays
// ---------------------------------------------------------------------------

const holidaySchema = z.object({
  id: optionalString,
  name: z.string().trim().min(1, "Name is required").max(80),
  date: z.string().trim().min(1, "Pick a date"),
  locationId: optionalString,
  isOptional: checkbox,
});

export async function saveHolidayAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "holiday.manage");

  const parsed = holidaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, ...input } = parsed.data;

  // Holidays are date-only. Parsing as UTC midnight keeps the stored day equal
  // to the day that was typed, whatever the server's timezone happens to be.
  const date = new Date(`${input.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return { fieldErrors: { date: "That isn't a valid date." } };
  }

  const db = orgDb(session.org.id);

  const duplicate = await db.holiday.findFirst({
    where: {
      date,
      locationId: input.locationId ?? null,
      ...(id ? { NOT: { id } } : {}),
    },
    select: { name: true },
  });
  if (duplicate) {
    return {
      fieldErrors: {
        date: `${duplicate.name} is already on that date for the same location.`,
      },
    };
  }

  const data = {
    name: input.name,
    date,
    locationId: input.locationId ?? null,
    isOptional: input.isOptional,
  };

  const saved = id
    ? await db.holiday.update({ where: { id }, data })
    : await db.holiday.create({ data: { orgId: session.org.id, ...data } });

  await audit(session, {
    action: id ? "holiday.updated" : "holiday.created",
    entityType: "Holiday",
    entityId: saved.id,
    summary: `${id ? "Updated" : "Added"} holiday ${saved.name} on ${input.date}`,
    after: data,
  });

  revalidateSettings("/settings/holidays");
  return { success: true };
}

export async function deleteHolidayAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "holiday.manage");

  const db = orgDb(session.org.id);
  const holiday = await db.holiday.findFirst({ where: { id } });
  if (!holiday) return { error: "That holiday no longer exists." };

  await db.holiday.delete({ where: { id } });
  await audit(session, {
    action: "holiday.deleted",
    entityType: "Holiday",
    entityId: id,
    summary: `Deleted holiday ${holiday.name}`,
    before: { name: holiday.name, date: holiday.date },
  });

  revalidateSettings("/settings/holidays");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

const leaveTypeSchema = z.object({
  id: optionalString,
  name: z.string().trim().min(1, "Name is required").max(60),
  code: z
    .string()
    .trim()
    .min(1, "Code is required")
    .max(10)
    .transform((v) => v.toUpperCase()),
  description: optionalString,
  colorToken: z
    .enum(["chart-1", "chart-2", "chart-3", "chart-4", "chart-5"])
    .default("chart-1"),
  isPaid: checkbox,
  requiresApproval: checkbox,
  allowHalfDay: checkbox,
  countsHolidays: checkbox,
  accrualFrequency: z
    .enum(["NONE", "MONTHLY", "QUARTERLY", "ANNUALLY"])
    .default("MONTHLY"),
  accrualAmount: optionalNumber("Accrual must be a number"),
  openingBalance: optionalNumber("Opening balance must be a number"),
  maxBalance: optionalNumber("Maximum balance must be a number"),
  carryForward: checkbox,
  carryForwardCap: optionalNumber("Carry-forward cap must be a number"),
  maxConsecutiveDays: optionalNumber("Maximum consecutive days must be a number"),
  minNoticeDays: optionalNumber("Notice must be a number"),
  applicableGender: optionalString,
  isActive: checkbox,
  sortdex: optionalNumber("Order must be a number"),
});

const GENDERS = ["MALE", "FEMALE", "OTHER", "UNDISCLOSED"];

export async function saveLeaveTypeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "leave.type.manage");

  const parsed = leaveTypeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, ...input } = parsed.data;

  if (input.applicableGender && !GENDERS.includes(input.applicableGender)) {
    return { fieldErrors: { applicableGender: "Pick a valid option." } };
  }

  const db = orgDb(session.org.id);

  const clash = await db.leaveType.findFirst({
    where: { code: input.code, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { fieldErrors: { code: "Another leave type already uses that code." } };
  }

  const data = {
    name: input.name,
    code: input.code,
    description: input.description ?? null,
    colorToken: input.colorToken,
    isPaid: input.isPaid,
    requiresApproval: input.requiresApproval,
    allowHalfDay: input.allowHalfDay,
    countsHolidays: input.countsHolidays,
    accrualFrequency: input.accrualFrequency,
    accrualAmount: input.accrualAmount ?? 0,
    openingBalance: input.openingBalance ?? 0,
    maxBalance: input.maxBalance ?? null,
    carryForward: input.carryForward,
    // A null cap means unlimited, which is legitimate — but it only means that
    // when carry-forward is on. Clearing it otherwise stops a stale cap from
    // reappearing if someone switches carry-forward back on later.
    carryForwardCap: input.carryForward ? (input.carryForwardCap ?? null) : null,
    maxConsecutiveDays: input.maxConsecutiveDays ?? null,
    minNoticeDays: input.minNoticeDays ?? 0,
    applicableGender: (input.applicableGender ?? null) as never,
    isActive: input.isActive,
    sortdex: input.sortdex ?? 0,
  };

  if (id) {
    const before = await db.leaveType.findFirst({ where: { id } });
    if (!before) return { error: "That leave type no longer exists." };

    await db.leaveType.update({ where: { id }, data });
    await audit(session, {
      action: "leave.type.updated",
      entityType: "LeaveType",
      entityId: id,
      summary: `Updated leave type ${data.name}`,
      before: {
        accrualFrequency: before.accrualFrequency,
        accrualAmount: before.accrualAmount,
        carryForward: before.carryForward,
        isActive: before.isActive,
      },
      after: {
        accrualFrequency: data.accrualFrequency,
        accrualAmount: data.accrualAmount,
        carryForward: data.carryForward,
        isActive: data.isActive,
      },
    });
  } else {
    const created = await db.leaveType.create({
      data: { orgId: session.org.id, ...data },
    });
    await audit(session, {
      action: "leave.type.created",
      entityType: "LeaveType",
      entityId: created.id,
      summary: `Added leave type ${created.name} (${created.code})`,
      after: data,
    });
  }

  revalidateSettings("/settings/leave-types");
  revalidatePath("/leave");
  return { success: true };
}

/**
 * Deletes a leave type — but only one nobody has ever used.
 *
 * Balances, ledger entries and requests all cascade from this row. Deleting a
 * type in use would erase the record of leave people actually took, which is
 * both a data-loss bug and, in most jurisdictions, a records-retention problem.
 * Deactivating instead keeps the history and removes it from the apply form.
 */
export async function deleteLeaveTypeAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "leave.type.manage");

  const db = orgDb(session.org.id);
  const leaveType = await db.leaveType.findFirst({ where: { id } });
  if (!leaveType) return { error: "That leave type no longer exists." };

  const [requests, balances, ledger] = await Promise.all([
    db.leaveRequest.count({ where: { leaveTypeId: id } }),
    db.leaveBalance.count({ where: { leaveTypeId: id } }),
    db.leaveLedgerEntry.count({ where: { leaveTypeId: id } }),
  ]);

  if (requests > 0 || balances > 0 || ledger > 0) {
    return inUse(
      "leave type",
      [
        { label: "request", count: requests },
        { label: "balance", count: balances },
        { label: "ledger entry", count: ledger },
      ],
      "Deleting it would erase that history, so switch it off instead — it disappears from the apply form and the records stay intact.",
    );
  }

  await db.leaveType.delete({ where: { id } });
  await audit(session, {
    action: "leave.type.deleted",
    entityType: "LeaveType",
    entityId: id,
    summary: `Deleted unused leave type ${leaveType.name} (${leaveType.code})`,
    before: { name: leaveType.name, code: leaveType.code },
  });

  revalidateSettings("/settings/leave-types");
  revalidatePath("/leave");
  return { success: true };
}
