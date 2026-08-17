import "server-only";

import { orgDb } from "../db";
import type { AuthContext } from "../auth";
import { can } from "../auth";
import { today } from "../dates";

/**
 * Policies and the employee document vault (PRD §8.14, §8.3).
 *
 * Acknowledgements are keyed by policy *version*. A revised handbook is a new
 * thing to agree to, so bumping the version resets who has read it rather than
 * inheriting last year's receipts — which is the only reading of "mandatory
 * acknowledgment tracking" that would survive an audit.
 */

export async function listPolicies(
  session: AuthContext,
  options: { includeArchived?: boolean } = {},
) {
  const db = orgDb(session.org.id);
  const mayManage = can(session, "policy.manage");

  return db.policy.findMany({
    where: {
      ...(options.includeArchived && mayManage ? {} : { isArchived: false }),
      // Readers only see what has actually been published.
      ...(mayManage ? {} : { publishedAt: { not: null } }),
    },
    orderBy: [{ category: "asc" }, { title: "asc" }],
    include: {
      author: { select: { name: true } },
      _count: { select: { acknowledgements: true } },
    },
  });
}

export async function getPolicy(session: AuthContext, id: string) {
  const db = orgDb(session.org.id);
  const mayManage = can(session, "policy.manage");

  const policy = await db.policy.findFirst({
    where: { id },
    include: {
      author: { select: { name: true } },
      acknowledgements: {
        orderBy: { acknowledgedAt: "desc" },
        include: {
          employee: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              avatarUrl: true,
              employeeCode: true,
            },
          },
        },
      },
    },
  });

  if (!policy) return null;
  if (!mayManage && (!policy.publishedAt || policy.isArchived)) return null;

  return policy;
}

/**
 * What the signed-in employee still has to acknowledge.
 *
 * Compares the live version against their most recent receipt, so a policy
 * revised after they signed reappears on their list.
 */
export async function pendingAcknowledgements(session: AuthContext) {
  if (!session.employee) return [];
  const db = orgDb(session.org.id);

  const policies = await db.policy.findMany({
    where: {
      isArchived: false,
      publishedAt: { not: null },
      requiresAcknowledgement: true,
    },
    orderBy: { title: "asc" },
    select: { id: true, title: true, summary: true, version: true, category: true },
  });

  if (policies.length === 0) return [];

  const acks = await db.policyAcknowledgement.findMany({
    where: {
      employeeId: session.employee.id,
      policyId: { in: policies.map((p) => p.id) },
    },
    select: { policyId: true, version: true },
  });

  const signed = new Map(acks.map((a) => [a.policyId, a.version]));

  return policies.filter((policy) => signed.get(policy.id) !== policy.version);
}

export async function hasAcknowledged(
  session: AuthContext,
  policyId: string,
  version: number,
): Promise<boolean> {
  if (!session.employee) return false;
  const db = orgDb(session.org.id);

  const ack = await db.policyAcknowledgement.findFirst({
    where: { policyId, employeeId: session.employee.id, version },
  });
  return ack !== null;
}

/**
 * Acknowledgement coverage for one policy — who has signed the current version
 * and who has not. The "not" list is the one HR actually chases.
 */
export async function acknowledgementCoverage(
  session: AuthContext,
  policyId: string,
  version: number,
) {
  const db = orgDb(session.org.id);

  const [employees, acks] = await Promise.all([
    db.employee.findMany({
      where: { status: { not: "EXITED" } },
      orderBy: [{ firstName: "asc" }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        avatarUrl: true,
        employeeCode: true,
        department: { select: { name: true } },
      },
    }),
    db.policyAcknowledgement.findMany({
      where: { policyId, version },
      select: { employeeId: true, acknowledgedAt: true },
    }),
  ]);

  const signedAt = new Map(acks.map((a) => [a.employeeId, a.acknowledgedAt]));

  return {
    signed: employees
      .filter((e) => signedAt.has(e.id))
      .map((e) => ({ ...e, acknowledgedAt: signedAt.get(e.id)! })),
    outstanding: employees.filter((e) => !signedAt.has(e.id)),
    total: employees.length,
  };
}

// ---------------------------------------------------------------------------
// Employee document vault
// ---------------------------------------------------------------------------

/**
 * Documents on one employee's record.
 *
 * `isConfidential` narrows a document to people with org-wide document access —
 * a signed warning letter is on the employee's record but is not something a
 * reporting manager browsing the team should stumble into.
 */
export async function getEmployeeDocuments(
  session: AuthContext,
  employeeId: string,
) {
  const db = orgDb(session.org.id);
  const orgWide = can(session, "document.read.all") || can(session, "document.manage");
  const isSelf = employeeId === session.employee?.id;

  return db.employeeDocument.findMany({
    where: {
      employeeId,
      ...(orgWide || isSelf ? {} : { isConfidential: false }),
    },
    orderBy: [{ category: "asc" }, { createdAt: "desc" }],
    include: { uploadedBy: { select: { name: true } } },
  });
}

/**
 * Documents expiring soon, across the organisation.
 *
 * PRD §8.3 asks for expiry reminders on visas and passports specifically. This
 * is the query behind them, surfaced on the HR dashboard rather than waiting
 * for a nightly job — a reminder nobody scheduled is a reminder that never
 * fires.
 */
export async function expiringDocuments(session: AuthContext, days = 60) {
  const db = orgDb(session.org.id);
  if (!can(session, "document.read.all") && !can(session, "document.manage")) {
    return [];
  }

  const now = today();
  const horizon = new Date(now.getTime() + days * 86_400_000);

  return db.employeeDocument.findMany({
    where: { expiresOn: { not: null, lte: horizon } },
    orderBy: { expiresOn: "asc" },
    take: 25,
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          avatarUrl: true,
          employeeCode: true,
        },
      },
    },
  });
}
