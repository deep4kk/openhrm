import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Lock } from "lucide-react";

import { requireAuth } from "@/lib/auth";
import { getReview } from "@/lib/queries/performance";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { PersonCell } from "@/components/people/person-avatar";
import { StatusBadge } from "@/components/status-badge";
import { ReviewForm } from "@/components/performance/review-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireAuth();
  const { id } = await params;
  const review = await getReview(session, id);
  return {
    title: review
      ? `${review.kind === "SELF" ? "Self-review" : "Review"} — ${review.employee.firstName} ${review.employee.lastName}`
      : "Review",
  };
}

/**
 * One review — the form when it is yours to write, the record when it is not.
 *
 * Whether the private notes appear at all is decided in `getReview`, which
 * returns null in that field for anyone who should not see it. This page never
 * has the string in hand, so it cannot leak it.
 */
export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  const review = await getReview(session, id);
  if (!review) notFound();

  const self = session.employee?.id;
  const mayWrite =
    review.cycle.status !== "CLOSED" &&
    (review.kind === "SELF"
      ? review.employeeId === self
      : review.reviewerId === self);

  const subjectName = `${review.employee.firstName} ${review.employee.lastName}`;

  return (
    <PageShell className="max-w-3xl">
      <Link
        href={`/performance/cycles/${review.cycleId}`}
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        {review.cycle.name}
      </Link>

      <PageHeader
        title={
          review.kind === "SELF"
            ? review.isSubject
              ? "Your self-review"
              : `${subjectName}'s self-review`
            : review.kind === "MANAGER"
              ? `Manager review — ${subjectName}`
              : `Peer review — ${subjectName}`
        }
        description={`${formatDate(review.cycle.periodStart)} – ${formatDate(review.cycle.periodEnd)}`}
      />

      <div className="surface flex flex-wrap items-center justify-between gap-4 p-4">
        <PersonCell
          firstName={review.employee.firstName}
          lastName={review.employee.lastName}
          avatarUrl={review.employee.avatarUrl}
          secondary={review.employee.designation?.title ?? review.employee.employeeCode}
          size="sm"
        />
        <div className="flex items-center gap-2">
          {review.reviewer && (
            <span className="text-muted-foreground text-xs">
              Reviewed by {review.reviewer.firstName} {review.reviewer.lastName}
            </span>
          )}
          {review.status === "SUBMITTED" ? (
            <StatusBadge
              label={
                review.overallRating
                  ? `${review.overallRating} / ${review.cycle.ratingScaleMax}`
                  : "Submitted"
              }
              tone="positive"
            />
          ) : (
            <StatusBadge label="Not submitted" tone="warning" />
          )}
        </div>
      </div>

      {review.cycle.instructions && mayWrite && (
        <p className="text-muted-foreground measure text-sm">
          {review.cycle.instructions}
        </p>
      )}

      {mayWrite ? (
        <ReviewForm
          review={{
            id: review.id,
            kind: review.kind,
            overallRating: review.overallRating,
            strengths: review.strengths,
            improvements: review.improvements,
            comments: review.comments,
            privateNotes: review.privateNotes,
            status: review.status,
          }}
          ratingScaleMax={review.cycle.ratingScaleMax}
          subjectName={subjectName}
        />
      ) : review.status === "SUBMITTED" ? (
        <div className="space-y-5">
          <Section title="What went well" body={review.strengths} />
          <Section title="What should change" body={review.improvements} />
          <Section title="Anything else" body={review.comments} />

          {review.canReadPrivate && review.privateNotes && (
            <section className="border-warning/40 bg-warning-subtle rounded-lg border p-4">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Lock className="size-3.5" aria-hidden />
                Private notes
              </h2>
              <p className="measure mt-2 text-sm whitespace-pre-wrap">
                {review.privateNotes}
              </p>
              <p className="mt-2 text-xs">
                {subjectName} cannot see this.
              </p>
            </section>
          )}

          {review.submittedAt && (
            <p className="text-muted-foreground text-xs">
              Submitted {formatDate(review.submittedAt)}
            </p>
          )}
        </div>
      ) : (
        <div className="surface text-muted-foreground p-8 text-center text-sm">
          This review hasn&apos;t been submitted yet.
        </div>
      )}
    </PageShell>
  );
}

function Section({ title, body }: { title: string; body: string | null }) {
  if (!body) return null;
  return (
    <section className="surface p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="measure mt-2 text-sm whitespace-pre-wrap">{body}</p>
    </section>
  );
}
