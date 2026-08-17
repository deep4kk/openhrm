"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { moveCandidateAction } from "@/lib/actions/hiring";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PersonAvatar } from "@/components/people/person-avatar";
import { RatingStars } from "./hiring-bits";
import { cn } from "@/lib/utils";

/**
 * The candidate pipeline.
 *
 * Deliberately *not* drag-and-drop. A board where the only way to advance
 * someone is to pick up a card excludes keyboard and screen-reader users
 * entirely, breaks on touch, and — on the day a recruiter is moving thirty
 * people — is slower than a button. So each card carries back/forward controls
 * and a reject action, which are reachable by tab, announce what they do, and
 * work identically on a phone.
 *
 * Rejecting asks for a reason before it commits, because "why did we pass on
 * this person" is the question asked six months later when they apply again.
 */

const BOARD: { stage: BoardStage; label: string }[] = [
  { stage: "APPLIED", label: "Applied" },
  { stage: "SCREENING", label: "Screening" },
  { stage: "INTERVIEW", label: "Interview" },
  { stage: "OFFER", label: "Offer" },
];

type BoardStage = "APPLIED" | "SCREENING" | "INTERVIEW" | "OFFER";

export interface PipelineCandidate {
  id: string;
  firstName: string;
  lastName: string;
  stage: string;
  rating: number | null;
  currentCompany: string | null;
  skills: string[];
  interviewCount: number;
  pendingFeedback: number;
  appliedLabel: string;
  offerStatus: string | null;
}

export function PipelineBoard({
  candidates,
  canManage,
}: {
  candidates: PipelineCandidate[];
  canManage: boolean;
}) {
  const [rejecting, setRejecting] = useState<PipelineCandidate | null>(null);

  const columns = BOARD.map((column) => ({
    ...column,
    items: candidates.filter((c) => c.stage === column.stage),
  }));

  const closed = candidates.filter(
    (c) => c.stage === "HIRED" || c.stage === "REJECTED",
  );

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((column, index) => (
          <section key={column.stage} className="min-w-0">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {column.label}
              <span className="text-muted-foreground font-normal tabular-nums">
                {column.items.length}
              </span>
            </h3>

            <ul className="space-y-2">
              {column.items.length === 0 && (
                <li className="border-muted text-muted-foreground rounded-lg border border-dashed px-3 py-6 text-center text-xs">
                  Nobody here
                </li>
              )}

              {column.items.map((candidate) => (
                <CandidateCard
                  key={candidate.id}
                  candidate={candidate}
                  canManage={canManage}
                  prevStage={index > 0 ? BOARD[index - 1]!.stage : null}
                  nextStage={
                    index < BOARD.length - 1 ? BOARD[index + 1]!.stage : null
                  }
                  onReject={() => setRejecting(candidate)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {closed.length > 0 && (
        <details className="surface mt-6 p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            Hired and rejected
            <span className="text-muted-foreground ml-2 font-normal tabular-nums">
              {closed.length}
            </span>
          </summary>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {closed.map((candidate) => (
              <li key={candidate.id}>
                <Link
                  href={`/hiring/candidates/${candidate.id}`}
                  className="hover:bg-muted/50 flex items-center gap-2.5 rounded-md p-2 transition-colors"
                >
                  <PersonAvatar
                    firstName={candidate.firstName}
                    lastName={candidate.lastName}
                    size="xs"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm">
                      {candidate.firstName} {candidate.lastName}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {candidate.stage === "HIRED" ? "Hired" : "Rejected"}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {rejecting && (
        <RejectDialog
          candidate={rejecting}
          onClose={() => setRejecting(null)}
        />
      )}
    </>
  );
}

function CandidateCard({
  candidate,
  canManage,
  prevStage,
  nextStage,
  onReject,
}: {
  candidate: PipelineCandidate;
  canManage: boolean;
  prevStage: BoardStage | null;
  nextStage: BoardStage | null;
  onReject: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const name = `${candidate.firstName} ${candidate.lastName}`.trim();

  function move(stage: BoardStage) {
    startTransition(async () => {
      const result = await moveCandidateAction(candidate.id, stage);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <li className={cn("surface p-3", pending && "opacity-60")}>
      <Link
        href={`/hiring/candidates/${candidate.id}`}
        className="flex items-start gap-2.5"
      >
        <PersonAvatar
          firstName={candidate.firstName}
          lastName={candidate.lastName}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium hover:underline">{name}</p>
          <p className="text-muted-foreground truncate text-xs">
            {candidate.currentCompany ?? candidate.appliedLabel}
          </p>
        </div>
        <RatingStars rating={candidate.rating} />
      </Link>

      {candidate.skills.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {candidate.skills.slice(0, 4).map((skill) => (
            <li
              key={skill}
              className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]"
            >
              {skill}
            </li>
          ))}
        </ul>
      )}

      {(candidate.interviewCount > 0 || candidate.offerStatus) && (
        <p className="text-muted-foreground mt-2 text-xs">
          {candidate.interviewCount > 0 &&
            `${candidate.interviewCount} interview${
              candidate.interviewCount === 1 ? "" : "s"
            }`}
          {candidate.pendingFeedback > 0 &&
            ` · ${candidate.pendingFeedback} awaiting feedback`}
          {candidate.offerStatus && ` · offer ${candidate.offerStatus.toLowerCase()}`}
        </p>
      )}

      {canManage && (
        <div className="mt-2.5 flex items-center gap-1 border-t pt-2.5">
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending || !prevStage}
            onClick={() => prevStage && move(prevStage)}
            aria-label={`Move ${name} back to ${prevStage?.toLowerCase() ?? "previous stage"}`}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending || !nextStage}
            onClick={() => nextStage && move(nextStage)}
            aria-label={`Advance ${name} to ${nextStage?.toLowerCase() ?? "next stage"}`}
          >
            {pending ? <Loader2 className="animate-spin" /> : <ChevronRight />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={pending}
            onClick={onReject}
            aria-label={`Reject ${name}`}
            className="text-muted-foreground hover:text-destructive ml-auto"
          >
            <X />
          </Button>
        </div>
      )}
    </li>
  );
}

function RejectDialog({
  candidate,
  onClose,
}: {
  candidate: PipelineCandidate;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Reject {candidate.firstName} {candidate.lastName}?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="reject-reason" className="text-sm font-medium">
              Why?
            </label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              placeholder="Internal only. The next recruiter reading this file will thank you."
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                startTransition(async () => {
                  const result = await moveCandidateAction(
                    candidate.id,
                    "REJECTED",
                    reason,
                  );
                  if (result.error) {
                    toast.error(result.error);
                    return;
                  }
                  toast.success("Candidate rejected");
                  onClose();
                  router.refresh();
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
