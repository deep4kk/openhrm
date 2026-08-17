import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { PageHeader, PageShell } from "@/components/page-header";
import { CourseEditor } from "@/components/learning/course-editor";

export const metadata: Metadata = { title: "New course" };

export default async function NewCoursePage() {
  await requirePermission("course.manage");

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/learning"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Learning
      </Link>

      <PageHeader
        title="New course"
        description="Lessons first, then a quiz if the material needs testing. Nothing can be assigned until it is published."
      />

      <CourseEditor />
    </PageShell>
  );
}
