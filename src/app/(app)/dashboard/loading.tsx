import { PageShell } from "@/components/page-header";
import {
  ChartSkeleton,
  HeaderSkeleton,
  ListSkeleton,
  StatRowSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton actions={false} />
      <StatRowSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <ListSkeleton rows={5} />
    </PageShell>
  );
}
