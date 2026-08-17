import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, GraduationCap } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { getMyEnrollments } from "@/lib/queries/learning";
import { refreshOverdueEnrollments } from "@/lib/actions/learning";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";

export const metadata: Metadata = { title: "My training" };

const STATUS = {
  ASSIGNED: { label: "Not started", tone: "neutral" as const },
  IN_PROGRESS: { label: "In progress", tone: "info" as const },
  COMPLETED: { label: "Done", tone: "positive" as const },
  OVERDUE: { label: "Overdue", tone: "critical" as const },
};

/**
 * What the employee has been asked to learn.
 *
 * Ordered by status then due date, so anything overdue is at the top and
 * anything finished sinks — which is the order the reader wants and the
 * opposite of chronological.
 */
export default async function MyLearningPage() {
  const session = await requirePermission("course.read");
  await refreshOverdueEnrollments(session.org.id);

  const enrollments = await getMyEnrollments(session);

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/me"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        My space
      </Link>

      <PageHeader
        title="My training"
        description="Courses assigned to you, and what you have completed."
      />

      {enrollments.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={GraduationCap}
            title="Nothing assigned"
            description="When HR assigns you a course it appears here with its due date."
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {enrollments.map((enrollment) => {
            const status = STATUS[enrollment.status as keyof typeof STATUS];
            return (
              <li key={enrollment.id}>
                <Link
                  href={`/me/learning/${enrollment.id}`}
                  className="surface hover:border-foreground/20 focus-visible:ring-ring block p-5 transition-colors outline-none focus-visible:ring-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">
                          {enrollment.course.title}
                        </p>
                        {enrollment.course.isMandatory && (
                          <StatusBadge label="Mandatory" tone="warning" />
                        )}
                      </div>
                      {enrollment.course.summary && (
                        <p className="text-muted-foreground measure mt-0.5 text-xs">
                          {enrollment.course.summary}
                        </p>
                      )}
                      <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                        {enrollment.course._count.lessons} lesson
                        {enrollment.course._count.lessons === 1 ? "" : "s"} ·{" "}
                        {enrollment.course.durationMinutes} min
                        {enrollment.dueOn &&
                          ` · due ${formatDate(enrollment.dueOn)}`}
                      </p>
                    </div>
                    <StatusBadge label={status.label} tone={status.tone} />
                  </div>

                  <ProgressBar
                    className="mt-4"
                    percent={enrollment.progress}
                    label={
                      enrollment.certificateNumber
                        ? enrollment.certificateNumber
                        : `${enrollment.progress}%`
                    }
                    tone={
                      enrollment.status === "COMPLETED"
                        ? "positive"
                        : enrollment.status === "OVERDUE"
                          ? "critical"
                          : "brand"
                    }
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageShell>
  );
}
