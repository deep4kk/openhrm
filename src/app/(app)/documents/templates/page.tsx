import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, FileStack, Plus, Sparkles } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { isConfigured as aiConfigured } from "@/lib/ai/gemini";
import { formatDate } from "@/lib/dates";
import { letterKindLabel } from "@/lib/documents/types";
import { parseVariables } from "@/lib/documents/variables";
import { listTemplates } from "@/lib/queries/documents";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Letter templates" };

export default async function TemplatesPage() {
  const session = await requirePermission("letter.manage");
  const templates = await listTemplates(session);
  const aiReady = aiConfigured();

  return (
    <PageShell className="max-w-5xl">
      <Link
        href="/documents"
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Documents
      </Link>

      <PageHeader
        title="Letter templates"
        description="Write a letter once, with placeholders for whatever changes. Generating a document fills them in."
        actions={
          <LinkButton href="/documents/templates/new">
            <Plus className="size-4" aria-hidden />
            New template
          </LinkButton>
        }
      />

      {!aiReady && (
        <div className="surface text-muted-foreground flex items-start gap-3 p-4 text-sm">
          <Sparkles className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            AI drafting is off — set{" "}
            <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">
              GEMINI_API_KEY
            </code>{" "}
            in your environment to describe a letter and have it written for you.
            Templates can be written by hand without it.
          </p>
        </div>
      )}

      {templates.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={FileStack}
            title="No templates yet"
            description="A template is the letter with the names taken out. Describe the one you need and AI will draft it, or write it yourself."
            action={
              <LinkButton href="/documents/templates/new">Create a template</LinkButton>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.map((template) => {
            const variables = parseVariables(template.variables);
            return (
              <Link
                key={template.id}
                href={`/documents/templates/${template.id}`}
                className="surface hover:border-ring/40 flex flex-col gap-2 p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{template.name}</h2>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {letterKindLabel(template.kind)}
                    </p>
                  </div>
                  {!template.isActive && <Badge variant="outline">Inactive</Badge>}
                </div>

                {template.description && (
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {template.description}
                  </p>
                )}

                <p className="text-muted-foreground mt-auto pt-2 text-xs tabular-nums">
                  {variables.length} variable{variables.length === 1 ? "" : "s"} ·{" "}
                  {template._count.letters} issued · edited {formatDate(template.updatedAt)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
