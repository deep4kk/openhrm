import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FilePlus2 } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { isConfigured as aiConfigured } from "@/lib/ai/gemini";
import { orgDb } from "@/lib/db";
import { getTemplate } from "@/lib/queries/documents";
import { PageHeader, PageShell } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { TemplateEditor } from "@/components/documents/template-editor";

export const metadata: Metadata = { title: "Edit template" };

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission("letter.manage");

  const template = await getTemplate(session, id);
  if (!template) notFound();

  const issuedCount = await orgDb(session.org.id).generatedLetter.count({
    where: { templateId: id },
  });

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
        title={template.name}
        description={
          issuedCount > 0
            ? `${issuedCount} document${issuedCount === 1 ? " has" : "s have"} been issued from this template. Editing it changes future documents only — the ones already issued are frozen as they were sent.`
            : "Nothing has been issued from this template yet."
        }
        actions={
          template.isActive && (
            <LinkButton href={`/documents/new?template=${template.id}`} variant="outline">
              <FilePlus2 className="size-4" aria-hidden />
              Use this template
            </LinkButton>
          )
        }
      />

      <div className="surface p-5 sm:p-6">
        <TemplateEditor
          aiEnabled={aiConfigured()}
          issuedCount={issuedCount}
          values={{
            id: template.id,
            name: template.name,
            kind: template.kind,
            description: template.description ?? "",
            subject: template.subject,
            body: template.body,
            aiBrief: template.aiBrief ?? "",
            isActive: template.isActive,
            variables: template.variables,
          }}
        />
      </div>
    </PageShell>
  );
}
