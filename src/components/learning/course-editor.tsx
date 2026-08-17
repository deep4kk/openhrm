"use client";

import { useActionState, useState } from "react";
import { Check, GripVertical, Loader2, Plus, Send, Trash2 } from "lucide-react";

import { saveCourseAction } from "@/lib/actions/learning";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Building a course.
 *
 * Lessons and quiz questions are edited on one page rather than across three
 * screens, because a course is short — half a dozen lessons and five questions
 * — and the person writing it needs to see whether the questions actually test
 * what the lessons taught.
 *
 * The correct answer is chosen by clicking the option itself. A separate
 * "correct answer" number field is the classic way to end up with an answer key
 * pointing at the wrong row after someone reorders the options.
 */

export interface LessonDraft {
  title: string;
  contentType: string;
  contentUrl: string;
  body: string;
  durationMinutes: string;
}

export interface QuestionDraft {
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface CourseDraft {
  id?: string;
  title: string;
  summary: string;
  description: string;
  category: string;
  isMandatory: boolean;
  passingScore: string;
  isPublished: boolean;
  lessons: LessonDraft[];
  questions: QuestionDraft[];
}

const emptyLesson = (): LessonDraft => ({
  title: "",
  contentType: "TEXT",
  contentUrl: "",
  body: "",
  durationMinutes: "10",
});

const emptyQuestion = (): QuestionDraft => ({
  prompt: "",
  options: ["", ""],
  correctIndex: 0,
  explanation: "",
});

export function CourseEditor({ course }: { course?: CourseDraft }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveCourseAction,
    {},
  );
  const [lessons, setLessons] = useState<LessonDraft[]>(
    course?.lessons.length ? course.lessons : [emptyLesson()],
  );
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    course?.questions ?? [],
  );
  const [intent, setIntent] = useState<"draft" | "publish">("publish");

  const totalMinutes = lessons.reduce(
    (sum, l) => sum + (Number(l.durationMinutes) || 0),
    0,
  );

  function updateLesson(index: number, patch: Partial<LessonDraft>) {
    setLessons((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((cur) =>
      cur.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }

  const selectClass =
    "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      {course?.id && <input type="hidden" name="id" value={course.id} />}
      <input type="hidden" name="intent" value={intent} />
      <input
        type="hidden"
        name="lessons"
        value={JSON.stringify(
          lessons
            .filter((l) => l.title.trim())
            .map((l) => ({
              title: l.title,
              contentType: l.contentType,
              contentUrl: l.contentUrl || undefined,
              body: l.body || undefined,
              durationMinutes: Number(l.durationMinutes) || 10,
            })),
        )}
      />
      <input
        type="hidden"
        name="questions"
        value={JSON.stringify(
          questions
            .filter((q) => q.prompt.trim() && q.options.filter((o) => o.trim()).length >= 2)
            .map((q) => ({
              prompt: q.prompt,
              options: q.options.filter((o) => o.trim()),
              correctIndex: q.correctIndex,
              explanation: q.explanation || undefined,
            })),
        )}
      />

      <div className="surface space-y-5 p-5">
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <FormField
            label="Title"
            name="title"
            error={state.fieldErrors?.title}
            required
          >
            {(p) => <Input {...p} defaultValue={course?.title} maxLength={160} />}
          </FormField>

          <FormField label="Category" name="category" required>
            {(p) => (
              <Input
                {...p}
                defaultValue={course?.category ?? "General"}
                maxLength={60}
              />
            )}
          </FormField>
        </div>

        <FormField
          label="One-line summary"
          name="summary"
          hint="Shown on the library card and in the assignment notification."
        >
          {(p) => (
            <Textarea {...p} rows={2} defaultValue={course?.summary} maxLength={300} />
          )}
        </FormField>

        <FormField label="Description" name="description">
          {(p) => (
            <Textarea
              {...p}
              rows={4}
              defaultValue={course?.description}
              maxLength={5000}
            />
          )}
        </FormField>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            label="Pass mark (%)"
            name="passingScore"
            required
            hint={
              questions.length === 0
                ? "No quiz yet — everyone who finishes the lessons passes."
                : `Out of ${questions.length} question${questions.length === 1 ? "" : "s"}.`
            }
          >
            {(p) => (
              <Input
                {...p}
                type="number"
                min={0}
                max={100}
                defaultValue={course?.passingScore ?? "70"}
                className="tabular-nums"
              />
            )}
          </FormField>

          <div className="flex items-start gap-3 pt-7">
            <Checkbox
              id="isMandatory"
              name="isMandatory"
              defaultChecked={course?.isMandatory}
            />
            <Label htmlFor="isMandatory" className="font-normal">
              Mandatory compliance training
              <span className="text-muted-foreground mt-0.5 block text-xs">
                Sorted to the top and chased when overdue.
              </span>
            </Label>
          </div>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Lessons
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {lessons.length} · {totalMinutes} min
            </span>
          </h2>
          {state.fieldErrors?.lessons && (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.lessons}
            </p>
          )}
        </div>

        <ul className="space-y-3">
          {lessons.map((lesson, index) => (
            <li key={index} className="surface space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <GripVertical
                  className="text-muted-foreground size-4 shrink-0"
                  aria-hidden
                />
                <Input
                  value={lesson.title}
                  onChange={(e) => updateLesson(index, { title: e.target.value })}
                  placeholder="Lesson title"
                  aria-label={`Lesson ${index + 1} title`}
                  className="min-w-[12rem] flex-1"
                  maxLength={160}
                />
                <select
                  value={lesson.contentType}
                  onChange={(e) =>
                    updateLesson(index, { contentType: e.target.value })
                  }
                  aria-label={`Lesson ${index + 1} type`}
                  className={selectClass}
                >
                  <option value="TEXT">Written</option>
                  <option value="VIDEO">Video</option>
                  <option value="PDF">PDF</option>
                  <option value="LINK">Link</option>
                </select>
                <Input
                  type="number"
                  min={1}
                  max={600}
                  value={lesson.durationMinutes}
                  onChange={(e) =>
                    updateLesson(index, { durationMinutes: e.target.value })
                  }
                  aria-label={`Lesson ${index + 1} minutes`}
                  className="w-20 tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setLessons((cur) =>
                      cur.length === 1
                        ? [emptyLesson()]
                        : cur.filter((_, i) => i !== index),
                    )
                  }
                  aria-label={`Remove lesson ${index + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>

              {lesson.contentType === "TEXT" ? (
                <Textarea
                  value={lesson.body}
                  onChange={(e) => updateLesson(index, { body: e.target.value })}
                  rows={5}
                  maxLength={40_000}
                  aria-label={`Lesson ${index + 1} content`}
                  placeholder="The lesson itself. Markdown works."
                  className="font-mono text-xs leading-relaxed"
                />
              ) : (
                <Input
                  type="url"
                  value={lesson.contentUrl}
                  onChange={(e) =>
                    updateLesson(index, { contentUrl: e.target.value })
                  }
                  aria-label={`Lesson ${index + 1} link`}
                  placeholder="https://…"
                  maxLength={2000}
                />
              )}
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setLessons((cur) => [...cur, emptyLesson()])}
        >
          <Plus className="size-4" aria-hidden />
          Add lesson
        </Button>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Quiz
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {questions.length}
            </span>
          </h2>
          {state.fieldErrors?.questions && (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors.questions}
            </p>
          )}
        </div>

        {questions.length === 0 && (
          <p className="text-muted-foreground mb-3 text-sm">
            Optional. Without a quiz, finishing the lessons completes the course.
          </p>
        )}

        <ul className="space-y-3">
          {questions.map((question, qIndex) => (
            <li key={qIndex} className="surface space-y-3 p-4">
              <div className="flex items-start gap-2">
                <Textarea
                  value={question.prompt}
                  onChange={(e) =>
                    updateQuestion(qIndex, { prompt: e.target.value })
                  }
                  rows={2}
                  maxLength={500}
                  aria-label={`Question ${qIndex + 1}`}
                  placeholder="The question"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setQuestions((cur) => cur.filter((_, i) => i !== qIndex))
                  }
                  aria-label={`Remove question ${qIndex + 1}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>

              <ul className="space-y-2">
                {question.options.map((option, oIndex) => (
                  <li key={oIndex} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuestion(qIndex, { correctIndex: oIndex })
                      }
                      aria-label={`Mark option ${oIndex + 1} as the correct answer`}
                      aria-pressed={question.correctIndex === oIndex}
                      className={cn(
                        "focus-visible:ring-ring flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors outline-none focus-visible:ring-3",
                        question.correctIndex === oIndex
                          ? "bg-success border-success text-white"
                          : "border-input hover:border-foreground/40",
                      )}
                    >
                      {question.correctIndex === oIndex && (
                        <Check className="size-3.5" aria-hidden />
                      )}
                    </button>

                    <Input
                      value={option}
                      onChange={(e) =>
                        updateQuestion(qIndex, {
                          options: question.options.map((o, i) =>
                            i === oIndex ? e.target.value : o,
                          ),
                        })
                      }
                      aria-label={`Question ${qIndex + 1} option ${oIndex + 1}`}
                      maxLength={200}
                    />

                    {question.options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove option ${oIndex + 1}`}
                        onClick={() =>
                          updateQuestion(qIndex, {
                            options: question.options.filter(
                              (_, i) => i !== oIndex,
                            ),
                            correctIndex:
                              question.correctIndex >= oIndex &&
                              question.correctIndex > 0
                                ? question.correctIndex - 1
                                : question.correctIndex,
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2">
                {question.options.length < 6 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      updateQuestion(qIndex, {
                        options: [...question.options, ""],
                      })
                    }
                  >
                    <Plus className="size-3.5" aria-hidden />
                    Add option
                  </Button>
                )}
                <Input
                  value={question.explanation}
                  onChange={(e) =>
                    updateQuestion(qIndex, { explanation: e.target.value })
                  }
                  placeholder="Why that's the answer (shown after submitting)"
                  aria-label={`Question ${qIndex + 1} explanation`}
                  maxLength={500}
                  className="flex-1"
                />
              </div>
            </li>
          ))}
        </ul>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => setQuestions((cur) => [...cur, emptyQuestion()])}
        >
          <Plus className="size-4" aria-hidden />
          Add question
        </Button>
      </section>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
        {!course?.isPublished && (
          <Button
            type="submit"
            variant="outline"
            disabled={pending}
            onClick={() => setIntent("draft")}
          >
            {pending && intent === "draft" && (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            )}
            Save draft
          </Button>
        )}
        <Button
          type="submit"
          disabled={pending}
          onClick={() => setIntent("publish")}
        >
          {pending && intent === "publish" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {course?.isPublished ? "Save changes" : "Publish"}
        </Button>
      </div>
    </form>
  );
}
