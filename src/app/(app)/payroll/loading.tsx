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
      <StatRowSkeleton />
      <ListSkeleton rows={5} />
    </PageShell>
  );
}
