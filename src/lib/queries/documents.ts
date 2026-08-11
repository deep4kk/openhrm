import "server-only";

import type { AuthContext } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { employeeSelfFilter, resolveEmployeeScope } from "@/lib/scope";
import { parseVariables } from "@/lib/documents/variables";
import type { LetterVariable } from "@/lib/documents/types";

/**
 * Reads for the documents module.
 *
 * Writes live in src/lib/actions/documents.ts. The split is the same one the
 * rest of the app uses: a page composes queries, a form calls an action.
 */

export async function listTemplates(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.letterTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      kind: true,
      description: true,
      subject: true,
      isActive: true,
      aiBrief: true,
      variables: true,
      updatedAt: true,
      _count: { select: { letters: true } },
    },
  });
}

export interface TemplateDetail {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  subject: string;
  body: string;
  aiBrief: string | null;
  isActive: boolean;
  variables: LetterVariable[];
}

export async function getTemplate(
  session: AuthContext,
  id: string,
): Promise<TemplateDetail | null> {
  const db = orgDb(session.org.id);
  const row = await db.letterTemplate.findFirst({ where: { id } });
  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    description: row.description,
    subject: row.subject,
    body: row.body,
    aiBrief: row.aiBrief,
    isActive: row.isActive,
    variables: parseVariables(row.variables),
  };
}

/** Active templates only — the list shown when starting a new document. */
export async function listUsableTemplates(session: AuthContext) {
  const db = orgDb(session.org.id);
  return db.letterTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true, description: true, subject: true },
  });
}

export async function listLetters(
  session: AuthContext,
  filters: { kind?: string; employeeId?: string; take?: number } = {},
) {
  const db = orgDb(session.org.id);

  return db.generatedLetter.findMany({
    where: {
      ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.kind ? { template: { kind: filters.kind } } : {}),
    },
    orderBy: { issuedAt: "desc" },
    take: filters.take ?? 100,
    select: {
      id: true,
      letterNumber: true,
      title: true,
      recipientName: true,
      recipientEmail: true,
      issuedAt: true,
      signedAt: true,
      template: { select: { name: true, kind: true } },
      employee: { select: { id: true, firstName: true, lastName: true } },
      issuedBy: { select: { name: true } },
      mailDrafts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, sentAt: true },
      },
    },
  });
}

export async function getLetter(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  return db.generatedLetter.findFirst({
    where: { id },
    include: {
      template: { select: { id: true, name: true, kind: true } },
      employee: { select: { id: true, firstName: true, lastName: true, workEmail: true } },
      issuedBy: { select: { name: true } },
      mailDrafts: { orderBy: { createdAt: "desc" } },
    },
  });
}

/** Letters issued to one person — rendered on their profile. */
export async function listLettersForEmployee(session: AuthContext, employeeId: string) {
  const db = orgDb(session.org.id);
  return db.generatedLetter.findMany({
    where: { employeeId },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      letterNumber: true,
      title: true,
      issuedAt: true,
      template: { select: { kind: true } },
    },
  });
}

export async function getMailDraft(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  return db.letterMailDraft.findFirst({
    where: { id },
    include: {
      letter: {
        select: {
          id: true,
          title: true,
          renderedHtml: true,
          body: true,
          recipientName: true,
        },
      },
    },
  });
}

/**
 * Employees the caller may issue a letter about.
 *
 * Constrained to their `employee.read` scope, so a manager sees their reports
 * and an HR admin sees everyone. Exit-status people are included deliberately —
 * relieving and experience letters are written for people who have left.
 */
export async function listAddressableEmployees(session: AuthContext) {
  const scope = await resolveEmployeeScope(session, "employee.read");
  if (!scope) return [];

  const db = orgDb(session.org.id);
  return db.employee.findMany({
    where: { ...employeeSelfFilter(scope) },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      displayName: true,
      workEmail: true,
      status: true,
      designation: { select: { title: true } },
    },
  });
}

/** Headline counts for the documents landing page. */
export async function documentsSummary(session: AuthContext) {
  const db = orgDb(session.org.id);

  const [templates, activeTemplates, letters, pendingDrafts] = await Promise.all([
    db.letterTemplate.count(),
    db.letterTemplate.count({ where: { isActive: true } }),
    db.generatedLetter.count(),
    db.letterMailDraft.count({ where: { status: "DRAFT" } }),
  ]);

  return { templates, activeTemplates, letters, pendingDrafts };
}

/** The letterhead fields printed on every document. */
export async function getLetterhead(session: AuthContext) {
  const db = orgDb(session.org.id);
  const org = await db.organization.findFirst({
    where: { id: session.org.id },
    select: {
      name: true,
      logoUrl: true,
      letterheadAddress: true,
      website: true,
      supportEmail: true,
      signatoryName: true,
      signatoryTitle: true,
      currency: true,
    },
  });
  if (!org) return null;

  return {
    orgName: org.name,
    logoUrl: org.logoUrl,
    address: org.letterheadAddress,
    website: org.website,
    email: org.supportEmail,
    signatoryName: org.signatoryName,
    signatoryTitle: org.signatoryTitle,
    currency: org.currency,
  };
}
