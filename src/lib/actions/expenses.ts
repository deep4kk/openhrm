"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, can, requireAuth } from "../auth";
import { audit } from "../audit";
import { notify, userIdForEmployee } from "../notifications";
import { sendApprovalRequestEmail } from "../mail";
import { emitWebhook } from "../webhooks";
import { canReachEmployee } from "../scope";
import { toDateOnly } from "../dates";
import { formatMoney } from "../money";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Expense claims (PRD §8.16).
 *
 * A claim is a header plus lines, and the header's total is always the sum of
 * its lines — recomputed on every write rather than accepted from the form.
 * Letting the client send a total is how you end up reimbursing ₹50,000 for
 * three ₹500 receipts.
 *
 * Claims are editable only while in DRAFT. Once submitted the numbers are what
 * the approver is deciding on, so changing them would invalidate the decision.
 */

const itemSchema = z.object({
  description: z.string().trim().min(2).max(200),
  spentOn: z.string().min(1),
  amount: z.coerce.number().positive().max(10_000_000),
  categoryId: z.string().optional(),
  merchant: z.string().trim().max(120).optional(),
  costCenter: z.string().trim().max(60).optional(),
  /**
   * A data: URI. Self-hosted installs get MinIO in the compose file, but the
   * app deliberately keeps no object-storage dependency — see docs/DOCUMENTS.md
   * for the same decision on letterhead logos. Capped hard below.
   */
  receiptUrl: z.string().optional(),
});

const claimSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(3, "Give the claim a title").max(120),
  description: z.string().trim().max(1000).optional(),
  items: z.string().min(1, "Add at least one expense"),
  /** "submit" files it for approval; anything else keeps it a draft. */
  intent: z.string().optional(),
});

/** 2 MB per receipt, and a claim's worth of them still fits in a row. */
const MAX_RECEIPT_BYTES = 2 * 1024 * 1024;

