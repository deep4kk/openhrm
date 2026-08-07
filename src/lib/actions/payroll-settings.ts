"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, requireAuth } from "../auth";
import { audit } from "../audit";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Editing the compliance pack.
 *
 * Kept in its own module rather than in actions/payroll.ts because it is a
 * different job with a different permission: `payroll.statutory.manage` changes
 * the *rules*, `payroll.run` applies them. An organisation that wants an
 * accountant to own the rates and HR to run the month can express that.
 */

const slabSchema = z.array(
  z.object({
    upTo: z.number().nullable(),
    amount: z.number().optional(),
    rate: z.number().optional(),
  }),
);

const settingsSchema = z.object({
  pfEnabled: z.string().optional(),
  pfWageCeiling: z.coerce.number().min(0),
  pfEmployeeRate: z.coerce.number().min(0).max(100),
  pfEmployerRate: z.coerce.number().min(0).max(100),
  pfCapAtCeiling: z.string().optional(),

  esiEnabled: z.string().optional(),
  esiWageCeiling: z.coerce.number().min(0),
  esiEmployeeRate: z.coerce.number().min(0).max(100),
  esiEmployerRate: z.coerce.number().min(0).max(100),

  ptEnabled: z.string().optional(),
  ptSlabs: z.string(),

  tdsEnabled: z.string().optional(),
  tdsRegime: z.enum(["NEW", "OLD"]),
  standardDeduction: z.coerce.number().min(0),
  tdsSlabs: z.string(),

  gratuityEnabled: z.string().optional(),
  gratuityMinYears: z.coerce.number().int().min(0).max(20),
});

export async function saveStatutorySettingsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "payroll.statutory.manage");

  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  // Slabs are typed by hand, so a bad paste is the expected failure — say which
  // field and why, rather than throwing a JSON parse error at the whole form.
  const ptSlabs = parseSlabs(input.ptSlabs);
  if ("error" in ptSlabs) return { fieldErrors: { ptSlabs: ptSlabs.error } };

  const tdsSlabs = parseSlabs(input.tdsSlabs);
  if ("error" in tdsSlabs) return { fieldErrors: { tdsSlabs: tdsSlabs.error } };

  const db = orgDb(session.org.id);
  const existing = await db.statutorySetting.findFirst({
    where: { orgId: session.org.id },
  });
  if (!existing) {
    return { error: "This organisation has no statutory record to update." };
  }

  await db.statutorySetting.update({
    where: { id: existing.id },
    data: {
      pfEnabled: input.pfEnabled === "on",
      pfWageCeiling: input.pfWageCeiling,
      pfEmployeeRate: input.pfEmployeeRate,
      pfEmployerRate: input.pfEmployerRate,
      pfCapAtCeiling: input.pfCapAtCeiling === "on",
      esiEnabled: input.esiEnabled === "on",
      esiWageCeiling: input.esiWageCeiling,
      esiEmployeeRate: input.esiEmployeeRate,
      esiEmployerRate: input.esiEmployerRate,
      ptEnabled: input.ptEnabled === "on",
      ptSlabs: ptSlabs.value,
      tdsEnabled: input.tdsEnabled === "on",
      tdsRegime: input.tdsRegime,
      standardDeduction: input.standardDeduction,
      tdsSlabs: tdsSlabs.value,
      gratuityEnabled: input.gratuityEnabled === "on",
      gratuityMinYears: input.gratuityMinYears,
    },
  });

  await audit(session, {
    action: "payroll.statutory.updated",
    entityType: "StatutorySetting",
    entityId: existing.id,
    summary: "Updated statutory rates and slabs",
    before: {
      pfEmployeeRate: String(existing.pfEmployeeRate),
      esiEmployeeRate: String(existing.esiEmployeeRate),
      standardDeduction: String(existing.standardDeduction),
    },
    after: {
      pfEmployeeRate: String(input.pfEmployeeRate),
      esiEmployeeRate: String(input.esiEmployeeRate),
      standardDeduction: String(input.standardDeduction),
    },
  });

  revalidatePath("/settings/statutory");
  revalidatePath("/payroll");
  return { success: true };
}

function parseSlabs(
  raw: string,
): { value: z.infer<typeof slabSchema> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "That isn't valid JSON. Check for a trailing comma." };
  }

  const result = slabSchema.safeParse(parsed);
  if (!result.success) {
    return {
      error:
        'Each slab needs an "upTo" (a number, or null for the top band) and either an "amount" or a "rate".',
    };
  }

  // An open-ended top band is what stops a high earner falling through every
  // slab and being taxed nothing.
  if (result.data.length > 0 && result.data.at(-1)?.upTo !== null) {
    return {
      error: 'The last slab must have "upTo": null so it covers everything above.',
    };
  }

  return { value: result.data };
}
