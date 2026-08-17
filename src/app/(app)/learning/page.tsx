import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, Plus } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { listCourses, learningSummary } from "@/lib/queries/learning";
import { refreshOverdueEnrollments } from "@/lib/actions/learning";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatRow, StatTile } from "@/components/stat-tile";
import { FilterBar } from "@/components/filter-bar";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Learning" };

/**
 * The course library.
 *
 * Mandatory training sorts to the top, and each card carries its own completion
 * rate — because a library screen that does not say who has done what is a list
 * of files, and the thing HR needs to know is whether the POSH module actually
 * landed.
 */
export default async function LearningPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requirePermission(
    "course.manage",
    "enrollment.manage",
    "enrollment.read.all",
  );

  const filters = await searchParams;

  // Overdue is a fact about the clock, not an event anyone fires, so it is
  // reconciled on read rather than waiting for a scheduler a self-hosted
  // install may not have.
  await refreshOverdueEnrollments(session.org.id);

  const [courses, summary] = await Promise.all([
    listCourses(session, { q: filters.q, status: filters.status }),
    learningSummary(session),
  ]);

  const mayManage = can(session, "course.manage");

  return (
    <PageShell>
      <PageHeader
        title="Learning"
        description="The course library, who has been assigned what, and who has finished."
        actions={
          mayManage && (
            <LinkButton href="/learning/new">
              <Plus className="size-4" aria-hidden />
              New course
            </LinkButton>
          )
        }
      />

      {summary && (
        <StatRow>
          <StatTile
            label="Published courses"
            value={summary.published}
            detail="in the library"
          />
          <StatTile
            label="Assignments"
            value={summary.assigned}
            detail={`${summary.completed} completed`}
            tone="info"
          />
          <StatTile
            label="Completion rate"
            value={`${summary.completionRate}%`}
            tone={summary.completionRate >= 80 ? "positive" : "warning"}
          />
          <StatTile
            label="Overdue"
            value={summary.overdue}
            detail="past their due date"
            tone={summary.overdue > 0 ? "critical" : "positive"}
          />
        </StatRow>
      )}

      <FilterBar
        searchPlaceholder="Search course titles"
        searchLabel="Search courses"
        count={courses.length}
        countNoun={["course", "courses"]}
        selects={
          mayManage
            ? [
                {
                  key: "status",
                  label: "Filter by status",
                  options: [
                    { value: "all", label: "All courses" },
                    { value: "PUBLISHED", label: "Published" },
                    { value: "DRAFT", label: "Draft" },
                    { value: "ARCHIVED", label: "Archived" },
                  ],
                },
              ]
            : []
        }
      />

      {courses.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={GraduationCap}
            title="No courses yet"
            description={
              mayManage
                ? "Write a course once — lessons and a quiz — and assign it to whoever needs it. Completion is tracked per person, with a certificate number on the way out."
                : "Nothing has been published yet."
            }
            action={
              mayManage ? (
                <LinkButton href="/learning/new">Build the first course</LinkButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => {
            const enrollments = course._count.enrollments;
            return (
              <li key={course.id}>
                <Link
                  href={`/learning/${course.id}`}
                  className="surface hover:border-foreground/20 focus-visible:ring-ring flex h-full flex-col p-5 transition-colors outline-none focus-visible:ring-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <h2 className="flex-1 text-sm font-medium">{course.title}</h2>
                    {course.isMandatory && (
                      <StatusBadge label="Mandatory" tone="warning" />
                    )}
                    {course.status !== "PUBLISHED" && (
                      <StatusBadge
                        label={course.status === "DRAFT" ? "Draft" : "Archived"}
                        tone="neutral"
                      />
                    )}
                  </div>

                  {course.summary && (
                    <p className="text-muted-foreground mt-1.5 flex-1 text-xs">
                      {course.summary}
                    </p>
                  )}

                  <p className="text-muted-foreground mt-4 text-xs tabular-nums">
                    {course.category} · {course._count.lessons} lesson
                    {course._count.lessons === 1 ? "" : "s"} ·{" "}
                    {course.durationMinutes} min
                    {course._count.questions > 0 &&
                      ` · ${course._count.questions} questions`}
                  </p>

                  <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                    {enrollments === 0
                      ? "Not assigned to anyone yet"
                      : `Assigned to ${enrollments} ${enrollments === 1 ? "person" : "people"}`}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