export async function saveClaimAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "expense.submit");

  if (!session.employee) {
    return { error: "Your account isn't linked to an employee record yet." };
  }

  const parsed = claimSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let items: z.infer<typeof itemSchema>[];
  try {
    items = z.array(itemSchema).min(1).parse(JSON.parse(parsed.data.items));
  } catch {
    return {
      fieldErrors: {
        items: "Every line needs a description, a date and an amount.",
      },
    };
  }

  for (const item of items) {
    if (item.receiptUrl && item.receiptUrl.length > MAX_RECEIPT_BYTES) {
      return {
        fieldErrors: {
          items: "One of the receipts is over 2 MB. Photograph it at a lower resolution.",
        },
      };
    }
  }

  const db = orgDb(session.org.id);
  const employeeId = session.employee.id;
  const submitting = parsed.data.intent === "submit";

  // Per-claim caps and receipt rules belong to the category, so they are
  // checked against the live category rather than trusted from the form.
  const categories = await db.expenseCategory.findMany();
  const byId = new Map(categories.map((c) => [c.id, c]));

  for (const item of items) {
    const category = item.categoryId ? byId.get(item.categoryId) : undefined;
    if (!category) continue;

    if (category.maxAmount && item.amount > Number(category.maxAmount)) {
      return {
        fieldErrors: {
          items: `${category.name} is capped at ${formatMoney(
            category.maxAmount,
            session.org.currency,
          )} per line.`,
        },
      };
    }
    if (submitting && category.requiresReceipt && !item.receiptUrl) {
      return {
        fieldErrors: {
          items: `${category.name} needs a receipt attached before it can be submitted.`,
        },
      };
    }
  }

  const total = items.reduce((sum, item) => sum + item.amount, 0);

  const claimId = await rawDb.$transaction(async (tx) => {
    if (parsed.data.id) {
      const existing = await tx.expenseClaim.findFirst({
        where: { id: parsed.data.id, orgId: session.org.id },
      });
      if (!existing) throw new Error("gone");
      if (existing.employeeId !== employeeId) throw new Error("not-yours");
      if (existing.status !== "DRAFT") throw new Error("locked");

      await tx.expenseClaim.update({
        where: { id: existing.id },
        data: {
          title: parsed.data.title,
          description: parsed.data.description || null,
          totalAmount: total,
          ...(submitting
            ? { status: "SUBMITTED" as const, submittedAt: new Date() }
            : {}),
        },
      });

      await tx.expenseItem.deleteMany({ where: { claimId: existing.id } });
      await tx.expenseItem.createMany({
        data: items.map((item) => ({
          orgId: session.org.id,
          claimId: existing.id,
          description: item.description,
          spentOn: toDateOnly(new Date(item.spentOn)),
          amount: item.amount,
          categoryId: item.categoryId || null,
          merchant: item.merchant || null,
          costCenter: item.costCenter || null,
          receiptUrl: item.receiptUrl || null,
        })),
      });

      return existing.id;
    }

    const claim = await tx.expenseClaim.create({
      data: {
        orgId: session.org.id,
        employeeId,
        title: parsed.data.title,
        description: parsed.data.description || null,
        totalAmount: total,
        status: submitting ? "SUBMITTED" : "DRAFT",
        submittedAt: submitting ? new Date() : null,
      },
    });

    await tx.expenseItem.createMany({
      data: items.map((item) => ({
        orgId: session.org.id,
        claimId: claim.id,
        description: item.description,
        spentOn: toDateOnly(new Date(item.spentOn)),
        amount: item.amount,
        categoryId: item.categoryId || null,
        merchant: item.merchant || null,
        costCenter: item.costCenter || null,
        receiptUrl: item.receiptUrl || null,
      })),
    });

    return claim.id;
  }).catch((error: Error) => {
    if (error.message === "locked") return "locked" as const;
    if (error.message === "not-yours") return "not-yours" as const;
    if (error.message === "gone") return "gone" as const;
    throw error;
  });

  if (claimId === "locked") {
    return { error: "That claim has already been submitted and can't be edited." };
  }
  if (claimId === "not-yours") return { error: "That claim isn't yours." };
  if (claimId === "gone") return { error: "That claim no longer exists." };

  if (submitting) {
    await audit(session, {
      action: "expense.submitted",
      entityType: "ExpenseClaim",
      entityId: claimId,
      summary: `Submitted "${parsed.data.title}" for ${formatMoney(total, session.org.currency)}`,
    });

    await notifyApprovers(session, {
      claimId,
      title: parsed.data.title,
      total,
      employeeId,
    });

    await emitWebhook(session.org.id, "expense.submitted", {
      claimId,
      employeeId,
      title: parsed.data.title,
      amount: total,
    });
  }

  revalidatePath("/expenses");
  revalidatePath("/me");
  redirect(`/expenses/${claimId}`);
}

