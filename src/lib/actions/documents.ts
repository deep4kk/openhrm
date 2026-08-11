"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { orgDb } from "../db";
import { sendMail } from "../mail";
import { formatDate } from "../dates";
import { draftTemplate } from "../documents/ai";
import { GeminiError, isConfigured } from "../ai/gemini";
import { resolveAutofill } from "../documents/autofill";
import { markdownToPlainText } from "../documents/markdown";
import { formatValues, renderLetterDocument } from "../documents/render";
import { LETTER_KINDS, type LetterVariable } from "../documents/types";
import {
  applyVariables,
  formVariables,
  missingRequired,
  parseVariables,
  reconcile,
} from "../documents/variables";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Writes for the documents module.
 *
 * The shape of the feature: an admin writes a **template** once — by hand or by
 * describing it to Gemini — and then **generates** a letter from it for a named
 * person, which freezes the finished HTML and composes a mail draft that a
 * human still has to read and send.
 *
 * Two decisions are load-bearing throughout:
 *
 *  - **Generation freezes the document.** `renderedHtml` is written at issue
 *    time and never recomputed. Editing a template must not retroactively alter
 *    letters already issued under it.
 *
 *  - **Nothing is emailed automatically.** Every path here stops at a draft.
 *    The one action that actually sends is `sendMailDraftAction`, and it runs
 *    only when someone presses send.
 */

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const KIND_VALUES = LETTER_KINDS.map((k) => k.value) as [string, ...string[]];

const templateSchema = z.object({
  id: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  name: z.string().trim().min(1, "Give the template a name").max(120),
  kind: z.enum(KIND_VALUES, { error: "Pick a document type" }),
  description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  subject: z.string().trim().min(1, "A subject line is required").max(200),
  body: z.string().trim().min(1, "The letter body cannot be empty").max(60_000),
  aiBrief: z
    .string()
    .trim()
    .max(4_000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export async function saveTemplateAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const parsed = templateSchema.safeParse({
    id: formData.get("id") ?? undefined,
    name: formData.get("name"),
    kind: formData.get("kind"),
    description: formData.get("description") ?? undefined,
    subject: formData.get("subject"),
    body: formData.get("body"),
    aiBrief: formData.get("aiBrief") ?? undefined,
  });

  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, ...data } = parsed.data;

  // The variable editor posts its definitions as JSON. They are reconciled
  // against the body regardless, so a stale or absent list self-heals rather
  // than leaving the generate form missing a field.
  const submitted = parseVariables(safeJson(formData.get("variables")));
  const variables = reconcile(data.body, data.subject, submitted);

  const isActive = formData.get("isActive") !== null;
  const db = orgDb(session.org.id);

  // The unique index is (orgId, name); checking first turns a Prisma error code
  // into a message pointing at the field the user has to change.
  const clash = await db.letterTemplate.findFirst({
    where: { name: data.name, ...(id ? { NOT: { id } } : {}) },
    select: { id: true },
  });
  if (clash) {
    return { fieldErrors: { name: "A template with this name already exists." } };
  }

  const saved = id
    ? await db.letterTemplate.update({
        where: { id },
        data: { ...data, isActive, variables: variables as unknown as object },
      })
    : await db.letterTemplate.create({
        data: {
          orgId: session.org.id,
          ...data,
          isActive,
          variables: variables as unknown as object,
          createdById: session.user.id,
        },
      });

  await audit(session, {
    action: "letter.template.saved",
    entityType: "LetterTemplate",
    entityId: saved.id,
    summary: `${id ? "Updated" : "Created"} the "${saved.name}" template`,
  });

  revalidatePath("/documents");
  revalidatePath("/documents/templates");
  if (id) revalidatePath(`/documents/templates/${id}`);

  return { success: true };
}

export async function deleteTemplateAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const db = orgDb(session.org.id);
  const template = await db.letterTemplate.findFirst({
    where: { id },
    select: { id: true, name: true, _count: { select: { letters: true } } },
  });
  if (!template) return { error: "That template no longer exists." };

  // Letters keep a null templateId on delete rather than cascading, so deleting
  // would not destroy anything — but it would silently break the provenance of
  // documents already issued. Deactivating keeps the link and hides it from the
  // list, which is what the user almost always meant.
  if (template._count.letters > 0) {
    return {
      error: `This template has issued ${template._count.letters} letter${
        template._count.letters === 1 ? "" : "s"
      }. Deactivate it instead — deleting would cut those letters loose from the template they came from.`,
    };
  }

  await db.letterTemplate.delete({ where: { id } });

  await audit(session, {
    action: "letter.template.deleted",
    entityType: "LetterTemplate",
    entityId: id,
    summary: `Deleted the "${template.name}" template`,
  });

  revalidatePath("/documents/templates");
  return { success: true };
}

