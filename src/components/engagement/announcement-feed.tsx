"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Megaphone, Pencil, Pin, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteAnnouncementAction,
  reactToAnnouncementAction,
  saveAnnouncementAction,
} from "@/lib/actions/engagement";
import type { FormState } from "@/lib/actions/auth";
import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const REACTIONS = ["👍", "🎉", "❤️", "👏"];

export interface FeedAnnouncement {
  id: string;
  title: string;
  body: string;
  audience: string;
  audienceLabel: string | null;
  isPinned: boolean;
  authorName: string | null;
  publishedLabel: string;
  reactions: { emoji: string; count: number }[];
  myReaction: string | null;
  departmentId: string | null;
  locationId: string | null;
}

/**
 * The company feed.
 *
 * Reactions matter more than they look: an announcement with no way to respond
 * is a broadcast into silence, and "did anyone read this?" is otherwise
 * unanswerable. Four emoji, one per person, no comment thread — enough signal
 * to be useful, not enough surface to become a place arguments happen.
 */
export function AnnouncementFeed({
  announcements,
  canManage,
  departments,
  locations,
}: {
  announcements: FeedAnnouncement[];
  canManage: boolean;
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
}) {
  if (announcements.length === 0) {
    return (
      <div className="surface">
        <EmptyState
          icon={Megaphone}
          title="Nothing posted yet"
          description={
            canManage
              ? "Post company news, policy changes and the things that would otherwise go out on WhatsApp and be lost."
              : "Company news will appear here."
          }
        />
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {announcements.map((announcement) => (
        <li key={announcement.id} className="surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {announcement.isPinned && (
                  <Pin className="text-warning size-3.5" aria-label="Pinned" />
                )}
                <h3 className="text-sm font-semibold">{announcement.title}</h3>
                {announcement.audienceLabel && (
                  <StatusBadge label={announcement.audienceLabel} tone="info" />
                )}
              </div>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {announcement.authorName ?? "HR"} ·{" "}
                {announcement.publishedLabel}
              </p>
            </div>

            {canManage && (
              <div className="flex shrink-0 items-center gap-1">
                <AnnouncementDialog
                  departments={departments}
                  locations={locations}
                  announcement={announcement}
                />
                <DeleteButton
                  id={announcement.id}
                  title={announcement.title}
                />
              </div>
            )}
          </div>

          <p className="measure mt-3 text-sm whitespace-pre-wrap">
            {announcement.body}
          </p>

          <Reactions
            announcementId={announcement.id}
            reactions={announcement.reactions}
            mine={announcement.myReaction}
          />
        </li>
      ))}
    </ul>
  );
}

function Reactions({
  announcementId,
  reactions,
  mine,
}: {
  announcementId: string;
  reactions: { emoji: string; count: number }[];
  mine: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const counts = new Map(reactions.map((r) => [r.emoji, r.count]));

  return (
    <div className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
      {REACTIONS.map((emoji) => {
        const count = counts.get(emoji) ?? 0;
        const active = mine === emoji;

        return (
          <button
            key={emoji}
            type="button"
            disabled={pending}
            aria-pressed={active}
            aria-label={`React with ${emoji}${count > 0 ? `, ${count} so far` : ""}`}
            onClick={() =>
              startTransition(async () => {
                const result = await reactToAnnouncementAction(
                  announcementId,
                  emoji,
                );
                if (result.error) {
                  toast.error(result.error);
                  return;
                }
                router.refresh();
              })
            }
            className={cn(
              "focus-visible:ring-ring inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors outline-none focus-visible:ring-3 disabled:opacity-50",
              active
                ? "border-primary bg-primary/10"
                : "border-transparent hover:border-input",
            )}
          >
            <span aria-hidden>{emoji}</span>
            {count > 0 && <span className="tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

function DeleteButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={`Delete ${title}`}
      onClick={() => {
        if (!confirm(`Delete "${title}"?`)) return;
        startTransition(async () => {
          const result = await deleteAnnouncementAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Announcement deleted");
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
    </Button>
  );
}

export function AnnouncementDialog({
  departments,
  locations,
  announcement,
}: {
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  announcement?: FeedAnnouncement;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveAnnouncementAction,
    {},
  );
  const [audience, setAudience] = useState(announcement?.audience ?? "ALL");
  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(announcement ? "Announcement updated" : "Posted");
      setOpen(false);
      router.refresh();
    }
  }, [state.success, announcement, router]);

  const selectClass =
    "border-input bg-background h-9 w-full rounded-lg border px-2.5 text-sm";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant={announcement ? "ghost" : "default"}
            size={announcement ? "icon-sm" : "default"}
          />
        }
      >
        {announcement ? (
          <Pencil />
        ) : (
          <>
            <Megaphone className="size-4" aria-hidden />
            Post an announcement
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {announcement ? "Edit announcement" : "Post an announcement"}
          </DialogTitle>
          <DialogDescription>
            {announcement
              ? "Editing doesn't re-notify anyone."
              : "Everyone in the audience gets a notification, and Slack or Teams if connected."}
          </DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-5">
          <FormError message={state.error} />
          {announcement && <input type="hidden" name="id" value={announcement.id} />}

          <FormField
            label="Headline"
            name="title"
            error={state.fieldErrors?.title}
            required
          >
            {(p) => (
              <Input {...p} defaultValue={announcement?.title} maxLength={160} />
            )}
          </FormField>

          <FormField
            label="What's the news"
            name="body"
            error={state.fieldErrors?.body}
            required
          >
            {(p) => (
              <Textarea
                {...p}
                rows={7}
                defaultValue={announcement?.body}
                maxLength={20_000}
              />
            )}
          </FormField>

          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Who sees it" name="audience" required>
              {(p) => (
                <select
                  {...p}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className={selectClass}
                >
                  <option value="ALL">Everyone</option>
                  <option value="DEPARTMENT">One department</option>
                  <option value="LOCATION">One location</option>
                </select>
              )}
            </FormField>

            {audience === "DEPARTMENT" && (
              <FormField
                label="Department"
                name="departmentId"
                error={state.fieldErrors?.departmentId}
                required
              >
                {(p) => (
                  <select
                    {...p}
                    defaultValue={announcement?.departmentId ?? ""}
                    className={selectClass}
                  >
                    <option value="">Choose…</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}

            {audience === "LOCATION" && (
              <FormField
                label="Location"
                name="locationId"
                error={state.fieldErrors?.locationId}
                required
              >
                {(p) => (
                  <select
                    {...p}
                    defaultValue={announcement?.locationId ?? ""}
                    className={selectClass}
                  >
                    <option value="">Choose…</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                )}
              </FormField>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Checkbox
              id="isPinned"
              name="isPinned"
              defaultChecked={announcement?.isPinned}
            />
            <Label htmlFor="isPinned" className="font-normal">
              Pin to the top of the feed
            </Label>
          </div>

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
              {announcement ? "Save" : "Post it"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
