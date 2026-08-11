import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { isConfigured as aiConfigured } from "@/lib/ai/gemini";
import { PageHeader, PageShell } from "@/components/page-header";
import { TemplateEditor } from "@/components/documents/template-editor";

export const metadata: Metadata = { title: "New template" };

export default async function NewTemplatePage() {
  await requirePermission("letter.manage");

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/documents/templates"
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Templates
      </Link>

      <PageHeader
        title="New template"
        description="Write the letter once, leaving a placeholder wherever the details change from person to person."
      />

      <div className="surface p-5 sm:p-6">
        <TemplateEditor
          aiEnabled={aiConfigured()}
          issuedCount={0}
          values={{
            name: "",
            kind: "offer",
            description: "",
            subject: "",
            body: "",
            aiBrief: "",
            isActive: true,
            variables: [],
          }}
        />
      </div>
    </PageShell>
  );
}
