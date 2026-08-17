"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";

import { orgDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notifyMany } from "../notifications";
import { emitWebhook } from "../webhooks";
import { canReachEmployee } from "../scope";
import { toDateOnly } from "../dates";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Policies and employee documents.
 *
 * The version rule is the interesting part. A policy edit either is or isn't
 * material: fixing a typo should not invalidate three hundred acknowledgements,
 * and rewriting the leave rules absolutely should. So the author says which it
 * was, and the version — and therefore everyone's obligation to re-read —
 * follows from that decision rather than from a diff we cannot judge.
 */

const policySchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Give the policy a title").max(160),
  category: z.string().trim().min(2).max(60),
  summary: z.string().trim().max(300).optional(),
  body: z.string().trim().min(20, "A policy needs some content").max(60_000),
  requiresAcknowledgement: z.string().optional(),
  effectiveFrom: z.string().optional(),
  /** "publish" makes it live; "material" also bumps the version. */
  intent: z.string().optional(),
  material: z.string().optional(),
});

export async function savePolicyAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "policy.manage");

  const parsed = policySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;
  const db = orgDb(session.org.id);
  const publishing = input.intent === "publish";
  const material = input.material === "on";

  const data = {
    title: input.title,
    category: input.category,
    summary: input.summary || null,
    body: input.body,
    requiresAcknowledgement: input.requiresAcknowledgement === "on",
    effectiveFrom: input.effectiveFrom
      ? toDateOnly(new Date(input.effectiveFrom))
      : null,
  };

  let policyId: string;
  let version: number;
  let wasPublished = false;

  if (input.id) {
    const existing = await db.policy.findFirst({ where: { id: input.id } });
    if (!existing) return { error: "That policy no longer exists." };

    wasPublished = existing.publishedAt !== null;
    // A material change to an already-published policy is a new version.
    version =
      material && wasPublished ? existing.version + 1 : existing.version;

    await db.policy.update({
      where: { id: input.id },
      data: {
        ...data,
        version,
        ...(publishing && !wasPublished ? { publishedAt: new Date() } : {}),
      },
    });
    policyId = input.id;
  } else {
    const created = await db.policy.create({
      data: {
        orgId: session.org.id,
        ...data,
        version: 1,
        authorId: session.user.id,
        publishedAt: publishing ? new Date() : null,
      },
    });
    policyId = created.id;
    version = 1;
  }

  const nowLive = publishing || wasPublished;

  await audit(session, {
    action: input.id ? "policy.updated" : "policy.published",
    entityType: "Policy",
    entityId: policyId,
    summary: `${input.id ? "Updated" : "Created"} "${input.title}"${
      material && wasPublished ? ` — new version ${version}, re-acknowledgement required` : ""
    }`,
  });

  // Everyone is told about a newly published policy, and about a material
  // revision — those are the two moments their obligation changes.
  if (nowLive && data.requiresAcknowledgement && (publishing || material)) {
    const users = await db.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    await notifyMany(
      users.map((user) => ({
        orgId: session.org.id,
        userId: user.id,
        type: "POLICY_PUBLISHED" as const,
        title:
          material && wasPublished
            ? `"${input.title}" was revised`
            : `New policy: ${input.title}`,
        body: "Please read and acknowledge it.",
        linkUrl: `/policies/${policyId}`,
      })),
    );

    await audit(session, {
      action: "policy.published",
      entityType: "Policy",
      entityId: policyId,
      summary: `Published version ${version} of "${input.title}" to ${users.length} people`,
    });

    await emitWebhook(session.org.id, "policy.published", {
      policyId,
      title: input.title,
      version,
    });
  }

  revalidatePath("/policies");
  revalidatePath(`/policies/${policyId}`);
  redirect(`/policies/${policyId}`);
}

export async function archivePolicyAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "policy.manage");

  const db = orgDb(session.org.id);
  const policy = await db.policy.findFirst({ where: { id } });
  if (!policy) return { error: "That policy no longer exists." };

  await db.policy.update({
    where: { id },
    data: { isArchived: !policy.isArchived },
  });

  await audit(session, {
    action: "policy.archived",
    entityType: "Policy",
    entityId: id,
    summary: `${policy.isArchived ? "Restored" : "Archived"} "${policy.title}"`,
  });

  revalidatePath("/policies");
  revalidatePath(`/policies/${id}`);
  return { success: true };
}

/**
 * Acknowledging a policy.
 *
 * The IP address is recorded alongside the timestamp, which is what makes the
 * receipt worth anything later. Idempotent per version: pressing the button
 * twice does not create a second receipt, and the unique index says so too.
 */
