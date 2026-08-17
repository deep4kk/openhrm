import { PageShell } from "@/components/page-header";
import {
  HeaderSkeleton,
  ListSkeleton,
  StatRowSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <ListSkeleton rows={5} />
        <div className="space-y-3">
          <StatRowSkeleton tiles={2} />
        </div>
      </div>
    </PageShell>
  );
}
