"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { toDateOnly } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Asset register writes (PRD §8.15).
 *
 * The invariant this file protects: an asset has at most one open assignment.
 * Issue and return therefore move the asset's status and the assignment row
 * together, in a transaction — otherwise a laptop can end up "AVAILABLE" while
 * still sitting on someone's desk, which is precisely the state the register
 * exists to prevent.
 */

const CONDITIONS = ["NEW", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;

const assetSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the asset").max(120),
  assetTag: z
    .string()
    .trim()
    .min(1, "Every asset needs a tag")
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, "Letters, numbers, dot, dash and underscore only"),
  categoryId: z.string().optional(),
  serialNumber: z.string().trim().max(80).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  locationId: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchaseCost: z.string().optional(),
  warrantyEndsOn: z.string().optional(),
  condition: z.enum(CONDITIONS).optional(),
  status: z
    .enum(["AVAILABLE", "ASSIGNED", "IN_REPAIR", "RETIRED", "LOST"])
    .optional(),
  note: z.string().trim().max(500).optional(),
});

export async function saveAssetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "asset.manage");

  const parsed = assetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const clash = await db.asset.findFirst({
    where: {
      assetTag: input.assetTag,
      ...(input.id ? { NOT: { id: input.id } } : {}),
    },
  });
  if (clash) {
    return { fieldErrors: { assetTag: "That tag is already in use." } };
  }

  const data = {
    name: input.name,
    assetTag: input.assetTag,
    categoryId: input.categoryId || null,
    serialNumber: input.serialNumber || null,
    make: input.make || null,
    model: input.model || null,
    locationId: input.locationId || null,
    purchaseDate: input.purchaseDate
      ? toDateOnly(new Date(input.purchaseDate))
      : null,
    purchaseCost: input.purchaseCost ? Number(input.purchaseCost) : null,
    warrantyEndsOn: input.warrantyEndsOn
      ? toDateOnly(new Date(input.warrantyEndsOn))
      : null,
    condition: input.condition ?? "GOOD",
    note: input.note || null,
  };

  let assetId: string;

  if (input.id) {
    const existing = await db.asset.findFirst({ where: { id: input.id } });
    if (!existing) return { error: "That asset no longer exists." };

    // Status is only settable directly for the states that aren't derived from
    // an assignment. Flipping an issued laptop to AVAILABLE from this form
    // would orphan its assignment row; returning it is the way to do that.
    const status =
      input.status && input.status !== "ASSIGNED" && existing.status !== "ASSIGNED"
        ? input.status
        : existing.status;

    await db.asset.update({
      where: { id: input.id },
      data: { ...data, status },
    });
    assetId = input.id;
  } else {
    const created = await db.asset.create({
      data: { orgId: session.org.id, ...data },
    });
    assetId = created.id;
  }

  await audit(session, {
    action: input.id ? "asset.updated" : "asset.created",
    entityType: "Asset",
    entityId: assetId,
    summary: `${input.id ? "Updated" : "Added"} ${input.name} (${input.assetTag})`,
    after: data,
  });

  revalidatePath("/assets");
  revalidatePath(`/assets/${assetId}`);
  return { success: true };
}

export async function deleteAssetAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "asset.manage");

  const db = orgDb(session.org.id);
  const asset = await db.asset.findFirst({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!asset) return { error: "That asset no longer exists." };

  if (asset.status === "ASSIGNED") {
    return {
      error: "That asset is issued to someone. Record its return first.",
    };
  }
  if (asset._count.assignments > 0) {
    return {
      error:
        "This asset has been issued before, and deleting it would erase who held it and when. Retire it instead.",
    };
  }

  await db.asset.delete({ where: { id } });

  await audit(session, {
    action: "asset.deleted",
    entityType: "Asset",
    entityId: id,
    summary: `Deleted ${asset.name} (${asset.assetTag})`,
  });

  revalidatePath("/assets");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Issue and return
// ---------------------------------------------------------------------------

const issueSchema = z.object({
  assetId: z.string().min(1),
  employeeId: z.string().min(1, "Choose who it is going to"),
  issuedOn: z.string().min(1, "When was it handed over?"),
  dueOn: z.string().optional(),
  issueCondition: z.enum(CONDITIONS),
  issueNote: z.string().trim().max(500).optional(),
});

export async function issueAssetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "asset.manage");

  const parsed = issueSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const [asset, employee] = await Promise.all([
    db.asset.findFirst({ where: { id: input.assetId } }),
    db.employee.findFirst({
      where: { id: input.employeeId },
      select: { id: true, firstName: true, lastName: true },
    }),
  ]);

  if (!asset) return { error: "That asset no longer exists." };
  if (!employee) return { fieldErrors: { employeeId: "Unknown employee." } };
  if (asset.status === "ASSIGNED") {
    return { error: "That asset is already issued to someone." };
  }
  if (asset.status === "RETIRED" || asset.status === "LOST") {
    return { error: `A ${asset.status.toLowerCase()} asset can't be issued.` };
  }

  await rawDb.$transaction(async (tx) => {
    await tx.assetAssignment.create({
      data: {
        orgId: session.org.id,
        assetId: asset.id,
        employeeId: employee.id,
        issuedOn: toDateOnly(new Date(input.issuedOn)),
        dueOn: input.dueOn ? toDateOnly(new Date(input.dueOn)) : null,
        issueCondition: input.issueCondition,
        issueNote: input.issueNote || null,
        issuedById: session.user.id,
      },
    });

    await tx.asset.update({
      where: { id: asset.id },
      data: { status: "ASSIGNED", condition: input.issueCondition },
    });
  });

  await audit(session, {
    action: "asset.issued",
    entityType: "Asset",
    entityId: asset.id,
    summary: `Issued ${asset.name} (${asset.assetTag}) to ${employee.firstName} ${employee.lastName}`,
  });

  const userId = await userIdForEmployee(employee.id);
  if (userId) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "ASSET_ASSIGNED",
      title: `${asset.name} was issued to you`,
      body: `Tag ${asset.assetTag}. It stays on your record until it is returned.`,
      linkUrl: "/me",
    });
  }

  revalidatePath("/assets");
  revalidatePath(`/assets/${asset.id}`);
  revalidatePath("/me");
  return { success: true };
}

