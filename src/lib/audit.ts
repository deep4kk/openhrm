import "server-only";

import { headers } from "next/headers";
import type { Prisma } from "@/generated/prisma/client";
import { rawDb } from "./db";
import type { AuthContext } from "./auth";

/**
 * The audit trail.
 *
 * PRD §8.18 and §8.28 require an immutable record of who changed what and when,
 * covering salary changes, permission changes and data exports. Nothing in the
 * application updates or deletes rows in `audit_logs` — writes only.
 *
 * Two rules worth keeping:
 *  1. Log the *decision*, not just the mutation. A refused access attempt is
 *     more interesting than a successful one.
 *  2. Never put a decrypted secret in `before`/`after`. Record that a bank
 *     account changed, not what it changed to.
 */

export type AuditAction =
  | "auth.login"
  | "auth.login.failed"
  | "auth.logout"
  | "auth.password.changed"
  | "org.created"
  | "org.updated"
  | "role.created"
  | "role.updated"
  | "role.deleted"
  | "user.invited"
  | "user.invitation.accepted"
  | "user.role.changed"
  | "user.suspended"
  | "employee.created"
  | "employee.updated"
  | "employee.deleted"
  | "employee.imported"
  | "employee.compensation.viewed"
  | "employee.compensation.updated"
  | "employee.sensitive.viewed"
  | "employee.sensitive.updated"
  | "department.created"
  | "department.updated"
  | "department.deleted"
  | "designation.created"
  | "designation.updated"
  | "designation.deleted"
  | "location.created"
  | "location.updated"
  | "location.deleted"
  | "holiday.created"
  | "holiday.updated"
  | "holiday.deleted"
  | "shift.created"
  | "shift.updated"
  | "shift.deleted"
  | "attendance.checked_in"
  | "attendance.checked_out"
  | "attendance.edited"
  | "attendance.regularization.requested"
  | "attendance.regularization.decided"
  | "leave.type.created"
  | "leave.type.updated"
  | "leave.type.deleted"
  | "leave.requested"
  | "leave.decided"
  | "leave.cancelled"
  | "leave.balance.adjusted"
  | "announcement.published"
  | "data.exported"

  // Payroll
  | "payroll.structure.created"
  | "payroll.structure.updated"
  | "payroll.structure.deleted"
  | "payroll.component.created"
  | "payroll.component.updated"
  | "payroll.component.deleted"
  | "payroll.statutory.updated"
  | "payroll.salary.assigned"
  | "payroll.run.created"
  | "payroll.run.calculated"
  | "payroll.run.approved"
  | "payroll.run.paid"
  | "payroll.run.cancelled"
  | "payroll.payslips.published"
  | "loan.created"
  | "loan.cancelled"

  // Onboarding & offboarding
  | "journey.started"
  | "journey.task.updated"
  | "journey.cancelled"
  | "journey.template.saved"
  | "journey.template.deleted"

  // Documents
  | "document.uploaded"
  | "document.deleted"
  | "document.viewed"
  | "policy.published"
  | "policy.updated"
  | "policy.archived"
  | "policy.acknowledged"
  | "letter.template.saved"
  | "letter.template.deleted"
  | "letter.generated"
  | "letter.mailed"
  | "letter.signed"

  // Assets
  | "asset.created"
  | "asset.updated"
  | "asset.deleted"
  | "asset.issued"
  | "asset.returned"

  // Expenses
  | "expense.category.saved"
  | "expense.category.deleted"
  | "expense.submitted"
  | "expense.decided"
  | "expense.reimbursed"

  // Helpdesk
  | "ticket.raised"
  | "ticket.updated"
  | "ticket.commented"
  | "ticket.category.saved"
  | "ticket.category.deleted"

  // Recruitment
  | "job.created"
  | "job.updated"
  | "job.deleted"
  | "candidate.created"
  | "candidate.moved"
  | "candidate.updated"
  | "interview.scheduled"
  | "interview.feedback.submitted"
  | "offer.created"
  | "offer.sent"
  | "offer.decided"
  | "offer.converted"

  // Performance
  | "goal.created"
  | "goal.updated"
  | "goal.deleted"
  | "review.cycle.created"
  | "review.cycle.advanced"
  | "review.submitted"
  | "oneonone.saved"

  // Learning
  | "course.saved"
  | "course.published"
  | "course.deleted"
  | "course.assigned"
  | "course.completed"

  // Engagement
  | "survey.created"
  | "survey.opened"
  | "survey.closed"
  | "survey.responded"

  // Exit
  | "exit.requested"
  | "exit.decided"
  | "exit.withdrawn"
  | "exit.interview.submitted"
  | "settlement.computed"
  | "settlement.approved"
  | "settlement.paid"

  // Platform
  | "apikey.created"
  | "apikey.revoked"
  | "webhook.created"
  | "webhook.updated"
  | "webhook.deleted"
  | "report.saved"
  | "report.deleted"
  | "branding.updated"
  | "integration.updated";

