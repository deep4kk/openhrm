import { PageShell } from "@/components/page-header";
import { CardGridSkeleton, HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton actions={false} />
      <CardGridSkeleton cards={8} cols={2} />
    </PageShell>
  );
}
