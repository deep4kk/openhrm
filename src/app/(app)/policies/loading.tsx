import { PageShell } from "@/components/page-header";
import { HeaderSkeleton, ListSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <ListSkeleton rows={7} />
    </PageShell>
  );
}
