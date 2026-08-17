"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { archiveCourseAction, deleteCourseAction } from "@/lib/actions/learning";
import { Button } from "@/components/ui/button";

/**
 * Archive is the ordinary way to retire a course: completion records survive,
 * and the certificate someone earned in March still means something. Delete is
 * only offered on courses nobody has ever been assigned.
 */
export function ArchiveCourseButton({
  courseId,
  isArchived,
}: {
  courseId: string;
  isArchived: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await archiveCourseAction(courseId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(isArchived ? "Course restored" : "Course archived");
          router.refresh();
        })
      }
    >
      {isArchived ? (
        <ArchiveRestore className="size-4" aria-hidden />
      ) : (
        <Archive className="size-4" aria-hidden />
      )}
      {isArchived ? "Restore" : "Archive"}
    </Button>
  );
}

export function DeleteCourseButton({
  courseId,
  title,
}: {
  courseId: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={() => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
        startTransition(async () => {
          const result = await deleteCourseAction(courseId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Course deleted");
          router.push("/learning");
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete course
    </Button>
  );
}