const returnSchema = z.object({
  assignmentId: z.string().min(1),
  returnedOn: z.string().min(1, "When did it come back?"),
  returnCondition: z.enum(CONDITIONS),
  returnNote: z.string().trim().max(500).optional(),
  /** Damaged or lost kit doesn't go back on the shelf. */
  nextStatus: z.enum(["AVAILABLE", "IN_REPAIR", "RETIRED", "LOST"]),
});

export async function returnAssetAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "asset.manage");

  const parsed = returnSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const assignment = await db.assetAssignment.findFirst({
    where: { id: input.assignmentId },
    include: {
      asset: { select: { id: true, name: true, assetTag: true } },
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  if (!assignment) return { error: "That assignment no longer exists." };
  if (assignment.returnedOn) {
    return { error: "That asset has already been returned." };
  }

  await rawDb.$transaction(async (tx) => {
    await tx.assetAssignment.update({
      where: { id: assignment.id },
      data: {
        returnedOn: toDateOnly(new Date(input.returnedOn)),
        returnCondition: input.returnCondition,
        returnNote: input.returnNote || null,
      },
    });

    await tx.asset.update({
      where: { id: assignment.assetId },
      data: { status: input.nextStatus, condition: input.returnCondition },
    });
  });

  await audit(session, {
    action: "asset.returned",
    entityType: "Asset",
    entityId: assignment.assetId,
    summary: `${assignment.asset.name} (${assignment.asset.assetTag}) returned by ${assignment.employee.firstName} ${assignment.employee.lastName} in ${input.returnCondition.toLowerCase()} condition`,
  });

  revalidatePath("/assets");
  revalidatePath(`/assets/${assignment.assetId}`);
  revalidatePath("/me");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the category").max(60),
  depreciationYears: z.string().optional(),
});

export async function saveAssetCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "asset.manage");

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, name } = parsed.data;
  const years = parsed.data.depreciationYears
    ? Number(parsed.data.depreciationYears)
    : null;

  if (years !== null && (!Number.isInteger(years) || years < 1 || years > 40)) {
    return {
      fieldErrors: { depreciationYears: "Give a whole number of years, 1 to 40." },
    };
  }

  const db = orgDb(session.org.id);

  const clash = await db.assetCategory.findFirst({
    where: { name, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { fieldErrors: { name: "That category already exists." } };

  if (id) {
    await db.assetCategory.update({
      where: { id },
      data: { name, depreciationYears: years },
    });
  } else {
    await db.assetCategory.create({
      data: { orgId: session.org.id, name, depreciationYears: years },
    });
  }

  revalidatePath("/assets");
  return { success: true };
}

export async function deleteAssetCategoryAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "asset.manage");

  const db = orgDb(session.org.id);
  const category = await db.assetCategory.findFirst({
    where: { id },
    include: { _count: { select: { assets: true } } },
  });
  if (!category) return { error: "That category no longer exists." };

  // Refusing beats silently detaching every laptop from its category.
  if (category._count.assets > 0) {
    return {
      error: `${category._count.assets} asset${
        category._count.assets === 1 ? " is" : "s are"
      } in ${category.name}. Move them first.`,
    };
  }

  await db.assetCategory.delete({ where: { id } });
  revalidatePath("/assets");
  return { success: true };
}
