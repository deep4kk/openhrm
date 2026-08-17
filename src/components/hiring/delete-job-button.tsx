"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteJobAction } from "@/lib/actions/hiring";
import { Button } from "@/components/ui/button";

/**
 * Deleting a role.
 *
 * Only offered while nobody has applied — the action refuses the rest, because
 * deleting a posting would take its candidates with it. Closing is what you do
 * to a role that has had applicants.
 */
export function DeleteJobButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={() => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
        startTransition(async () => {
          const result = await deleteJobAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Role deleted");
          router.push("/hiring");
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete role
    </Button>
  );
}
