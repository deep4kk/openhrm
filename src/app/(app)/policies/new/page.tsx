import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { PageHeader, PageShell } from "@/components/page-header";
import { PolicyEditor } from "@/components/policies/policy-editor";

export const metadata: Metadata = { title: "New policy" };

export default async function NewPolicyPage() {
  await requirePermission("policy.manage");

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/policies"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Policies
      </Link>

      <PageHeader
        title="New policy"
        description="Publishing notifies everyone and starts collecting read receipts. Save it as a draft first if it still needs review."
      />

      <PolicyEditor />
    </PageShell>
  );
}
