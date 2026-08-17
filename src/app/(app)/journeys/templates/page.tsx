import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { listChecklistTemplates } from "@/lib/queries/journeys";
import { PageHeader, PageShell } from "@/components/page-header";
import { TemplateList } from "@/components/journeys/template-list";

export const metadata: Metadata = { title: "Checklist templates" };

/**
 * The checklists themselves.
 *
 * Separated from the running journeys because they are edited rarely and read
 * often — mixing "what is Priya still waiting on" with "what does our
 * onboarding look like" on one screen would serve neither.
 */
export default async function ChecklistTemplatesPage() {
  const session = await requirePermission("journey.template.manage");
  const templates = await listChecklistTemplates(session);

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/journeys"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Onboarding &amp; exits
      </Link>

      <PageHeader
        title="Checklist templates"
        description="The tasks, owners and timings a new joiner or leaver runs through. Dates are offsets from their joining or last working day, so one template fits everyone."
      />

      <TemplateList
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          kind: t.kind,
          description: t.description ?? "",
          usageCount: t._count.instances,
          items: t.items.map((item) => ({
            title: item.title,
            category: item.category,
            offsetDays: item.offsetDays,
          })),
        }))}
      />
    </PageShell>
  );
}