// ---------------------------------------------------------------------------
// AI drafting
// ---------------------------------------------------------------------------

export interface DraftResult {
  ok: boolean;
  error?: string;
  draft?: {
    name: string;
    kind: string;
    subject: string;
    body: string;
    variables: LetterVariable[];
  };
}

/**
 * Describe the letter you want; get a template back.
 *
 * Returns a result object rather than throwing, because the caller is a button
 * in a panel rather than a form submission — a failed draft should leave the
 * editor exactly as it was, with an explanation above it.
 */
export async function draftTemplateAction(
  brief: string,
  existingBody?: string,
): Promise<DraftResult> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  if (!isConfigured()) {
    return {
      ok: false,
      error:
        "AI drafting is not configured on this server. Set GEMINI_API_KEY in .env, or write the template by hand.",
    };
  }

  const trimmed = brief.trim();
  if (trimmed.length < 10) {
    return { ok: false, error: "Describe the letter in a sentence or two so there is something to work from." };
  }
  if (trimmed.length > 4_000) {
    return { ok: false, error: "That brief is too long. Keep it under 4,000 characters." };
  }

  try {
    const draft = await draftTemplate({
      brief: trimmed,
      orgName: session.org.name,
      currency: session.org.currency,
      existingBody: existingBody?.trim() || undefined,
    });

    return { ok: true, draft };
  } catch (error) {
    if (error instanceof GeminiError) return { ok: false, error: error.message };
    console.error("[documents] AI drafting failed", error);
    return { ok: false, error: "Could not draft the template. Try again." };
  }
}

// ---------------------------------------------------------------------------
// Autofill
// ---------------------------------------------------------------------------

export interface AutofillResponse {
  ok: boolean;
  error?: string;
  values?: Record<string, string>;
  compensationWithheld?: boolean;
  recipient?: { name: string; email: string | null };
}

/** Pull one employee's details into the generate form. */
export async function autofillAction(employeeId: string): Promise<AutofillResponse> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const result = await resolveAutofill(session, employeeId);
  if (!result) {
    return { ok: false, error: "You do not have access to that employee's record." };
  }

  return {
    ok: true,
    values: result.values,
    compensationWithheld: result.compensationWithheld,
    recipient: {
      name: result.employee.name,
      email: result.employee.personalEmail ?? result.employee.workEmail,
    },
  };
}

// ---------------------------------------------------------------------------
// Generating a letter
// ---------------------------------------------------------------------------

/** Reference-number prefixes, so a filing cabinet sorts sensibly. */
const KIND_PREFIX: Record<string, string> = {
  offer: "OL",
  appointment: "AL",
  confirmation: "CL",
  increment: "INC",
  promotion: "PRO",
  warning: "WRN",
  experience: "EXP",
  relieving: "REL",
  fnf: "FNF",
  custom: "DOC",
};

const generateSchema = z.object({
  templateId: z.string().trim().min(1, "Pick a template"),
  employeeId: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
  recipientName: z.string().trim().min(1, "Who is this letter for?").max(160),
  recipientEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine((v) => v === undefined || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: "That doesn't look like an email address",
    }),
});

