"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  scheduleInterviewAction,
  submitInterviewFeedbackAction,
} from "@/lib/actions/hiring";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OutcomeBadge } from "./hiring-bits";

export interface InterviewView {
  id: string;
  round: number;
  title: string;
  scheduledLabel: string;
  durationMinutes: number;
  mode: string;
  meetingUrl: string | null;
  outcome: string;
  score: number | null;
  feedback: string | null;
  interviewerName: string | null;
  /** Whether the viewer is the one who owes this scorecard. */
  isMine: boolean;
}

/**
 * The interview list and its scorecards.
 *
 * Feedback is written inline on the row rather than behind a route, because the
 * person filling it in has just come out of the call with the answer in their
 * head — and the single biggest determinant of whether a scorecard gets filled
 * in at all is how many clicks stand between the interviewer and the box.
 */
export function InterviewPanel({
  candidateId,
  candidateName,
  interviews,
  interviewers,
  canSchedule,
  canGiveFeedback,
}: {
  candidateId: string;
  candidateName: string;
  interviews: InterviewView[];
  interviewers: { id: string; name: string }[];
  canSchedule: boolean;
  canGiveFeedback: boolean;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">
          Interviews
          <span className="text-muted-foreground ml-2 font-normal tabular-nums">
            {interviews.length}
          </span>
        </h2>
        {canSchedule && (
          <ScheduleInterviewDialog
            candidateId={candidateId}
            candidateName={candidateName}
            interviewers={interviewers}
            nextRound={
              interviews.reduce((max, i) => Math.max(max, i.round), 0) + 1
            }
          />
        )}
      </div>

      {interviews.length === 0 ? (
        <div className="surface text-muted-foreground p-6 text-center text-sm">
          No interviews scheduled yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {interviews.map((interview) => (
            <InterviewRow
              key={interview.id}
              interview={interview}
              canGiveFeedback={canGiveFeedback}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InterviewRow({
  interview,
  canGiveFeedback,
}: {
  interview: InterviewView;
  canGiveFeedback: boolean;
}) {
  const [writing, setWriting] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    submitInterviewFeedbackAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Scorecard saved");
      setWriting(false);
      router.refresh();
    }
  }, [state.success, router]);

  const awaiting = interview.outcome === "PENDING";

  return (
    <li className="surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Round {interview.round} — {interview.title}
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs tabular-nums">
            {interview.scheduledLabel} · {interview.durationMinutes} min ·{" "}
            {interview.mode}
            {interview.interviewerName && ` · ${interview.interviewerName}`}
          </p>
          {interview.meetingUrl && (
            <a
              href={interview.meetingUrl}
              target="_blank"
              rel="noreferrer"
              className="text-brand mt-1 inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
            >
              Join call
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <OutcomeBadge outcome={interview.outcome} />
          {interview.score && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {interview.score}/5
            </span>
          )}
        </div>
      </div>

      {interview.feedback && !writing && (
        <p className="bg-muted measure mt-3 rounded-md px-3 py-2 text-sm whitespace-pre-wrap">
          {interview.feedback}
        </p>
      )}

      {canGiveFeedback && awaiting && !writing && (
        <Button
          variant={interview.isMine ? "default" : "outline"}
          size="sm"
          className="mt-3"
          onClick={() => setWriting(true)}
        >
          {interview.isMine ? "Write your scorecard" : "Record feedback"}
        </Button>
      )}

      {canGiveFeedback && !awaiting && !writing && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={() => setWriting(true)}
        >
          Revise scorecard
        </Button>
      )}

      {writing && (
        <form action={action} className="mt-4 space-y-4 border-t pt-4">
          <FormError message={state.error} />
          <input type="hidden" name="interviewId" value={interview.id} />

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Verdict" name="outcome" required>
              {(p) => (
                <select
                  {...p}
                  defaultValue={
                    interview.outcome === "PENDING" ? "YES" : interview.outcome
                  }
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="STRONG_YES">Strong yes</option>
                  <option value="YES">Yes</option>
                  <option value="NO">No</option>
                  <option value="STRONG_NO">Strong no</option>
                </select>
              )}
            </FormField>

            <FormField label="Score out of 5" name="score">
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={5}
                  defaultValue={interview.score ?? ""}
                  className="tabular-nums"
                />
              )}
            </FormField>
          </div>

          <FormField
            label="What happened"
            name="feedback"
            error={state.fieldErrors?.feedback}
            required
            hint="What you asked, what they said, and what you'd want the next round to probe."
          >
            {(p) => (
              <Textarea
                {...p}
                rows={6}
                defaultValue={interview.feedback ?? ""}
                maxLength={5000}
              />
            )}
          </FormField>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setWriting(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save scorecard
            </Button>
          </div>
        </form>
      )}
    </li>
  );
}

function ScheduleInterviewDialog({
  candidateId,
  candidateName,
  interviewers,
  nextRound,
}: {
  candidateId: string;
  candidateName: string;
  interviewers: { id: string; name: string }[];
  nextRound: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    scheduleInterviewAction,
    {},
  );
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success("Interview scheduled");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarPlus className="size-4" aria-hidden />
        Schedule
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Schedule an interview</DialogTitle>
          <DialogDescription>
            With {candidateName}. The interviewer gets a notification and owes a
            scorecard afterwards.
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          <input type="hidden" name="candidateId" value={candidateId} />

          <div className="grid gap-5 sm:grid-cols-[1fr_6rem]">
            <FormField
              label="What round is this"
              name="title"
              error={state.fieldErrors?.title}
              required
            >
              {(p) => (
                <Input
                  {...p}
                  defaultValue={
                    nextRound === 1 ? "Screening call" : "Technical round"
                  }
                  maxLength={120}
                />
              )}
            </FormField>

            <FormField label="Round" name="round" required>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={1}
                  max={12}
                  defaultValue={nextRound}
                  className="tabular-nums"
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField
              label="When"
              name="scheduledAt"
              error={state.fieldErrors?.scheduledAt}
              required
            >
              {(p) => <Input {...p} type="datetime-local" />}
            </FormField>

            <FormField label="Length (minutes)" name="durationMinutes" required>
              {(p) => (
                <Input
                  {...p}
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  defaultValue={45}
                  className="tabular-nums"
                />
              )}
            </FormField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Mode" name="mode" required>
              {(p) => (
                <select
                  {...p}
                  defaultValue="video"
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="video">Video</option>
                  <option value="phone">Phone</option>
                  <option value="onsite">Onsite</option>
                </select>
              )}
            </FormField>

            <FormField label="Interviewer" name="interviewerId">
              {(p) => (
                <select
                  {...p}
                  className="border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm"
                >
                  <option value="">Not decided yet</option>
                  {interviewers.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              )}
            </FormField>
          </div>

          <FormField label="Meeting link" name="meetingUrl">
            {(p) => <Input {...p} type="url" maxLength={500} />}
          </FormField>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Schedule
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
