import type { Metadata } from "next";
import { Scale } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { getStatutorySettings } from "@/lib/queries/payroll";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { StatutoryForm } from "@/components/payroll/statutory-form";

export const metadata: Metadata = { title: "Statutory settings" };

/**
 * The compliance pack.
 *
 * PRD §15 names payroll compliance as a risk that carries real financial and
 * legal consequences for users, and its mitigation is to label these packs
 * clearly as community-maintained. That warning is at the top of this page, in
 * plain language, not buried in a footer — because this is the screen where
 * someone is about to trust a number.
 *
 * Everything is editable. Nothing about India is hard-coded in the engine; a
 * self-hoster elsewhere switches off what does not apply and enters their own
 * slabs.
 */
export default async function StatutorySettingsPage() {
  const session = await requirePermission("payroll.statutory.manage");
  const setting = await getStatutorySettings(session);

  if (!setting) {
    return (
      <PageShell className="max-w-3xl">
        <BackToSettings />
        <PageHeader
          title="Statutory settings"
          description="This organisation has no statutory configuration yet."
        />
        <p className="text-muted-foreground text-sm">
          Statutory settings are created with the organisation. If you are seeing
          this, the organisation predates the payroll module — run{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">
            npm run db:seed
          </code>{" "}
          to backfill defaults.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell className="max-w-3xl">
      <BackToSettings />

      <PageHeader
        title="Statutory settings"
        description="The rules the payroll engine applies to every payslip. Rates live here as data so they can be corrected without a code change."
      />

      <div className="border-warning/25 bg-warning-subtle flex items-start gap-3 rounded-lg border p-4">
        <Scale className="text-warning mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="text-sm">
          <p className="text-warning font-medium">
            Community-maintained, not tax advice
          </p>
          <p className="text-warning/90 mt-1">
            These figures ship as a starting point for India and can fall out of
            date with any budget. Payroll errors carry real financial and legal
            consequences — check them against current law with your accountant
            before you pay anyone.
          </p>
        </div>
      </div>

      <StatutoryForm
        setting={{
          countryCode: setting.countryCode,
          pfEnabled: setting.pfEnabled,
          pfWageCeiling: Number(setting.pfWageCeiling),
          pfEmployeeRate: Number(setting.pfEmployeeRate),
          pfEmployerRate: Number(setting.pfEmployerRate),
          pfCapAtCeiling: setting.pfCapAtCeiling,
          esiEnabled: setting.esiEnabled,
          esiWageCeiling: Number(setting.esiWageCeiling),
          esiEmployeeRate: Number(setting.esiEmployeeRate),
          esiEmployerRate: Number(setting.esiEmployerRate),
          ptEnabled: setting.ptEnabled,
          ptSlabs: JSON.stringify(setting.ptSlabs, null, 2),
          tdsEnabled: setting.tdsEnabled,
          tdsRegime: setting.tdsRegime,
          standardDeduction: Number(setting.standardDeduction),
          tdsSlabs: JSON.stringify(setting.tdsSlabs, null, 2),
          gratuityEnabled: setting.gratuityEnabled,
          gratuityMinYears: setting.gratuityMinYears,
        }}
      />
    </PageShell>
  );
}
