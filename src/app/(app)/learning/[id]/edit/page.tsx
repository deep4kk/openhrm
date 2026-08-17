import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { getCourse } from "@/lib/queries/learning";
import { PageHeader, PageShell } from "@/components/page-header";
import { CourseEditor } from "@/components/learning/course-editor";
import { DeleteCourseButton } from "@/components/learning/course-buttons";

export const metadata: Metadata = { title: "Edit course" };

export default async function EditCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("course.manage");
  const { id } = await params;

  const course = await getCourse(session, id);
  if (!course) notFound();

  return (
    <PageShell className="max-w-3xl">
      <Link
        href={`/learning/${course.id}`}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {course.title}
      </Link>

      <PageHeader
        title="Edit course"
        description={
          course.enrollments.length > 0
            ? `${course.enrollments.length} ${course.enrollments.length === 1 ? "person has" : "people have"} this assigned. Changing the lessons resets their progress — the version they finished is not the one you are publishing.`
            : undefined
        }
      />

      <CourseEditor
        course={{
          id: course.id,
          title: course.title,
          summary: course.summary ?? "",
          description: course.description ?? "",
          category: course.category,
          isMandatory: course.isMandatory,
          passingScore: String(course.passingScore),
          isPublished: course.status === "PUBLISHED",
          lessons: course.lessons.map((lesson) => ({
            title: lesson.title,
            contentType: lesson.contentType,
            contentUrl: lesson.contentUrl ?? "",
            body: lesson.body ?? "",
            durationMinutes: String(lesson.durationMinutes),
          })),
          questions: course.questions.map((question) => ({
            prompt: question.prompt,
            options: question.options,
            correctIndex: question.correctIndex,
            explanation: question.explanation ?? "",
          })),
        }}
      />

      {course.enrollments.length === 0 && (
        <div className="flex justify-end border-t pt-4">
          <DeleteCourseButton courseId={course.id} title={course.title} />
        </div>
      )}
    </PageShell>
  );
}
