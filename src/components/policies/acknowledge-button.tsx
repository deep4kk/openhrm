"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  acknowledgePolicyAction,
  archivePolicyAction,
} from "@/lib/actions/policies";
import { Button } from "@/components/ui/button";

/**
 * The acknowledgement.
 *
 * A single deliberate action with the consequence stated on it: pressing this
 * records who, when and from where. It sits at the bottom of the policy rather
 * than the top, because acknowledging something you have not scrolled through
 * is the failure mode this feature exists to avoid.
 */
export function AcknowledgeButton({
  policyId,
  version,
}: {
  policyId: string;
  version: number;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="surface flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="text-sm font-medium">Confirm you have read this</p>
        <p className="text-muted-foreground mt-0.5 text-xs">
          Your name, the time and your IP address are recorded against version{" "}
          {version}.
        </p>
      </div>
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acknowledgePolicyAction(policyId);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            toast.success("Acknowledged");
            router.refresh();
          })
        }
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Check className="size-4" aria-hidden />
        )}
        I have read and understood
      </Button>
    </div>
  );
}

export function ArchivePolicyButton({
  policyId,
  isArchived,
}: {
  policyId: string;
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
          const result = await archivePolicyAction(policyId);
          if (result.error) {
            toast.error(result.error);
            return;
          }
          toast.success(isArchived ? "Policy restored" : "Policy archived");
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
