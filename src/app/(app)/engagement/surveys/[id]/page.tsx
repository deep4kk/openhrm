import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, EyeOff } from "lucide-react";

import { requireAuth, can } from "@/lib/auth";
import { getSurvey, hasResponded, surveyResults } from "@/lib/queries/engagement";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import {
  SurveyRunner,
  SurveyStatusButton,
} from "@/components/engagement/survey-runner";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requireAuth();
  const { id } = await params;
  const survey = await getSurvey(session, id);
  return { title: survey?.title ?? "Survey" };
}

/**
 * One survey: the form while it is open to you, the results once you can read
 * them.
 *
 * Results are never shown alongside the form. Seeing that eleven people rated
 * the office 2/5 before you answer is the definition of anchoring, and it makes
 * the twelfth response worth less than nothing.
 */
export default async function SurveyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAuth();
  const { id } = await params;

  const survey = await getSurvey(session, id);
  if (!survey) notFound();

  const mayManage = can(session, "survey.manage");
  const [answered, results] = await Promise.all([
    hasResponded(session, survey.id),
    mayManage ? surveyResults(session, survey.id) : Promise.resolve(null),
  ]);

  const canAnswer =
    survey.status === "OPEN" && can(session, "survey.respond") && !answered;

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
        title={survey.title}
        description={survey.description ?? undefined}
        actions={
          mayManage && (
            <SurveyStatusButton surveyId={survey.id} status={survey.status} />
          )
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge
          label={
            survey.status === "OPEN"
              ? "Open"
              : survey.status === "DRAFT"
                ? "Draft"
                : "Closed"
          }
          tone={survey.status === "OPEN" ? "positive" : "neutral"}
        />
        {survey.isAnonymous && (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <EyeOff className="size-3.5" aria-hidden />
            Anonymous
          </span>
        )}
        <span className="text-muted-foreground text-xs tabular-nums">
          {survey._count.responses} response
          {survey._count.responses === 1 ? "" : "s"}
          {survey.closesAt && ` · closes ${formatDate(survey.closesAt)}`}
        </span>
      </div>

      {canAnswer ? (
        <SurveyRunner
          surveyId={survey.id}
          isAnonymous={survey.isAnonymous}
          alreadyAnswered={answered}
          questions={survey.questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            type: question.type,
            options: question.options,
            required: question.required,
          }))}
        />
      ) : answered && !mayManage ? (
        <div className="border-success/30 bg-success-subtle rounded-lg border p-6 text-center">
          <p className="font-medium">You have answered this survey</p>
          <p className="text-muted-foreground mt-1.5 text-sm">
            {survey.isAnonymous
              ? "Your response was stored with no link to your name."
              : "Thank you."}
          </p>
        </div>
      ) : null}

      {results && results.responseCount > 0 && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold">
            Results
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {results.responseCount} response
              {results.responseCount === 1 ? "" : "s"}
            </span>
          </h2>

          {results.questions.map((result, index) => (
            <div key={result.question.id} className="surface p-5">
              <h3 className="text-sm font-medium">
                {index + 1}. {result.question.prompt}
              </h3>

              {result.kind === "scale" && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-4">
                    {result.average !== null && (
                      <p className="text-2xl font-semibold tabular-nums">
                        {result.average}
                        <span className="text-muted-foreground ml-1 text-sm font-normal">
                          average
                        </span>
                      </p>
                    )}
                    {result.nps !== null && (
                      <p className="text-sm">
                        eNPS{" "}
                        <span
                          className={
                            result.nps >= 0
                              ? "text-success font-semibold tabular-nums"
                              : "text-destructive font-semibold tabular-nums"
                          }
                        >
                          {result.nps > 0 ? "+" : ""}
                          {result.nps}
                        </span>
                        <span className="text-muted-foreground ml-1.5 text-xs">
                          promoters minus detractors
                        </span>
                      </p>
                    )}
                  </div>

                  <ul className="space-y-1.5">
                    {result.counts.map((bucket) => (
                      <li
                        key={bucket.label}
                        className="flex items-center gap-3 text-xs"
                      >
                        <span className="w-4 shrink-0 text-right tabular-nums">
                          {bucket.label}
                        </span>
                        <ProgressBar
                          className="flex-1"
                          percent={
                            results.responseCount === 0
                              ? 0
                              : (bucket.count / results.responseCount) * 100
                          }
                          label={String(bucket.count)}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.kind === "choice" && (
                <ul className="mt-3 space-y-1.5">
                  {result.counts.map((bucket) => (
                    <li key={bucket.label} className="flex items-center gap-3 text-xs">
                      <span className="w-32 shrink-0 truncate">{bucket.label}</span>
                      <ProgressBar
                        className="flex-1"
                        percent={
                          results.responseCount === 0
                            ? 0
                            : (bucket.count / results.responseCount) * 100
                        }
                        label={String(bucket.count)}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {result.kind === "text" && (
                <ul className="mt-3 space-y-2">
                  {result.texts.length === 0 ? (
                    <li className="text-muted-foreground text-sm">
                      No written answers.
                    </li>
                  ) : (
                    result.texts.map((text, i) => (
                      <li
                        key={i}
                        className="bg-muted measure rounded-md px-3 py-2 text-sm"
                      >
                        {text}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      {mayManage && results && results.responseCount === 0 && (
        <div className="surface text-muted-foreground p-8 text-center text-sm">
          No responses yet.
        </div>
      )}
    </PageShell>
  );
}
