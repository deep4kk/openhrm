"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleCheck,
  ExternalLink,
  Loader2,
  PlayCircle,
} from "lucide-react";
import { toast } from "sonner";

import { completeLessonAction, submitQuizAction } from "@/lib/actions/learning";
import { renderMarkdown } from "@/lib/documents/markdown";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/**
 * Taking a course.
 *
 * Lessons are marked done one at a time, and the quiz stays locked until they
 * all are — not to be officious, but because a pass mark on a compliance course
 * is a claim that someone read the material, and letting them skip to the quiz
 * makes that claim false.
 *
 * The answer key is not in this component's props. `getEnrollment` blanks
 * `correctIndex` for learners, so a curious employee reading the page source
 * finds `-1` for every question; grading happens on the server.
 */

export interface PlayerLesson {
  id: string;
  title: string;
  contentType: string;
  contentUrl: string | null;
  body: string | null;
  durationMinutes: number;
}

export interface PlayerQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export function CoursePlayer({
  enrollmentId,
  lessons,
  questions,
  completedLessonIds,
  passingScore,
  score,
  attempts,
  isCompleted,
  certificateNumber,
}: {
  enrollmentId: string;
  lessons: PlayerLesson[];
  questions: PlayerQuestion[];
  completedLessonIds: string[];
  passingScore: number;
  score: number | null;
  attempts: number;
  isCompleted: boolean;
  certificateNumber: string | null;
}) {
  const [done, setDone] = useState(new Set(completedLessonIds));
  const [openLesson, setOpenLesson] = useState<string | null>(
    lessons.find((l) => !completedLessonIds.includes(l.id))?.id ??
      lessons[0]?.id ??
      null,
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const allDone = lessons.every((l) => done.has(l.id));

  function markDone(lessonId: string) {
    startTransition(async () => {
      const result = await completeLessonAction(enrollmentId, lessonId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setDone((cur) => new Set(cur).add(lessonId));

      const nextLesson = lessons.find((l) => l.id !== lessonId && !done.has(l.id));
      setOpenLesson(nextLesson?.id ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <ProgressBar
        percent={lessons.length === 0 ? 100 : (done.size / lessons.length) * 100}
        label={`${done.size} of ${lessons.length} lessons`}
        tone={allDone ? "positive" : "brand"}
      />

      <ol className="space-y-2">
        {lessons.map((lesson, index) => {
          const isDone = done.has(lesson.id);
          const isOpen = openLesson === lesson.id;

          return (
            <li key={lesson.id} className="surface overflow-hidden">
              <button
                type="button"
                onClick={() => setOpenLesson(isOpen ? null : lesson.id)}
                aria-expanded={isOpen}
                className="hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-3 p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                    isDone
                      ? "bg-success border-success text-white"
                      : "border-input text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {isDone ? <Check className="size-3.5" /> : index + 1}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{lesson.title}</span>
                  <span className="text-muted-foreground text-xs">
                    {lesson.contentType.toLowerCase()} · {lesson.durationMinutes} min
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t p-4">
                  {lesson.contentType === "TEXT" && lesson.body && (
                    <article
                      className="prose-letter"
                      // Escaped before markup is inserted — see markdown.ts.
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(lesson.body),
                      }}
                    />
                  )}

                  {lesson.contentUrl && (
                    <a
                      href={lesson.contentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand inline-flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
                    >
                      <PlayCircle className="size-4" aria-hidden />
                      Open the {lesson.contentType.toLowerCase()}
                      <ExternalLink className="size-3" aria-hidden />
                    </a>
                  )}

                  {!isDone && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => markDone(lesson.id)}
                    >
                      {pending ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Check className="size-4" aria-hidden />
                      )}
                      Mark as done
                    </Button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {questions.length > 0 && (
        <Quiz
          enrollmentId={enrollmentId}
          questions={questions}
          unlocked={allDone}
          passingScore={passingScore}
          lastScore={score}
          attempts={attempts}
          isCompleted={isCompleted}
        />
      )}

      {isCompleted && certificateNumber && (
        <div className="border-success/30 bg-success-subtle rounded-lg border p-5 text-center">
          <CircleCheck className="text-success mx-auto size-8" aria-hidden />
          <p className="mt-2 font-medium">Course complete</p>
          <p className="text-muted-foreground mt-1 text-sm">
            Certificate{" "}
            <span className="font-mono text-xs">{certificateNumber}</span>
            {score !== null && ` · scored ${score}%`}
          </p>
        </div>
      )}
    </div>
  );
}

function Quiz({
  enrollmentId,
  questions,
  unlocked,
  passingScore,
  lastScore,
  attempts,
  isCompleted,
}: {
  enrollmentId: string;
  questions: PlayerQuestion[];
  unlocked: boolean;
  passingScore: number;
  lastScore: number | null;
  attempts: number;
  isCompleted: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const answered = Object.keys(answers).length;

  return (
    <section className="surface p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Quiz</h2>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {questions.length} question{questions.length === 1 ? "" : "s"} · pass
            mark {passingScore}%
            {attempts > 0 && ` · ${attempts} attempt${attempts === 1 ? "" : "s"}`}
          </p>
        </div>
        {lastScore !== null && (
          <StatusBadge
            label={`Last score ${lastScore}%`}
            tone={lastScore >= passingScore ? "positive" : "warning"}
          />
        )}
      </div>

      {!unlocked ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          Work through the lessons first — the quiz unlocks when they are all
          done.
        </p>
      ) : (
        <>
          <ol className="space-y-5">
            {questions.map((question, index) => (
              <li key={question.id}>
                <fieldset>
                  <legend className="text-sm font-medium">
                    {index + 1}. {question.prompt}
                  </legend>
                  <ul className="mt-2 space-y-1.5">
                    {question.options.map((option, oIndex) => (
                      <li key={oIndex}>
                        <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors">
                          <input
                            type="radio"
                            name={question.id}
                            checked={answers[question.id] === oIndex}
                            onChange={() =>
                              setAnswers((cur) => ({
                                ...cur,
                                [question.id]: oIndex,
                              }))
                            }
                            disabled={isCompleted}
                            className="accent-primary"
                          />
                          {option}
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              </li>
            ))}
          </ol>

          {result && (
            <div
              className={cn(
                "mt-5 rounded-lg border p-4 text-sm",
                result.passed
                  ? "border-success/30 bg-success-subtle"
                  : "border-warning/40 bg-warning-subtle",
              )}
              role="status"
            >
              {result.passed
                ? `Passed with ${result.score}%.`
                : `Scored ${result.score}% — the pass mark is ${passingScore}%. Have another go.`}
            </div>
          )}

          {!isCompleted && (
            <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
              <p className="text-muted-foreground text-xs tabular-nums">
                {answered} of {questions.length} answered
              </p>
              <Button
                disabled={pending || answered < questions.length}
                onClick={() =>
                  startTransition(async () => {
                    const response = await submitQuizAction(enrollmentId, answers);
                    if (response.error) {
                      toast.error(response.error);
                      return;
                    }
                    setResult({
                      score: response.score ?? 0,
                      passed: Boolean(response.passed),
                    });
                    router.refresh();
                  })
                }
              >
                {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
                Submit answers
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
