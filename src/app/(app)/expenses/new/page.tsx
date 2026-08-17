import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { PageHeader, PageShell } from "@/components/page-header";
import { ClaimEditor } from "@/components/expenses/claim-editor";

export const metadata: Metadata = { title: "New expense claim" };

export default async function NewClaimPage() {
  const session = await requirePermission("expense.submit");

  const categories = await orgDb(session.org.id).expenseCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/me"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        My space
      </Link>

      <PageHeader
        title="New expense claim"
        description="Group everything from one trip or one month into a single claim — your approver reads one thing instead of six."
      />

      <ClaimEditor
        currency={session.org.currency}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          maxAmount: c.maxAmount ? Number(c.maxAmount) : null,
          requiresReceipt: c.requiresReceipt,
        }))}
      />
    </PageShell>
  );
}
