import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Layers, Puzzle } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import {
  getStatutorySettings,
  listSalaryComponents,
  listSalaryStructures,
  toStatutoryConfig,
} from "@/lib/queries/payroll";
import { formatMoney } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/page-header";
import { Panel } from "@/components/settings/panel";
import { StatusBadge } from "@/components/status-badge";
import { StructurePreview } from "@/components/payroll/structure-preview";

export const metadata: Metadata = { title: "Salary structures" };

/**
 * Salary components and the structures that combine them.
 *
 * The screen leads with a live preview rather than a form, because the question
 * an admin has here is never "what fields does a structure have" — it is "if I
 * put someone on this at ₹12L, what lands in their account?". The preview
 * answers that with the real engine, not an approximation.
 */
export default async function SalaryStructuresPage() {
  const session = await requirePermission("payroll.structure.manage", "payroll.read.all");

  const [components, structures, setting] = await Promise.all([
    listSalaryComponents(session),
    listSalaryStructures(session),
    getStatutorySettings(session),
  ]);

  const currency = session.org.currency;
  // Without a statutory row the preview would silently drop PF and tax, which
  // would understate every figure on this page — so say so instead.
  const statutory = setting ? toStatutoryConfig(setting) : null;

  return (
    <PageShell className="max-w-5xl">
      <Link
        href="/payroll"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex w-fit items-center gap-1 rounded-md text-sm transition-colors"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Payroll
      </Link>

      <PageHeader
        title="Salary structures"
        description="A structure turns one CTC figure into a full set of payslip lines. Statutory components are computed by the compliance pack — they can be switched off, but not typed over."
      />

      {structures.map((structure) => (
        <Panel
          key={structure.id}
          icon={Layers}
          title={structure.name}
          description={structure.description ?? undefined}
          action={
            <div className="flex items-center gap-2">
              {structure.isDefault && <StatusBadge label="Default" tone="info" />}
              <span className="text-muted-foreground text-xs tabular-nums">
                {structure._count.salaries} employee
                {structure._count.salaries === 1 ? "" : "s"}
              </span>
            </div>
          }
        >
          {statutory ? (
            <StructurePreview
              currency={currency}
              statutory={statutory}
              components={structure.components.map((row) => ({
                code: row.component.code,
                label: row.component.name,
                type: row.component.type,
                calculation: row.component.calculation,
                value: Number(row.value ?? row.component.defaultValue),
                isTaxable: row.component.isTaxable,
                sortdex: row.sortdex,
              }))}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              Configure the statutory pack before previewing — PF, ESI and tax
              are part of every figure this structure produces.
            </p>
          )}
        </Panel>
      ))}

      <Panel
        icon={Puzzle}
        title="Components"
        count={components.length}
        description="The building blocks. A component belongs to one of three families: what an employee earns, what is deducted from it, and what the employer pays on top."
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-xs">
                <th className="py-2 pr-4 text-left font-medium">Component</th>
                <th className="px-3 py-2 text-left font-medium">Family</th>
                <th className="px-3 py-2 text-left font-medium">How it is worked out</th>
                <th className="px-3 py-2 text-left font-medium">Taxable</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component) => (
                <tr key={component.id} className="border-b last:border-0">
                  <td className="py-2.5 pr-4">
                    <span className="font-medium">{component.name}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-[11px]">
                      {component.code}
                    </span>
                    {component.description && (
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {component.description}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge
                      label={FAMILY[component.type] ?? component.type}
                      tone={
                        component.type === "EARNING"
                          ? "positive"
                          : component.type === "DEDUCTION"
                            ? "warning"
                            : "info"
                      }
                    />
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-xs">
                    {explain(component.calculation, Number(component.defaultValue), currency)}
                  </td>
                  <td className="text-muted-foreground px-3 py-2.5 text-xs">
                    {component.isTaxable ? "Yes" : "No"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </PageShell>
  );
}

const FAMILY: Record<string, string> = {
  EARNING: "Earning",
  DEDUCTION: "Deduction",
  EMPLOYER_CONTRIBUTION: "Employer cost",
};

function explain(calculation: string, value: number, currency: string): string {
  switch (calculation) {
    case "PERCENT_OF_GROSS":
      return `${value}% of monthly gross`;
    case "PERCENT_OF_BASIC":
      return `${value}% of basic`;
    case "FLAT":
      return `${formatMoney(value, currency)} a month`;
    case "BALANCE":
      return "Whatever is left of gross after the other earnings";
    case "STATUTORY":
      return "Computed by the compliance pack";
    default:
      return calculation;
  }
}
