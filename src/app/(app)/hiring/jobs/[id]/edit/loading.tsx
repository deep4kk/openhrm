import { PageShell } from "@/components/page-header";
import { FormSkeleton, HeaderSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <PageShell>
      <HeaderSkeleton actions={false} />
      <FormSkeleton />
    </PageShell>
  );
}
