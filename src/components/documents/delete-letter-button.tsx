"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteLetterAction } from "@/lib/actions/documents";
import { Button } from "@/components/ui/button";

/**
 * Deleting an issued document.
 *
 * Refused outright by the action once the letter has been emailed — see the
 * comment there. This button exists for the ordinary case: generated with a
 * typo, noticed before it went anywhere.
 */
export function DeleteLetterButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;

        startTransition(async () => {
          const result = await deleteLetterAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Document deleted");
          router.push("/documents");
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete
    </Button>
  );
}
