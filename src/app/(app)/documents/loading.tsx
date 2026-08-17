import { PageShell } from "@/components/page-header";
import { HeaderSkeleton, TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <TableSkeleton rows={8} cols={5} />
    </PageShell>
  );
}