async function notifyApprovers(
  session: Awaited<ReturnType<typeof requireAuth>>,
  input: { claimId: string; title: string; total: number; employeeId: string },
) {
  const db = orgDb(session.org.id);

  const employee = await db.employee.findFirst({
    where: { id: input.employeeId },
    select: { managerId: true, firstName: true, lastName: true },
  });

  const recipients: string[] = [];
  if (employee?.managerId) {
    const managerUserId = await userIdForEmployee(employee.managerId);
    if (managerUserId) recipients.push(managerUserId);
  }

  if (recipients.length === 0) {
    const roles = await db.role.findMany({
      where: { permissions: { has: "expense.approve.all" } },
      select: { id: true },
    });
    const users = await db.user.findMany({
      where: { roleId: { in: roles.map((r) => r.id) }, status: "ACTIVE" },
      select: { id: true },
      take: 5,
    });
    recipients.push(...users.map((u) => u.id));
  }

  const who = `${employee?.firstName ?? "Someone"} ${employee?.lastName ?? ""}`.trim();
  const amount = formatMoney(input.total, session.org.currency);

  for (const userId of recipients) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "EXPENSE_SUBMITTED",
      title: `${who} claimed ${amount}`,
      body: input.title,
      linkUrl: `/expenses/${input.claimId}`,
    });

    const user = await rawDb.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (user) {
      await sendApprovalRequestEmail({
        to: user.email,
        requesterName: who,
        what: "an expense claim",
        detail: `${input.title} · ${amount}`,
        url: `${process.env.APP_URL ?? "http://localhost:3000"}/expenses/${input.claimId}`,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Deciding and paying
// ---------------------------------------------------------------------------

export async function decideClaimAction(
  claimId: string,
  approve: boolean,
  note?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "expense.approve.team", "expense.approve.all");

  const db = orgDb(session.org.id);
  const claim = await db.expenseClaim.findFirst({
    where: { id: claimId },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!claim) return { error: "That claim no longer exists." };
  if (claim.status !== "SUBMITTED") {
    return { error: "That claim has already been decided." };
  }
  if (claim.employeeId === session.employee?.id) {
    return { error: "You can't approve your own claim." };
  }

  if (!can(session, "expense.approve.all")) {
    const reachable = await canReachEmployee(
      session,
      "expense.approve",
      claim.employeeId,
    );
    if (!reachable) return { error: "That claim isn't yours to decide." };
  }

  if (!approve && !note?.trim()) {
    return { error: "Say why it was declined — the claimant will only see this." };
  }

  await db.expenseClaim.update({
    where: { id: claimId },
    data: {
      status: approve ? "APPROVED" : "REJECTED",
      approverId: session.employee?.id ?? null,
      decidedAt: new Date(),
      decisionNote: note?.trim() || null,
    },
  });

  await audit(session, {
    action: "expense.decided",
    entityType: "ExpenseClaim",
    entityId: claimId,
    summary: `${approve ? "Approved" : "Declined"} "${claim.title}" (${formatMoney(
      claim.totalAmount,
      session.org.currency,
    )}) for ${claim.employee.firstName} ${claim.employee.lastName}`,
  });

  const userId = await userIdForEmployee(claim.employeeId);
  if (userId) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "EXPENSE_DECIDED",
      title: `Your claim was ${approve ? "approved" : "declined"}`,
      body: `${claim.title} · ${formatMoney(claim.totalAmount, session.org.currency)}`,
      linkUrl: `/expenses/${claimId}`,
    });
  }

  if (approve) {
    await emitWebhook(session.org.id, "expense.approved", {
      claimId,
      employeeId: claim.employeeId,
      amount: Number(claim.totalAmount),
    });
  }

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${claimId}`);
  revalidatePath("/me");
  return { success: true };
}

/**
 * Marking a claim paid.
 *
 * Two routes, both of which the PRD asks for: paid separately (a bank transfer
 * outside payroll) or attached to the next payroll run. The second stores the
 * run id so the payslip and the claim agree about where the money went.
 */
export async function reimburseClaimAction(
  claimId: string,
  payrollRunId?: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "expense.reimburse");

  const db = orgDb(session.org.id);
  const claim = await db.expenseClaim.findFirst({ where: { id: claimId } });
  if (!claim) return { error: "That claim no longer exists." };
  if (claim.status !== "APPROVED") {
    return { error: "Only an approved claim can be reimbursed." };
  }

  if (payrollRunId) {
    const run = await db.payrollRun.findFirst({ where: { id: payrollRunId } });
    if (!run) return { error: "That payroll run no longer exists." };
    if (run.status !== "DRAFT") {
      return {
        error: "That run is already locked. Attach the claim to an open run instead.",
      };
    }
  }

  await db.expenseClaim.update({
    where: { id: claimId },
    data: {
      status: "REIMBURSED",
      reimbursedAt: new Date(),
      payrollRunId: payrollRunId || null,
    },
  });

  await audit(session, {
    action: "expense.reimbursed",
    entityType: "ExpenseClaim",
    entityId: claimId,
    summary: `Reimbursed "${claim.title}" (${formatMoney(
      claim.totalAmount,
      session.org.currency,
    )})${payrollRunId ? " via payroll" : " separately"}`,
  });

  const userId = await userIdForEmployee(claim.employeeId);
  if (userId) {
    await notify({
      orgId: session.org.id,
      userId,
      type: "EXPENSE_DECIDED",
      title: "Your expense claim was reimbursed",
      body: `${claim.title} · ${formatMoney(claim.totalAmount, session.org.currency)}`,
      linkUrl: `/expenses/${claimId}`,
    });
  }

  revalidatePath("/expenses");
  revalidatePath(`/expenses/${claimId}`);
  return { success: true };
}

export async function cancelClaimAction(claimId: string): Promise<FormState> {
  const session = await requireAuth();

  const db = orgDb(session.org.id);
  const claim = await db.expenseClaim.findFirst({ where: { id: claimId } });
  if (!claim) return { error: "That claim no longer exists." };

  const mine = claim.employeeId === session.employee?.id;
  if (!mine) await assertPermission(session, "expense.approve.all");

  if (claim.status === "REIMBURSED") {
    return { error: "A reimbursed claim can't be withdrawn." };
  }
  if (claim.status === "CANCELLED") {
    return { error: "That claim is already withdrawn." };
  }

  await db.expenseClaim.update({
    where: { id: claimId },
    data: { status: "CANCELLED" },
  });

  revalidatePath("/expenses");
  revalidatePath("/me");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the category").max(60),
  code: z
    .string()
    .trim()
    .min(2, "Give it a short code")
    .max(20)
    .regex(/^[A-Z0-9_]+$/, "Capitals, numbers and underscores only")
    .optional(),
  maxAmount: z.string().optional(),
  requiresReceipt: z.string().optional(),
});

export async function saveExpenseCategoryAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "expense.category.manage");

  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const { id, name } = parsed.data;
  const code = parsed.data.code ?? name.slice(0, 12).toUpperCase().replace(/\W/g, "");
  const maxAmount = parsed.data.maxAmount ? Number(parsed.data.maxAmount) : null;
  const requiresReceipt = parsed.data.requiresReceipt === "on";

  const db = orgDb(session.org.id);
  const clash = await db.expenseCategory.findFirst({
    where: { code, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { fieldErrors: { code: "That code is already in use." } };

  if (id) {
    await db.expenseCategory.update({
      where: { id },
      data: { name, code, maxAmount, requiresReceipt },
    });
  } else {
    await db.expenseCategory.create({
      data: { orgId: session.org.id, name, code, maxAmount, requiresReceipt },
    });
  }

  await audit(session, {
    action: "expense.category.saved",
    entityType: "ExpenseCategory",
    entityId: id ?? null,
    summary: `${id ? "Updated" : "Added"} expense category ${name}`,
  });

  revalidatePath("/expenses");
  return { success: true };
}

export async function deleteExpenseCategoryAction(
  id: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "expense.category.manage");

  const db = orgDb(session.org.id);
  const category = await db.expenseCategory.findFirst({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!category) return { error: "That category no longer exists." };

  // Deleting would detach the category from claims already paid, rewriting
  // what those claims said they were for. Deactivating keeps history intact.
  if (category._count.items > 0) {
    await db.expenseCategory.update({ where: { id }, data: { isActive: false } });
    return {
      error: `${category.name} is used by ${category._count.items} expense line${
        category._count.items === 1 ? "" : "s"
      }, so it has been hidden from new claims instead of deleted.`,
    };
  }

  await db.expenseCategory.delete({ where: { id } });

  await audit(session, {
    action: "expense.category.deleted",
    entityType: "ExpenseCategory",
    entityId: id,
    summary: `Deleted expense category ${category.name}`,
  });

  revalidatePath("/expenses");
  return { success: true };
}
