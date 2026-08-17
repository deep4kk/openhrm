import { PageShell } from "@/components/page-header";
import {
  ChartSkeleton,
  HeaderSkeleton,
  StatRowSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <StatRowSkeleton />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
    </PageShell>
  );
}
