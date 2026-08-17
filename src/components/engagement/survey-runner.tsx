"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, EyeOff, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
  setSurveyStatusAction,
  submitSurveyAction,
} from "@/lib/actions/engagement";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface RunnerQuestion {
  id: string;
  prompt: string;
  type: string;
  options: string[];
  required: boolean;
}

/**
 * Answering a survey.
 *
 * The anonymity notice sits at the top, not in the small print, because it is
 * the single thing that determines whether the answers are worth collecting.
 * Scale questions render as a row of buttons rather than a select — a
 * ten-point scale as a dropdown gets answered "5" by everyone in a hurry.
 */
export function SurveyRunner({
  surveyId,
  questions,
  isAnonymous,
  alreadyAnswered,
}: {
  surveyId: string;
  questions: RunnerQuestion[];
  isAnonymous: boolean;
  alreadyAnswered: boolean;
}) {
  const [answers, setAnswers] = useState<
    Record<string, string | number | string[]>
  >({});
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (done || alreadyAnswered) {
    return (
      <div className="border-success/30 bg-success-subtle rounded-lg border p-6 text-center">
        <CheckCircle2 className="text-success mx-auto size-8" aria-hidden />
        <p className="mt-3 font-medium">Thank you</p>
        <p className="text-muted-foreground mt-1.5 text-sm">
          {isAnonymous
            ? "Your answers were recorded with no link to your name."
            : "Your answers were recorded."}
        </p>
      </div>
    );
  }

  const missing = questions.filter(
    (q) => q.required && answers[q.id] === undefined,
  ).length;

  return (
    <div className="space-y-6">
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border p-4 text-sm",
          isAnonymous
            ? "border-success/30 bg-success-subtle"
            : "border-warning/40 bg-warning-subtle",
        )}
      >
        <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {isAnonymous ? (
            <>
              <strong>This is anonymous.</strong> Your response is stored without
              any link to your employee record — not hidden, not encrypted,
              simply not recorded. Nobody can work out who wrote what.
            </>
          ) : (
            <>
              <strong>This is not anonymous.</strong> Your answers are stored
              against your name and whoever runs the survey will see them.
            </>
          )}
        </p>
      </div>

      <ol className="space-y-5">
        {questions.map((question, index) => (
          <li key={question.id} className="surface p-5">
            <fieldset>
              <legend className="text-sm font-medium">
                {index + 1}. {question.prompt}
                {question.required && (
                  <span className="text-destructive ml-1" aria-hidden>
                    *
                  </span>
                )}
              </legend>

              <div className="mt-3">
                {(question.type === "RATING_5" ||
                  question.type === "SCALE_10") && (
                  <ScaleInput
                    max={question.type === "RATING_5" ? 5 : 10}
                    value={answers[question.id] as number | undefined}
                    onChange={(v) =>
                      setAnswers((cur) => ({ ...cur, [question.id]: v }))
                    }
                    questionId={question.id}
                  />
                )}

                {question.type === "SINGLE_CHOICE" && (
                  <ul className="space-y-1.5">
                    {question.options.map((option) => (
                      <li key={option}>
                        <label className="hover:bg-muted/50 flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors">
                          <input
                            type="radio"
                            name={question.id}
                            checked={answers[question.id] === option}
                            onChange={() =>
                              setAnswers((cur) => ({
                                ...cur,
                                [question.id]: option,
                              }))
                            }
                            className="accent-primary"
                          />
                          {option}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}

                {question.type === "MULTI_CHOICE" && (
                  <ul className="space-y-1.5">
                    {question.options.map((option) => {
                      const current =
                        (answers[question.id] as string[] | undefined) ?? [];
                      return (
                        <li key={option} className="flex items-center gap-2.5">
                          <Checkbox
                            id={`${question.id}-${option}`}
                            checked={current.includes(option)}
                            onCheckedChange={(checked) =>
                              setAnswers((cur) => ({
                                ...cur,
                                [question.id]: checked
                                  ? [...current, option]
                                  : current.filter((o) => o !== option),
                              }))
                            }
                          />
                          <Label
                            htmlFor={`${question.id}-${option}`}
                            className="font-normal"
                          >
                            {option}
                          </Label>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {question.type === "TEXT" && (
                  <Textarea
                    rows={4}
                    maxLength={2000}
                    aria-label={question.prompt}
                    value={(answers[question.id] as string) ?? ""}
                    onChange={(e) =>
                      setAnswers((cur) => ({
                        ...cur,
                        [question.id]: e.target.value,
                      }))
                    }
                  />
                )}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          {missing > 0
            ? `${missing} required question${missing === 1 ? "" : "s"} left`
            : "Ready to send"}
        </p>
        <Button
          disabled={pending || missing > 0}
          onClick={() =>
            startTransition(async () => {
              const result = await submitSurveyAction(surveyId, answers);
              if (result.error) {
                toast.error(result.error);
                return;
              }
              setDone(true);
              router.refresh();
            })
          }
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Send className="size-4" aria-hidden />
          )}
          Submit
        </Button>
      </div>
    </div>
  );
}

function ScaleInput({
  max,
  value,
  onChange,
  questionId,
}: {
  max: number;
  value: number | undefined;
  onChange: (value: number) => void;
  questionId: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={value === n}
          aria-label={`${n} out of ${max}`}
          id={`${questionId}-${n}`}
          className={cn(
            "focus-visible:ring-ring size-9 rounded-md border text-sm tabular-nums transition-colors outline-none focus-visible:ring-3",
            value === n
              ? "bg-primary border-primary text-primary-foreground"
              : "border-input hover:border-foreground/40",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function SurveyStatusButton({
  surveyId,
  status,
}: {
  surveyId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const next = status === "OPEN" ? "CLOSED" : "OPEN";

  return (
    <Button
      variant={status === "OPEN" ? "outline" : "default"}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setSurveyStatusAction(surveyId, next);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(next === "OPEN" ? "Survey opened" : "Survey closed");
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {status === "OPEN" ? "Close survey" : "Open survey"}
    </Button>
  );
}
