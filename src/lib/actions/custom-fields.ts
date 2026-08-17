"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * The employee-record field builder (PRD §8.3).
 *
 * "T-shirt size", "blood group", "emergency locker number" — the fields every
 * organisation needs and no product can anticipate. Values are stored as
 * strings against a definition, which is the trade this makes: no per-org
 * migrations, and no type-safety past the definition's own `type`, which the
 * form enforces on the way in.
 *
 * The `key` is immutable once created. It is what stored values are keyed on,
 * and renaming it would orphan every value already recorded. The *label* is
 * freely editable, which is what people actually want to change.
 */

const fieldSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(2, "Name the field").max(60),
  key: z
    .string()
    .trim()
    .min(2, "Give it a key")
    .max(40)
    .regex(/^[a-z][a-z0-9_]*$/, "Lower case letters, numbers and underscores")
    .optional(),
  type: z.enum(["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"]),
  section: z.string().trim().max(40).optional(),
  helpText: z.string().trim().max(200).optional(),
  options: z.string().optional(),
  required: z.string().optional(),
});

export async function saveCustomFieldAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "customfield.manage");

  const parsed = fieldSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);

  const options = (input.options ?? "")
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 40);

  if (input.type === "SELECT" && options.length < 2) {
    return {
      fieldErrors: {
        options: "A dropdown needs at least two choices, comma separated.",
      },
    };
  }

  if (input.id) {
    const existing = await db.customFieldDefinition.findFirst({
      where: { id: input.id },
    });
    if (!existing) return { error: "That field no longer exists." };

    // Key and type are frozen: both are load-bearing for values already stored
    // against this definition.
    await db.customFieldDefinition.update({
      where: { id: input.id },
      data: {
        label: input.label,
        section: input.section || "Additional",
        helpText: input.helpText || null,
        options,
        required: input.required === "on",
      },
    });

    await audit(session, {
      action: "org.updated",
      entityType: "CustomFieldDefinition",
      entityId: input.id,
      summary: `Updated custom field "${input.label}"`,
    });
  } else {
    const key = input.key ?? slugify(input.label);

    const clash = await db.customFieldDefinition.findFirst({ where: { key } });
    if (clash) {
      return { fieldErrors: { key: "A field with that key already exists." } };
    }

    const created = await db.customFieldDefinition.create({
      data: {
        orgId: session.org.id,
        key,
        label: input.label,
        type: input.type,
        section: input.section || "Additional",
        helpText: input.helpText || null,
        options,
        required: input.required === "on",
      },
    });

    await audit(session, {
      action: "org.updated",
      entityType: "CustomFieldDefinition",
      entityId: created.id,
      summary: `Added custom field "${input.label}" (${input.type.toLowerCase()})`,
    });
  }

  revalidatePath("/settings/custom-fields");
  revalidatePath("/people");
  return { success: true };
}

export async function deleteCustomFieldAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "customfield.manage");

  const db = orgDb(session.org.id);
  const field = await db.customFieldDefinition.findFirst({
    where: { id },
    include: { _count: { select: { values: true } } },
  });
  if (!field) return { error: "That field no longer exists." };

  // Deleting cascades to every stored value. That is a lot of data to destroy
  // on a mis-click, so a field in use is deactivated instead — it disappears
  // from forms while the values stay readable.
  if (field._count.values > 0) {
    await db.customFieldDefinition.update({
      where: { id },
      data: { isActive: !field.isActive },
    });

    return {
      error: field.isActive
        ? `"${field.label}" holds ${field._count.values} value${
            field._count.values === 1 ? "" : "s"
          }, so it has been hidden from forms rather than deleted.`
        : undefined,
      success: !field.isActive ? undefined : true,
    };
  }

  await db.customFieldDefinition.delete({ where: { id } });

  await audit(session, {
    action: "org.updated",
    entityType: "CustomFieldDefinition",
    entityId: id,
    summary: `Deleted custom field "${field.label}"`,
  });

  revalidatePath("/settings/custom-fields");
  return { success: true };
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  // A key has to start with a letter — "3d_printer_access" would be rejected
  // by the same regex the manual path validates against.
  return /^[a-z]/.test(base) ? base : `field_${base || Date.now()}`;
}
