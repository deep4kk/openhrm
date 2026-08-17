import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { getCourse, unassignedFor } from "@/lib/queries/learning";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";
import { ExportButton } from "@/components/export-button";
import { AssignCourseDialog } from "@/components/learning/assign-dialog";
import { ArchiveCourseButton } from "@/components/learning/course-buttons";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission(
    "course.manage",
    "enrollment.manage",
    "enrollment.read.all",
  );
  const { id } = await params;
  const course = await getCourse(session, id);
  return { title: course?.title ?? "Course" };
}

const ENROLLMENT_STATUS = {
  ASSIGNED: { label: "Not started", tone: "neutral" as const },
  IN_PROGRESS: { label: "In progress", tone: "info" as const },
  COMPLETED: { label: "Completed", tone: "positive" as const },
  OVERDUE: { label: "Overdue", tone: "critical" as const },
};

/**
 * One course, and its completion register.
 *
 * The register is the reason a compliance course exists at all — so it is the
 * body of this page, not a tab. Course content is summarised above it and
 * edited elsewhere.
 */
export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission(
    "course.manage",
    "enrollment.manage",
    "enrollment.read.all",
  );

  const { id } = await params;
  const course = await getCourse(session, id);
  if (!course) notFound();

  const mayManage = can(session, "course.manage");
  const mayAssign = can(session, "enrollment.manage");

  const assignable =
    mayAssign && course.status === "PUBLISHED"
      ? await unassignedFor(session, course.id)
      : [];

  const completed = course.enrollments.filter((e) => e.completedAt).length;

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/learning"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Learning
      </Link>

      <PageHeader
        title={course.title}
        description={course.summary ?? undefined}
        actions={
          <>
            {mayAssign && course.status === "PUBLISHED" && (
              <AssignCourseDialog
                courseId={course.id}
                courseTitle={course.title}
                employees={assignable.map((e) => ({
                  id: e.id,
                  name: `${e.firstName} ${e.lastName}`,
                  department: e.department?.name ?? null,
                }))}
              />
            )}
            {mayManage && (
              <>
                <ArchiveCourseButton
                  courseId={course.id}
                  isArchived={course.status === "ARCHIVED"}
                />
                <LinkButton href={`/learning/${course.id}/edit`} variant="outline">
                  <Pencil className="size-4" aria-hidden />
                  Edit
                </LinkButton>
              </>
            )}
          </>
        }
      />

      <div className="surface flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
        {course.isMandatory && <StatusBadge label="Mandatory" tone="warning" />}
        <StatusBadge
          label={
            course.status === "PUBLISHED"
              ? "Published"
              : course.status === "DRAFT"
                ? "Draft"
                : "Archived"
          }
          tone={course.status === "PUBLISHED" ? "positive" : "neutral"}
        />
        <span className="text-muted-foreground text-xs tabular-nums">
          {course.category} · {course.lessons.length} lesson
          {course.lessons.length === 1 ? "" : "s"} · {course.durationMinutes} min
          {course.questions.length > 0 &&
            ` · ${course.questions.length} question${course.questions.length === 1 ? "" : "s"}, pass at ${course.passingScore}%`}
        </span>
      </div>

      {course.description && (
        <p className="measure text-sm whitespace-pre-wrap">{course.description}</p>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Who has been assigned this
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {course.enrollments.length}
            </span>
          </h2>
          {course.enrollments.length > 0 && (
            <ExportButton
              filename={`${course.slug}-completion.csv`}
              rows={[
                [
                  "Employee",
                  "Code",
                  "Department",
                  "Status",
                  "Progress",
                  "Score",
                  "Due",
                  "Completed",
                  "Certificate",
                ],
                ...course.enrollments.map((e) => [
                  `${e.employee.firstName} ${e.employee.lastName}`,
                  e.employee.employeeCode,
                  e.employee.department?.name ?? "",
                  e.status,
                  `${e.progress}%`,
                  e.score === null ? "" : `${e.score}%`,
                  e.dueOn ? formatDate(e.dueOn) : "",
                  e.completedAt ? formatDate(e.completedAt) : "",
                  e.certificateNumber ?? "",
                ]),
              ]}
            />
          )}
        </div>

        {course.enrollments.length === 0 ? (
          <div className="surface text-muted-foreground p-8 text-center text-sm">
            Nobody has been assigned this course yet.
          </div>
        ) : (
          <>
            <ProgressBar
              className="mb-3"
              percent={(completed / course.enrollments.length) * 100}
              label={`${completed} of ${course.enrollments.length} complete`}
              tone={
                completed === course.enrollments.length ? "positive" : "brand"
              }
            />

            <ul className="surface divide-y overflow-hidden">
              {course.enrollments.map((enrollment) => {
                const status =
                  ENROLLMENT_STATUS[
                    enrollment.status as keyof typeof ENROLLMENT_STATUS
                  ];
                return (
                  <li
                    key={enrollment.id}
                    className="flex flex-wrap items-center gap-4 p-4"
                  >
                    <div className="min-w-[13rem] flex-1">
                      <PersonCell
                        firstName={enrollment.employee.firstName}
                        lastName={enrollment.employee.lastName}
                        avatarUrl={enrollment.employee.avatarUrl}
                        secondary={
                          enrollment.employee.department?.name ??
                          enrollment.employee.employeeCode
                        }
                        size="sm"
                      />
                    </div>

                    <div className="min-w-[9rem] flex-1">
                      <ProgressBar
                        percent={enrollment.progress}
                        label={`${enrollment.progress}%`}
                        tone={
                          enrollment.status === "COMPLETED"
                            ? "positive"
                            : enrollment.status === "OVERDUE"
                              ? "critical"
                              : "brand"
                        }
                      />
                    </div>

                    <div className="text-muted-foreground w-32 shrink-0 text-right text-xs tabular-nums">
                      {enrollment.dueOn && <p>Due {formatDate(enrollment.dueOn)}</p>}
                      {enrollment.score !== null && <p>Scored {enrollment.score}%</p>}
                      {enrollment.certificateNumber && (
                        <p className="font-mono text-[10px]">
                          {enrollment.certificateNumber}
                        </p>
                      )}
                    </div>

                    <StatusBadge label={status.label} tone={status.tone} />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </PageShell>
  );
}
