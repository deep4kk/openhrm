"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, can, getSession, requireAuth } from "../auth";
import { audit } from "../audit";
import { encryptField, generateToken, hashToken } from "../crypto";
import { canReachEmployee } from "../scope";
import { sendInvitationEmail } from "../mail";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Employee writes.
 *
 * Two things every action here does, in this order: check the permission on the
 * server, then write an audit entry. Neither is optional — the UI hiding a
 * button is a convenience, not a control, and an HR record changing without a
 * trace is exactly what PRD §8.18 exists to prevent.
 */

const optionalString = z
  .string()
  .trim()
  .max(200)
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const employeeSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().max(80).default(""),
  workEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid work email")
    .max(254),
  personalEmail: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email")
    .max(254)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  employeeCode: z.string().trim().min(1, "Employee code is required").max(40),
  phone: optionalString,
  dateOfBirth: optionalString,
  gender: optionalString,
  bloodGroup: optionalString,
  dateOfJoining: z.string().min(1, "Joining date is required"),
  departmentId: optionalString,
  designationId: optionalString,
  locationId: optionalString,
  managerId: optionalString,
  shiftId: optionalString,
  employmentType: z
    .enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"])
    .default("FULL_TIME"),
  city: optionalString,
  state: optionalString,
  addressLine1: optionalString,
  postalCode: optionalString,
  emergencyContactName: optionalString,
  emergencyContactPhone: optionalString,
  emergencyContactRelation: optionalString,
  ctcAnnual: optionalString,
  bankName: optionalString,
  bankIfsc: optionalString,
  bankAccountNumber: optionalString,
  panNumber: optionalString,
  sendInvite: optionalString,
});

