import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { getEnrollment } from "@/lib/queries/learning";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CoursePlayer } from "@/components/learning/course-player";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission("course.read");
  const { id } = await params;
  const enrollment = await getEnrollment(session, id);
  return { title: enrollment?.course.title ?? "Course" };
}

/**
 * Taking a course.
 *
 * The quiz questions arriving here have had their `correctIndex` replaced with
 * -1 by `getEnrollment` for anyone who is not a course manager, so the answer
 * key never reaches the learner's browser.
 */
export default async function TakeCoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("course.read");
  const { id } = await params;

  const enrollment = await getEnrollment(session, id);
  if (!enrollment) notFound();

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/me/learning"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        My training
      </Link>

      <PageHeader
        title={enrollment.course.title}
        description={enrollment.course.summary ?? undefined}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {enrollment.course.isMandatory && (
          <StatusBadge label="Mandatory" tone="warning" />
        )}
        <span className="text-muted-foreground text-xs tabular-nums">
          {enrollment.course.category} · {enrollment.course.durationMinutes} min
          {enrollment.dueOn && ` · due ${formatDate(enrollment.dueOn)}`}
        </span>
      </div>

      {enrollment.course.description && (
        <p className="measure text-sm whitespace-pre-wrap">
          {enrollment.course.description}
        </p>
      )}

      {enrollment.isMine ? (
        <CoursePlayer
          enrollmentId={enrollment.id}
          passingScore={enrollment.course.passingScore}
          score={enrollment.score}
          attempts={enrollment.attempts}
          isCompleted={enrollment.completedAt !== null}
          certificateNumber={enrollment.certificateNumber}
          completedLessonIds={enrollment.lessonsCompleted}
          lessons={enrollment.course.lessons.map((lesson) => ({
            id: lesson.id,
            title: lesson.title,
            contentType: lesson.contentType,
            contentUrl: lesson.contentUrl,
            body: lesson.body,
            durationMinutes: lesson.durationMinutes,
          }))}
          questions={enrollment.course.questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            options: question.options,
          }))}
        />
      ) : (
        <div className="surface text-muted-foreground p-8 text-center text-sm">
          You are looking at {enrollment.employee.firstName}&apos;s progress:{" "}
          {enrollment.progress}% complete
          {enrollment.score !== null && `, scored ${enrollment.score}%`}.
        </div>
      )}
    </PageShell>
  );
}
