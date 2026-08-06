import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import {
  COUNTRIES,
  CURRENCIES,
  MONTHS,
  WEEKDAYS,
  timezoneOptions,
} from "@/lib/locale";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { OrganizationForm } from "@/components/settings/organization-form";

export const metadata: Metadata = { title: "Organisation" };

export default async function OrganisationSettingsPage() {
  const session = await requirePermission("org.update");
  const db = orgDb(session.org.id);

  const org = await db.organization.findFirst({ where: { id: session.org.id } });
  if (!org) return null;

  return (
    <PageShell className="max-w-3xl">
      <BackToSettings />
      <PageHeader
        title="Organisation"
        description="The company profile, and the three settings the rest of the app calculates against: timezone, leave year and working days."
      />

      <div className="surface p-5 sm:p-6">
        <OrganizationForm
          values={{
            name: org.name,
            industry: org.industry ?? "",
            website: org.website ?? "",
            country: org.country,
            currency: org.currency,
            timezone: org.timezone,
            fiscalYearStartMonth: String(org.fiscalYearStartMonth),
            workingDays: org.workingDays,
          }}
          countries={COUNTRIES}
          currencies={CURRENCIES}
          timezones={timezoneOptions(org.timezone)}
          months={MONTHS}
          weekdays={WEEKDAYS}
        />
      </div>

      <p className="text-muted-foreground text-xs">
        The organisation identifier{" "}
        <code className="bg-muted rounded px-1 py-0.5 font-mono">{org.slug}</code>{" "}
        is fixed after sign-up — it appears in invitation links that may already
        be in people&apos;s inboxes.
      </p>
    </PageShell>
  );
}
