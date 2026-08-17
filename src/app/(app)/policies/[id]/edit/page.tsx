import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { getPolicy } from "@/lib/queries/policies";
import { PageHeader, PageShell } from "@/components/page-header";
import { PolicyEditor } from "@/components/policies/policy-editor";

export const metadata: Metadata = { title: "Edit policy" };

export default async function EditPolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("policy.manage");
  const { id } = await params;

  const policy = await getPolicy(session, id);
  if (!policy) notFound();

  const currentVersionAcks = policy.acknowledgements.filter(
    (a) => a.version === policy.version,
  ).length;

  return (
    <PageShell className="max-w-3xl">
      <Link
        href={`/policies/${policy.id}`}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {policy.title}
      </Link>

      <PageHeader title="Edit policy" />

      <PolicyEditor
        policy={{
          id: policy.id,
          title: policy.title,
          category: policy.category,
          summary: policy.summary ?? "",
          body: policy.body,
          requiresAcknowledgement: policy.requiresAcknowledgement,
          effectiveFrom: policy.effectiveFrom
            ? policy.effectiveFrom.toISOString().slice(0, 10)
            : "",
          isPublished: policy.publishedAt !== null,
          version: policy.version,
          acknowledgementCount: currentVersionAcks,
        }}
      />
    </PageShell>
  );
}
