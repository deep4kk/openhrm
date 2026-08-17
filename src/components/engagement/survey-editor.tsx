"use client";

import { useActionState, useState } from "react";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";

import { saveSurveyAction } from "@/lib/actions/engagement";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Writing a survey.
 *
 * Choosing eNPS pre-loads the one question that definition requires — "how
 * likely are you to recommend us as a place to work, 0 to 10" — because an eNPS
 * survey that asks it differently is not an eNPS survey, and the number stops
 * being comparable to anyone else's.
 */

export interface SurveyQuestionDraft {
  prompt: string;
  type: string;
  options: string[];
  required: boolean;
}

export interface SurveyDraft {
  id?: string;
  title: string;
  description: string;
  kind: string;
  isAnonymous: boolean;
  closesAt: string;
  isOpen: boolean;
  questions: SurveyQuestionDraft[];
}

const ENPS_QUESTION: SurveyQuestionDraft = {
  prompt:
    "How likely are you to recommend this company as a place to work? (0 = not at all, 10 = extremely)",
  type: "SCALE_10",
  options: [],
  required: true,
};

const emptyQuestion = (): SurveyQuestionDraft => ({
  prompt: "",
  type: "RATING_5",
  options: [],
  required: true,
});

export function SurveyEditor({ survey }: { survey?: SurveyDraft }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveSurveyAction,
    {},
  );
  const [kind, setKind] = useState(survey?.kind ?? "SURVEY");
  const [questions, setQuestions] = useState<SurveyQuestionDraft[]>(
    survey?.questions.length ? survey.questions : [emptyQuestion()],
  );
  const [anonymous, setAnonymous] = useState(survey?.isAnonymous ?? true);
  const [intent, setIntent] = useState<"draft" | "open">("open");

  function update(index: number, patch: Partial<SurveyQuestionDraft>) {
    setQuestions((cur) =>
      cur.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  }

  function switchKind(next: string) {
    setKind(next);
    if (next === "ENPS") {
      setQuestions([
        ENPS_QUESTION,
        {
          prompt: "What is the main reason for your score?",
          type: "TEXT",
          options: [],
          required: false,
        },
      ]);
      setAnonymous(true);
    }
  }

  const selectClass =
    "border-input bg-background h-9 rounded-lg border px-2.5 text-sm";

  return (
    <form action={action} className="space-y-6">
      <FormError message={state.error} />
      {survey?.id && <input type="hidden" name="id" value={survey.id} />}
      <input type="hidden" name="intent" value={intent} />
      <input
        type="hidden"
        name="questions"
        value={JSON.stringify(
          questions
            .filter((q) => q.prompt.trim())
            .map((q) => ({
              prompt: q.prompt,
              type: q.type,
              options: q.options.filter((o) => o.trim()),
              required: q.required,
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
            {(p) => <Input {...p} defaultValue={survey?.title} maxLength={160} />}
          </FormField>

          <FormField label="Kind" name="kind" required>
            {(p) => (
              <select
                {...p}
                value={kind}
                onChange={(e) => switchKind(e.target.value)}
                className={`${selectClass} w-full`}
              >
                <option value="POLL">Quick poll</option>
                <option value="SURVEY">Survey</option>
                <option value="ENPS">eNPS pulse</option>
              </select>
            )}
          </FormField>
        </div>

        <FormField label="What is this for" name="description">
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              defaultValue={survey?.description}
              maxLength={1000}
            />
          )}
        </FormField>

        <FormField
          label="Closes on"
          name="closesAt"
          hint="Optional. You can close it by hand at any time."
        >
          {(p) => (
            <Input {...p} type="datetime-local" defaultValue={survey?.closesAt} />
          )}
        </FormField>

        <div className="flex items-start gap-3">
          <Checkbox
            id="isAnonymous"
            name="isAnonymous"
            checked={anonymous}
            onCheckedChange={(v) => setAnonymous(v === true)}
          />
          <Label htmlFor="isAnonymous" className="font-normal">
            Anonymous
            <span className="text-muted-foreground mt-0.5 block text-xs">
              {anonymous
                ? "Responses are stored with no employee link at all — not hidden, absent. Nobody can find out who said what, including whoever runs the database."
                : "Responses are attributed. People answer more carefully and less honestly; use this for logistics, not for how they feel about the company."}
            </span>
          </Label>
        </div>
      </div>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Questions
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

        <ul className="space-y-3">
          {questions.map((question, index) => {
            const isChoice =
              question.type === "SINGLE_CHOICE" || question.type === "MULTI_CHOICE";

            return (
              <li key={index} className="surface space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <Textarea
                    value={question.prompt}
                    onChange={(e) => update(index, { prompt: e.target.value })}
                    rows={2}
                    maxLength={300}
                    aria-label={`Question ${index + 1}`}
                    placeholder="What are you asking?"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() =>
                      setQuestions((cur) =>
                        cur.length === 1
                          ? [emptyQuestion()]
                          : cur.filter((_, i) => i !== index),
                      )
                    }
                    aria-label={`Remove question ${index + 1}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <select
                    value={question.type}
                    onChange={(e) =>
                      update(index, {
                        type: e.target.value,
                        options:
                          e.target.value === "SINGLE_CHOICE" ||
                          e.target.value === "MULTI_CHOICE"
                            ? question.options.length > 0
                              ? question.options
                              : ["", ""]
                            : [],
                      })
                    }
                    aria-label={`Question ${index + 1} type`}
                    className={selectClass}
                  >
                    <option value="RATING_5">Rating, 1–5</option>
                    <option value="SCALE_10">Scale, 1–10</option>
                    <option value="SINGLE_CHOICE">Pick one</option>
                    <option value="MULTI_CHOICE">Pick several</option>
                    <option value="TEXT">Free text</option>
                  </select>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`required-${index}`}
                      checked={question.required}
                      onCheckedChange={(v) =>
                        update(index, { required: v === true })
                      }
                    />
                    <Label htmlFor={`required-${index}`} className="font-normal">
                      Required
                    </Label>
                  </div>
                </div>

                {isChoice && (
                  <ul className="space-y-2">
                    {question.options.map((option, oIndex) => (
                      <li key={oIndex} className="flex items-center gap-2">
                        <Input
                          value={option}
                          onChange={(e) =>
                            update(index, {
                              options: question.options.map((o, i) =>
                                i === oIndex ? e.target.value : o,
                              ),
                            })
                          }
                          aria-label={`Question ${index + 1} option ${oIndex + 1}`}
                          maxLength={120}
                        />
                        {question.options.length > 2 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Remove option ${oIndex + 1}`}
                            onClick={() =>
                              update(index, {
                                options: question.options.filter(
                                  (_, i) => i !== oIndex,
                                ),
                              })
                            }
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </li>
                    ))}
                    <li>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          update(index, { options: [...question.options, ""] })
                        }
                      >
                        <Plus className="size-3.5" aria-hidden />
                        Add option
                      </Button>
                    </li>
                  </ul>
                )}
              </li>
            );
          })}
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
        {!survey?.isOpen && (
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
          onClick={() => setIntent("open")}
        >
          {pending && intent === "open" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          {survey?.isOpen ? "Save changes" : "Open it"}
        </Button>
      </div>
    </form>
  );
}
