"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { deleteAssetAction } from "@/lib/actions/assets";
import { Button } from "@/components/ui/button";

/**
 * Deleting an asset.
 *
 * Only offered on assets that have never been issued — the action refuses the
 * rest, because deleting a laptop's row would erase who was holding it and
 * when. Retiring is the operation for kit that has had a life.
 */
export function DeleteAssetButton({ id, name }: { id: string; name: string }) {
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
        if (!confirm(`Delete "${name}" from the register? This cannot be undone.`)) {
          return;
        }
        startTransition(async () => {
          const result = await deleteAssetAction(id);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success("Asset deleted");
          router.push("/assets");
        });
      }}
    >
      <Trash2 className="size-4" aria-hidden />
      Delete asset
    </Button>
  );
}
