import { PageShell } from "@/components/page-header";
import {
  CardGridSkeleton,
  HeaderSkeleton,
  StatRowSkeleton,
} from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton />
      <StatRowSkeleton />
      <CardGridSkeleton cards={6} />
    </PageShell>
  );
}
