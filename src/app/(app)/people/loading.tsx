import { PageShell } from "@/components/page-header";
import { HeaderSkeleton, TableSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <TableSkeleton rows={10} cols={5} filters />
    </PageShell>
  );
}