interface AuditInput {
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Records an audited action.
 *
 * Deliberately never throws: an audit write failing must not roll back the
 * business operation the user just completed. Failures are logged to stderr so
 * they surface in monitoring instead of vanishing.
 */
export async function audit(
  session: Pick<AuthContext, "org" | "user"> | null,
  input: AuditInput,
  orgIdOverride?: string,
): Promise<void> {
  const orgId = session?.org.id ?? orgIdOverride;
  if (!orgId) return;

  try {
    const headerList = await headers().catch(() => null);

    await rawDb.auditLog.create({
      data: {
        orgId,
        actorUserId: session?.user.id ?? null,
        actorLabel: session
          ? `${session.user.name} <${session.user.email}>`
          : "system",
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        before: sanitize(input.before) ?? undefined,
        after: sanitize(input.after) ?? undefined,
        ipAddress:
          headerList?.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64) ??
          null,
        userAgent: headerList?.get("user-agent")?.slice(0, 500) ?? null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to write audit entry", {
      action: input.action,
      entityType: input.entityType,
      error,
    });
  }
}

/**
 * Strips values that must never land in the audit table even by accident.
 * Encrypted columns are reduced to a marker so the *fact* of a change is
 * recorded without the value.
 */
const REDACTED_KEYS = [
  "password",
  "passwordHash",
  "refreshTokenHash",
  "tokenHash",
  "bankAccountNumber",
  "bankAccountNumberEnc",
  "panNumber",
  "panNumberEnc",
  "aadhaarNumber",
  "aadhaarNumberEnc",
];

function sanitize(value: unknown): Prisma.InputJsonObject | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") {
    return { value } as Prisma.InputJsonObject;
  }

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(source)) {
    if (REDACTED_KEYS.includes(key)) {
      output[key] = val ? "[redacted — changed]" : null;
      continue;
    }
    if (val instanceof Date) {
      output[key] = val.toISOString();
      continue;
    }
    if (typeof val === "bigint") {
      output[key] = val.toString();
      continue;
    }
    if (val && typeof val === "object" && "toFixed" in (val as object)) {
      // Prisma Decimal — serialise as a string to preserve precision.
      output[key] = String(val);
      continue;
    }
    output[key] = val as unknown;
  }

  return output as Prisma.InputJsonObject;
}

/**
 * Records that someone looked at data they needed elevated permission to see.
 * PRD §8.28 calls for data-access logs, not just data-change logs.
 */
export async function auditSensitiveRead(
  session: AuthContext,
  entityType: string,
  entityId: string,
  what: string,
): Promise<void> {
  await audit(session, {
    action:
      what === "compensation"
        ? "employee.compensation.viewed"
        : "employee.sensitive.viewed",
    entityType,
    entityId,
    summary: `Viewed ${what}`,
  });
}
