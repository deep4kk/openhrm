import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { LetterheadForm } from "@/components/settings/letterhead-form";

export const metadata: Metadata = { title: "Letterhead" };

/**
 * What the company looks like on paper.
 *
 * Separate from the organisation profile because these three fields have one
 * consumer — the documents module — and because the profile screen is already
 * about settings the rest of the app calculates against. Mixing "what timezone
 * is attendance graded in" with "what address prints on an offer letter" would
 * make both harder to find.
 */
export default async function LetterheadSettingsPage() {
  const session = await requirePermission("org.update");
  const db = orgDb(session.org.id);

  const org = await db.organization.findFirst({
    where: { id: session.org.id },
    select: {
      logoUrl: true,
      letterheadAddress: true,
      signatoryName: true,
      signatoryTitle: true,
    },
  });
  if (!org) return null;

  return (
    <PageShell className="max-w-3xl">
      <BackToSettings />
      <PageHeader
        title="Letterhead"
        description="The logo, address and signature block printed on every document you generate."
      />

      <div className="surface p-5 sm:p-6">
        <LetterheadForm
          values={{
            logoUrl: org.logoUrl,
            letterheadAddress: org.letterheadAddress ?? "",
            signatoryName: org.signatoryName ?? "",
            signatoryTitle: org.signatoryTitle ?? "",
          }}
        />
      </div>
    </PageShell>
  );
}
