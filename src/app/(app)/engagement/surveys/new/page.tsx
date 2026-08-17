import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { PageHeader, PageShell } from "@/components/page-header";
import { SurveyEditor } from "@/components/engagement/survey-editor";

export const metadata: Metadata = { title: "New survey" };

export default async function NewSurveyPage() {
  await requirePermission("survey.manage");

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/engagement"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Engagement
      </Link>

      <PageHeader
        title="New survey"
        description="Once anyone has answered, the questions are frozen — the stored answers have to keep referring to what was actually asked."
      />

      <SurveyEditor />
    </PageShell>
  );
}