export async function acknowledgePolicyAction(
  policyId: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "policy.read");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const db = orgDb(session.org.id);
  const policy = await db.policy.findFirst({ where: { id: policyId } });
  if (!policy) return { error: "That policy no longer exists." };
  if (!policy.publishedAt || policy.isArchived) {
    return { error: "That policy isn't live." };
  }

  const headerList = await headers();
  const ip =
    headerList.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ??
    headerList.get("x-real-ip")?.slice(0, 64) ??
    null;

  await db.policyAcknowledgement.upsert({
    where: {
      policyId_employeeId_version: {
        policyId,
        employeeId: session.employee.id,
        version: policy.version,
      },
    },
    create: {
      orgId: session.org.id,
      policyId,
      employeeId: session.employee.id,
      version: policy.version,
      ipAddress: ip,
    },
    update: {},
  });

  await audit(session, {
    action: "policy.acknowledged",
    entityType: "Policy",
    entityId: policyId,
    summary: `Acknowledged "${policy.title}" version ${policy.version}`,
  });

  revalidatePath(`/policies/${policyId}`);
  revalidatePath("/policies");
  revalidatePath("/me");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Employee document vault
// ---------------------------------------------------------------------------

const documentSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().trim().min(2, "Name the document").max(160),
  category: z.enum([
    "ID_PROOF",
    "CONTRACT",
    "CERTIFICATE",
    "EDUCATION",
    "PAYROLL",
    "MEDICAL",
    "OTHER",
  ]),
  fileUrl: z.string().min(1, "Choose a file"),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().max(120).optional(),
  sizeBytes: z.string().optional(),
  issuedOn: z.string().optional(),
  expiresOn: z.string().optional(),
  isConfidential: z.string().optional(),
});

/**
 * 4 MB. Documents are stored as data: URIs on the row rather than in object
 * storage — the same trade the letterhead logo makes, so a self-hosted install
 * needs Postgres and nothing else, and a `pg_dump` is a complete backup. The
 * ceiling is what keeps that honest; docs/DOCUMENTS.md explains the reasoning
 * and what to change if you outgrow it.
 */
const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;

export async function uploadEmployeeDocumentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "document.manage");

  const parsed = documentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  if (input.fileUrl.length > MAX_DOCUMENT_BYTES) {
    return { fieldErrors: { fileUrl: "That file is over 4 MB." } };
  }

  const db = orgDb(session.org.id);
  const employee = await db.employee.findFirst({
    where: { id: input.employeeId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!employee) return { error: "That employee no longer exists." };

  const document = await db.employeeDocument.create({
    data: {
      orgId: session.org.id,
      employeeId: employee.id,
      name: input.name,
      category: input.category,
      fileUrl: input.fileUrl,
      fileName: input.fileName,
      mimeType: input.mimeType || null,
      sizeBytes: input.sizeBytes ? Number(input.sizeBytes) : null,
      issuedOn: input.issuedOn ? toDateOnly(new Date(input.issuedOn)) : null,
      expiresOn: input.expiresOn ? toDateOnly(new Date(input.expiresOn)) : null,
      isConfidential: input.isConfidential === "on",
      uploadedById: session.user.id,
    },
  });

  await audit(session, {
    action: "document.uploaded",
    entityType: "EmployeeDocument",
    entityId: document.id,
    summary: `Uploaded "${input.name}" to ${employee.firstName} ${employee.lastName}'s record`,
  });

  revalidatePath(`/people/${employee.id}`);
  revalidatePath("/me");
  return { success: true };
}

export async function deleteEmployeeDocumentAction(
  id: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "document.manage");

  const db = orgDb(session.org.id);
  const document = await db.employeeDocument.findFirst({
    where: { id },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!document) return { error: "That document no longer exists." };

  await db.employeeDocument.delete({ where: { id } });

  await audit(session, {
    action: "document.deleted",
    entityType: "EmployeeDocument",
    entityId: id,
    summary: `Deleted "${document.name}" from ${document.employee.firstName} ${document.employee.lastName}'s record`,
  });

  revalidatePath(`/people/${document.employee.id}`);
  return { success: true };
}

/**
 * Reading a document out of the vault.
 *
 * Separate from the list query because opening a file is an event worth
 * recording: PRD §8.28 asks for data-*access* logs, not only change logs.
 * Returns the data URI so the client can open it in a new tab.
 */
export async function openEmployeeDocumentAction(
  id: string,
): Promise<FormState & { url?: string }> {
  const session = await requireAuth();

  const db = orgDb(session.org.id);
  const document = await db.employeeDocument.findFirst({
    where: { id },
    include: { employee: { select: { id: true, firstName: true, lastName: true } } },
  });
  if (!document) return { error: "That document no longer exists." };

  const isSelf = document.employeeId === session.employee?.id;
  if (!isSelf) {
    const orgWide =
      can(session, "document.read.all") || can(session, "document.manage");
    if (!orgWide) {
      const reachable =
        can(session, "document.read.team") &&
        !document.isConfidential &&
        (await canReachEmployee(session, "document.read", document.employeeId));
      if (!reachable) {
        return { error: "You do not have permission to open that document." };
      }
    }
  }

  await audit(session, {
    action: "document.viewed",
    entityType: "EmployeeDocument",
    entityId: id,
    summary: `Opened "${document.name}" from ${document.employee.firstName} ${document.employee.lastName}'s record`,
  });

  return { success: true, url: document.fileUrl };
}