export async function createEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "employee.create");

  const parsed = employeeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const clash = await db.employee.findFirst({
    where: {
      OR: [
        { workEmail: input.workEmail },
        { employeeCode: input.employeeCode },
      ],
    },
    select: { workEmail: true, employeeCode: true },
  });

  if (clash) {
    return {
      fieldErrors:
        clash.workEmail === input.workEmail
          ? { workEmail: "Someone already has that work email." }
          : { employeeCode: "That employee code is already in use." },
    };
  }

  // Compensation and bank details are only written when the caller is allowed
  // to see them — otherwise a form-field injection could set a salary.
  const mayWriteComp = can(session, "employee.compensation.read");
  const mayWriteSensitive = can(session, "employee.sensitive.read");

  const employee = await db.employee.create({
    data: {
      // Present to satisfy Prisma's input type. The tenant extension overwrites
      // it with the org the client is bound to, so a forged value cannot land.
      orgId: session.org.id,
      firstName: input.firstName,
      lastName: input.lastName,
      workEmail: input.workEmail,
      personalEmail: input.personalEmail,
      employeeCode: input.employeeCode,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
      gender: input.gender as never,
      bloodGroup: input.bloodGroup,
      dateOfJoining: new Date(input.dateOfJoining),
      departmentId: input.departmentId ?? null,
      designationId: input.designationId ?? null,
      locationId: input.locationId ?? null,
      managerId: input.managerId ?? null,
      shiftId: input.shiftId ?? null,
      employmentType: input.employmentType,
      city: input.city,
      state: input.state,
      addressLine1: input.addressLine1,
      postalCode: input.postalCode,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      emergencyContactRelation: input.emergencyContactRelation,
      ctcAnnual:
        mayWriteComp && input.ctcAnnual ? Number(input.ctcAnnual) : null,
      bankName: mayWriteSensitive ? input.bankName : null,
      bankIfsc: mayWriteSensitive ? input.bankIfsc : null,
      bankAccountNumberEnc: mayWriteSensitive
        ? encryptField(input.bankAccountNumber)
        : null,
      panNumberEnc: mayWriteSensitive ? encryptField(input.panNumber) : null,
      status: "ACTIVE",
    },
  });

  await audit(session, {
    action: "employee.created",
    entityType: "Employee",
    entityId: employee.id,
    summary: `Added ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
    after: {
      employeeCode: employee.employeeCode,
      workEmail: employee.workEmail,
      departmentId: employee.departmentId,
      designationId: employee.designationId,
      managerId: employee.managerId,
    },
  });

  if (input.sendInvite === "on" && can(session, "user.invite")) {
    await inviteEmployee(session.org.id, employee.id, session);
  }

  revalidatePath("/people");
  redirect(`/people/${employee.id}`);
}

const updateSchema = employeeSchema.partial().extend({
  id: z.string().min(1),
});

export async function updateEmployeeAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();

  const parsed = updateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { id, ...input } = parsed.data;
  const db = orgDb(session.org.id);

  const existing = await db.employee.findFirst({ where: { id } });
  if (!existing) return { error: "That employee no longer exists." };

  // Editing your own profile needs a different permission from editing others'.
  const isSelf = session.employee?.id === id;
  if (isSelf && !can(session, "employee.update")) {
    await assertPermission(session, "employee.update.self");
  } else {
    await assertPermission(session, "employee.update");
    const reachable = await canReachEmployee(session, "employee.read", id);
    if (!reachable) return { error: "You can't edit that employee." };
  }

  const mayWriteComp = can(session, "employee.compensation.read");
  const mayWriteSensitive = can(session, "employee.sensitive.read");
  const mayWriteJob = can(session, "employee.update");

  const updated = await db.employee.update({
    where: { id },
    data: {
      firstName: input.firstName ?? undefined,
      lastName: input.lastName ?? undefined,
      personalEmail: input.personalEmail,
      phone: input.phone,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      gender: (input.gender as never) ?? undefined,
      bloodGroup: input.bloodGroup,
      city: input.city,
      state: input.state,
      addressLine1: input.addressLine1,
      postalCode: input.postalCode,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      emergencyContactRelation: input.emergencyContactRelation,

      // Job details are HR's to change — an employee editing their own profile
      // cannot promote themselves or reassign their manager.
      ...(mayWriteJob
        ? {
            workEmail: input.workEmail ?? undefined,
            employeeCode: input.employeeCode ?? undefined,
            departmentId: input.departmentId ?? null,
            designationId: input.designationId ?? null,
            locationId: input.locationId ?? null,
            managerId: input.managerId ?? null,
            shiftId: input.shiftId ?? null,
            employmentType: input.employmentType ?? undefined,
            dateOfJoining: input.dateOfJoining
              ? new Date(input.dateOfJoining)
              : undefined,
          }
        : {}),

      ...(mayWriteComp && input.ctcAnnual !== undefined
        ? { ctcAnnual: input.ctcAnnual ? Number(input.ctcAnnual) : null }
        : {}),

      ...(mayWriteSensitive
        ? {
            bankName: input.bankName,
            bankIfsc: input.bankIfsc,
            ...(input.bankAccountNumber
              ? { bankAccountNumberEnc: encryptField(input.bankAccountNumber) }
              : {}),
            ...(input.panNumber
              ? { panNumberEnc: encryptField(input.panNumber) }
              : {}),
          }
        : {}),
    },
  });

  const compensationChanged =
    mayWriteComp &&
    input.ctcAnnual !== undefined &&
    String(existing.ctcAnnual ?? "") !== String(updated.ctcAnnual ?? "");

  await audit(session, {
    action: compensationChanged
      ? "employee.compensation.updated"
      : "employee.updated",
    entityType: "Employee",
    entityId: id,
    summary: `Updated ${updated.firstName} ${updated.lastName}`,
    before: {
      designationId: existing.designationId,
      departmentId: existing.departmentId,
      managerId: existing.managerId,
      ctcAnnual: existing.ctcAnnual,
    },
    after: {
      designationId: updated.designationId,
      departmentId: updated.departmentId,
      managerId: updated.managerId,
      ctcAnnual: updated.ctcAnnual,
    },
  });

  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
  return { success: true };
}

/**
 * Invites an employee to create a login.
 *
 * Employee records and user accounts are separate on purpose: HR can build the
 * roster before anyone has an account, and an exiting employee loses their
 * login while their record stays for reporting.
 */
export async function inviteEmployeeAction(employeeId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "user.invite");
  await inviteEmployee(session.org.id, employeeId, session);
  revalidatePath(`/people/${employeeId}`);
  return { success: true };
}

async function inviteEmployee(
  orgId: string,
  employeeId: string,
  session: Awaited<ReturnType<typeof requireAuth>>,
) {
  const db = orgDb(orgId);

  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    include: { user: true },
  });
  if (!employee || employee.user) return;

  const role = await db.role.findFirst({ where: { key: "employee" } });
  if (!role) return;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  // Supersede any earlier pending invite so only one link stays live.
  await db.invitation.updateMany({
    where: { email: employee.workEmail, status: "PENDING" },
    data: { status: "CANCELLED" },
  });

  await db.invitation.create({
    data: {
      orgId,
      email: employee.workEmail,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      roleId: role.id,
      tokenHash: hashToken(token),
      invitedById: session.user.id,
      expiresAt,
    },
  });

  await sendInvitationEmail({
    to: employee.workEmail,
    orgName: session.org.name,
    inviterName: session.user.name,
    roleName: role.name,
    acceptUrl: `${process.env.APP_URL ?? "http://localhost:3000"}/invite/${token}`,
  });

  await audit(session, {
    action: "user.invited",
    entityType: "Employee",
    entityId: employeeId,
    summary: `Invited ${employee.workEmail} to create an account`,
  });
}

/**
 * Reveals bank and government-ID numbers.
 *
 * Deliberately a separate, audited action rather than data included in the page
 * payload: the values are decrypted only when someone actively asks, and every
 * reveal is recorded against their name.
 */
export async function revealSensitiveAction(
  employeeId: string,
): Promise<{ bankAccountNumber?: string; panNumber?: string; error?: string }> {
  const session = await getSession();
  if (!session) return { error: "Not signed in." };
  if (!can(session, "employee.sensitive.read")) {
    return { error: "You don't have permission to view these details." };
  }

  const db = orgDb(session.org.id);
  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    select: { bankAccountNumberEnc: true, panNumberEnc: true },
  });
  if (!employee) return { error: "Employee not found." };

  await audit(session, {
    action: "employee.sensitive.viewed",
    entityType: "Employee",
    entityId: employeeId,
    summary: "Revealed bank and ID details",
  });

  const { decryptFieldSafe } = await import("../crypto");
  return {
    bankAccountNumber: decryptFieldSafe(employee.bankAccountNumberEnc) ?? undefined,
    panNumber: decryptFieldSafe(employee.panNumberEnc) ?? undefined,
  };
}

export async function deleteEmployeeAction(employeeId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "employee.delete");

  const db = orgDb(session.org.id);
  const employee = await db.employee.findFirst({ where: { id: employeeId } });
  if (!employee) return { error: "That employee no longer exists." };

  await audit(session, {
    action: "employee.deleted",
    entityType: "Employee",
    entityId: employeeId,
    summary: `Deleted ${employee.firstName} ${employee.lastName} (${employee.employeeCode})`,
    before: {
      employeeCode: employee.employeeCode,
      workEmail: employee.workEmail,
      dateOfJoining: employee.dateOfJoining,
    },
  });

  await db.employee.delete({ where: { id: employeeId } });

  // The audit row survives the employee — that is the point of denormalising
  // the actor label and summary onto it.
  revalidatePath("/people");
  redirect("/people");
}
