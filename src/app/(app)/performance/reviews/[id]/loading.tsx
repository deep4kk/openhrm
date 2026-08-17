import { PageShell } from "@/components/page-header";
import { DetailSkeleton, HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <DetailSkeleton />
    </PageShell>
  );
}
