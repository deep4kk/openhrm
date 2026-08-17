import type { Metadata } from "next";

import { requirePermission, can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import {
  BrandingForm,
  IntegrationsForm,
} from "@/components/settings/branding-form";

export const metadata: Metadata = { title: "Branding" };

/**
 * Making it look like theirs (PRD §8.29).
 *
 * Kept on the same screen as chat integrations because both are "connect this
 * instance to the outside world" settings that an admin configures once, on
 * day one, and then never opens again.
 */
export default async function BrandingPage() {
  const session = await requirePermission("branding.manage", "integration.manage");

  const org = await orgDb(session.org.id).organization.findFirst({
    where: { id: session.org.id },
    select: {
      brandColor: true,
      loginTagline: true,
      supportEmail: true,
      customDomain: true,
      slackWebhookUrl: true,
      teamsWebhookUrl: true,
    },
  });

  return (
    <PageShell className="max-w-3xl">
      <BackToSettings />

      <PageHeader
        title="Branding & integrations"
        description="Colour, tagline and domain for this instance, and where HR alerts land."
      />

      {can(session, "branding.manage") && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Look and feel</h2>
          <BrandingForm
            branding={{
              brandColor: org?.brandColor ?? "",
              loginTagline: org?.loginTagline ?? "",
              supportEmail: org?.supportEmail ?? "",
              customDomain: org?.customDomain ?? "",
            }}
          />
          <p className="text-muted-foreground mt-2 text-xs">
            The logo and registered address live under{" "}
            <a
              href="/settings/letterhead"
              className="text-brand underline-offset-4 hover:underline"
            >
              Letterhead
            </a>
            , because they print on documents as well as appearing on screen.
          </p>
        </section>
      )}

      {can(session, "integration.manage") && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">Chat notifications</h2>
          <IntegrationsForm
            integrations={{
              slackWebhookUrl: org?.slackWebhookUrl ?? "",
              teamsWebhookUrl: org?.teamsWebhookUrl ?? "",
            }}
          />
        </section>
      )}
    </PageShell>
  );
}
