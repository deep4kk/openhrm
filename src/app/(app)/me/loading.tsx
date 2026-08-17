import { PageShell } from "@/components/page-header";
import {
  HeaderSkeleton,
  StatRowSkeleton,
  TableSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <StatRowSkeleton />
      <TableSkeleton rows={6} cols={4} />
    </PageShell>
  );
}
