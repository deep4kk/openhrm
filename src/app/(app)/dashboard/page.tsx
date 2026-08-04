import type { Metadata } from "next";

import { requireAuth } from "@/lib/auth";
import { PageHeader, PageShell } from "@/components/page-header";

export const metadata: Metadata = { title: "Home" };

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <PageShell>
      <PageHeader
        title={`${greeting()}, ${session.employee?.firstName ?? session.user.name}`}
        description="Your organisation at a glance."
      />
      <div className="surface p-6 text-sm">
        Dashboard widgets land here.
      </div>
    </PageShell>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