export async function generateLetterAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const parsed = generateSchema.safeParse({
    templateId: formData.get("templateId"),
    employeeId: formData.get("employeeId") ?? undefined,
    recipientName: formData.get("recipientName"),
    recipientEmail: formData.get("recipientEmail") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { templateId, employeeId, recipientName, recipientEmail } = parsed.data;
  const db = orgDb(session.org.id);

  const template = await db.letterTemplate.findFirst({ where: { id: templateId } });
  if (!template) return { error: "That template no longer exists." };
  if (!template.isActive) {
    return { error: "That template is inactive. Reactivate it before issuing letters from it." };
  }

  const variables = reconcile(template.body, template.subject, parseVariables(template.variables));
  // Tokens like {{org.name}} are resolved from the organisation below, not
  // posted by the form, so they are excluded from both loops here.
  const filled = formVariables(variables);

  // Values arrive as var_<key> so they cannot collide with the form's own
  // fields — a template is free to declare a variable called "templateId".
  const values: Record<string, string> = {};
  for (const variable of filled) {
    values[variable.key] = String(formData.get(`var_${variable.key}`) ?? "").trim();
  }

  // A user without compensation access cannot autofill salary, but nothing
  // stops them typing a figure — that is intended, and it is why the values are
  // recorded against their name in the audit trail.
  const missing = missingRequired(filled, values);
  if (missing.length > 0) {
    return {
      fieldErrors: Object.fromEntries(
        missing.map((variable) => [`var_${variable.key}`, `${variable.label} is required`]),
      ),
    };
  }

  if (employeeId) {
    const reachable = await db.employee.findFirst({
      where: { id: employeeId },
      select: { id: true },
    });
    if (!reachable) return { error: "That employee no longer exists." };
  }

  const org = await db.organization.findFirst({ where: { id: session.org.id } });
  if (!org) return { error: "That organisation no longer exists." };

  // Reserve the reference number. `increment` is applied by Postgres, so two
  // people issuing a letter at the same moment get different numbers rather
  // than both reading the same value and writing it back.
  const issuedAt = new Date();
  const sequence = await db.organization.update({
    where: { id: session.org.id },
    data: { letterSequence: { increment: 1 } },
    select: { letterSequence: true },
  });

  const letterNumber = `${KIND_PREFIX[template.kind] ?? "DOC"}/${issuedAt.getFullYear()}/${String(
    sequence.letterSequence,
  ).padStart(4, "0")}`;

  // System tokens are resolved here, never typed: the company's own details and
  // the letter's identity are facts about the issue, not user input.
  const systemValues: Record<string, string> = {
    "org.name": org.name,
    "org.address": org.letterheadAddress ?? "",
    "org.website": org.website ?? "",
    "org.email": org.supportEmail ?? "",
    "org.signatoryName": org.signatoryName ?? "",
    "org.signatoryTitle": org.signatoryTitle ?? "",
    "letter.date": formatDate(issuedAt),
    "letter.number": letterNumber,
    "letter.recipientName": recipientName,
  };

  const resolved = {
    ...formatValues(filled, values, org.currency),
    ...systemValues,
  };
  const known = new Set([...variables.map((v) => v.key), ...Object.keys(systemValues)]);

  const body = applyVariables(template.body, resolved, known);
  const title = applyVariables(template.subject, resolved, known);

  const renderedHtml = renderLetterDocument({
    letterhead: {
      orgName: org.name,
      logoUrl: org.logoUrl,
      address: org.letterheadAddress,
      website: org.website,
      email: org.supportEmail,
      signatoryName: org.signatoryName,
      signatoryTitle: org.signatoryTitle,
    },
    body,
    letterNumber,
    issuedAt,
  });

  const letter = await db.generatedLetter.create({
    data: {
      orgId: session.org.id,
      templateId: template.id,
      employeeId: employeeId ?? null,
      letterNumber,
      title: title.slice(0, 200),
      recipientName,
      recipientEmail: recipientEmail ?? null,
      body,
      renderedHtml,
      variables: values as unknown as object,
      issuedById: session.user.id,
      issuedAt,
    },
  });

  // The mail draft is composed now and sent never — see sendMailDraftAction.
  if (recipientEmail) {
    await db.letterMailDraft.create({
      data: {
        orgId: session.org.id,
        letterId: letter.id,
        to: recipientEmail,
        subject: title.slice(0, 200),
        body: defaultCoveringNote(recipientName, title, org.name, session.user.name),
        createdById: session.user.id,
      },
    });
  }

  await audit(session, {
    action: "letter.generated",
    entityType: "GeneratedLetter",
    entityId: letter.id,
    summary: `Issued ${letterNumber} — ${title} — to ${recipientName}`,
    after: {
      letterNumber,
      template: template.name,
      recipient: recipientName,
      // The values are recorded so a disputed figure on an offer letter can be
      // traced to who entered it. Salary numbers included, deliberately.
      variables: values,
    },
  });

  revalidatePath("/documents");
  if (employeeId) revalidatePath(`/people/${employeeId}`);

  redirect(`/documents/${letter.id}`);
}

function defaultCoveringNote(
  recipient: string,
  title: string,
  orgName: string,
  senderName: string,
): string {
  const firstName = recipient.split(/\s+/)[0] || recipient;
  return [
    `Dear ${firstName},`,
    "",
    `Please find your ${title.toLowerCase()} below.`,
    "",
    "Do let us know if anything needs correcting.",
    "",
    "Regards,",
    senderName,
    orgName,
  ].join("\n");
}

export async function deleteLetterAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const db = orgDb(session.org.id);
  const letter = await db.generatedLetter.findFirst({
    where: { id },
    select: {
      id: true,
      letterNumber: true,
      title: true,
      recipientName: true,
      employeeId: true,
      mailDrafts: { where: { status: "SENT" }, select: { id: true }, take: 1 },
    },
  });
  if (!letter) return { error: "That document no longer exists." };

  // A letter that has already gone out is a record of something that happened.
  // Deleting it would leave the recipient holding a document the system denies
  // issuing, so it stays.
  if (letter.mailDrafts.length > 0) {
    return {
      error:
        "This document has already been emailed, so it cannot be deleted — it is a record of what was sent.",
    };
  }

  await db.generatedLetter.delete({ where: { id } });

  await audit(session, {
    action: "document.deleted",
    entityType: "GeneratedLetter",
    entityId: id,
    summary: `Deleted ${letter.letterNumber ?? "a document"} — ${letter.title}`,
  });

  revalidatePath("/documents");
  if (letter.employeeId) revalidatePath(`/people/${letter.employeeId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// The mail draft
// ---------------------------------------------------------------------------

const draftSchema = z.object({
  id: z.string().trim().min(1),
  to: z
    .string()
    .trim()
    .min(1, "A recipient address is required")
    .max(254)
    .refine((v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), {
      message: "That doesn't look like an email address",
    }),
  cc: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === "" ? undefined : v))
    .refine(
      (v) =>
        v === undefined ||
        v.split(",").every((address) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address.trim())),
      { message: "Separate addresses with commas" },
    ),
  subject: z.string().trim().min(1, "A subject is required").max(200),
  body: z.string().trim().min(1, "The message cannot be empty").max(20_000),
});

export async function saveMailDraftAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const parsed = draftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  const { id, ...data } = parsed.data;

  const db = orgDb(session.org.id);
  const draft = await db.letterMailDraft.findFirst({
    where: { id },
    select: { id: true, status: true, letterId: true },
  });
  if (!draft) return { error: "That draft no longer exists." };
  if (draft.status === "SENT") {
    return { error: "This message has already been sent and can no longer be edited." };
  }

  await db.letterMailDraft.update({
    where: { id },
    data: { ...data, cc: data.cc ?? null, status: "DRAFT", error: null },
  });

  revalidatePath(`/documents/${draft.letterId}`);
  return { success: true };
}

/**
 * The one action in this file that sends anything.
 *
 * Reached only from the Send button on a draft a human has read. The letter is
 * inlined into the message body as styled HTML — the same frozen markup that
 * was previewed and printed — with a plain-text alternative for clients that
 * do not render HTML.
 */
export async function sendMailDraftAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const db = orgDb(session.org.id);
  const draft = await db.letterMailDraft.findFirst({
    where: { id },
    include: {
      letter: {
        select: { id: true, title: true, body: true, renderedHtml: true, letterNumber: true },
      },
    },
  });
  if (!draft) return { error: "That draft no longer exists." };
  if (draft.status === "SENT") return { error: "This message has already been sent." };

  const html = [
    `<div style="background:#f4f4f5;padding:24px 12px;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif">`,
    `<div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;padding:32px">`,
    `<div style="font-size:14px;line-height:1.6;color:#3f3f46;margin:0 0 24px;white-space:pre-wrap">${escapeHtml(draft.body)}</div>`,
    `<hr style="border:0;border-top:1px solid #e4e4e7;margin:0 0 28px" />`,
    draft.letter.renderedHtml,
    `</div></div>`,
  ].join("\n");

  const text = [
    draft.body,
    "",
    "———",
    "",
    markdownToPlainText(draft.letter.body),
  ].join("\n");

  // sendMail() never throws — a failed notification must not roll back the
  // action that caused it — so the outcome comes back as a value. The user is
  // watching this one, and "sent" has to mean sent.
  const result = await sendMail({
    to: draft.cc ? `${draft.to}, ${draft.cc}` : draft.to,
    subject: draft.subject,
    text,
    html,
  });

  if (result.status === "failed") {
    await db.letterMailDraft.update({
      where: { id },
      data: { status: "FAILED", error: result.error.slice(0, 500) },
    });
    revalidatePath(`/documents/${draft.letterId}`);
    return { error: `The message could not be sent: ${result.error}` };
  }

  // `logged` means SMTP is unconfigured and the message went to the server
  // console. The draft is still marked sent — the send was performed, and the
  // screen warns about the unconfigured mailer before the button is pressed
  // rather than pretending afterwards.
  await db.letterMailDraft.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date(), error: null },
  });

  await audit(session, {
    action: "letter.mailed",
    entityType: "GeneratedLetter",
    entityId: draft.letterId,
    summary: `Emailed ${draft.letter.letterNumber ?? draft.letter.title} to ${draft.to}`,
  });

  revalidatePath("/documents");
  revalidatePath(`/documents/${draft.letterId}`);
  return { success: true };
}

/** Compose a draft for a letter that was issued without a recipient address. */
export async function createMailDraftAction(letterId: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "letter.manage");

  const db = orgDb(session.org.id);
  const letter = await db.generatedLetter.findFirst({
    where: { id: letterId },
    select: {
      id: true,
      title: true,
      recipientName: true,
      recipientEmail: true,
      employee: { select: { workEmail: true, personalEmail: true } },
    },
  });
  if (!letter) return { error: "That document no longer exists." };

  await db.letterMailDraft.create({
    data: {
      orgId: session.org.id,
      letterId: letter.id,
      to: letter.recipientEmail ?? letter.employee?.personalEmail ?? letter.employee?.workEmail ?? "",
      subject: letter.title,
      body: defaultCoveringNote(
        letter.recipientName,
        letter.title,
        session.org.name,
        session.user.name,
      ),
      createdById: session.user.id,
    },
  });

  revalidatePath(`/documents/${letterId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeJson(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Whether the AI panel should offer to draft. Read by the template editor. */
export async function aiAvailableAction(): Promise<boolean> {
  const session = await requireAuth();
  return can(session, "letter.manage") && isConfigured();
}
