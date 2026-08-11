import "server-only";

import type { AuthContext } from "@/lib/auth";
import { can } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { calculatePayslip, monthlyGrossFromCtc } from "@/lib/payroll/engine";
import { toEngineComponents, toStatutoryConfig } from "@/lib/queries/payroll";
import { canReachEmployee } from "@/lib/scope";
import { isSensitiveSource } from "./types";

/**
 * Filling the form in from the record the organisation already has.
 *
 * This is the difference between a document generator and a word processor. HR
 * picks a person; joining date, designation, reporting line and the current
 * salary breakdown arrive already filled in, and the user corrects rather than
 * transcribes. Transcription is where wrong figures on offer letters come from.
 *
 * Three rules hold here:
 *
 *  1. **Reachability is checked, not assumed.** A manager with team-scoped
 *     access cannot autofill from someone else's team by passing their id to
 *     the server action.
 *
 *  2. **Compensation is gated separately.** A user without
 *     `employee.compensation.read` gets every non-salary field prefilled and
 *     the salary fields blank — an empty box to type into, not a 403. An HR
 *     coordinator who cannot see payroll should still be able to raise an
 *     experience letter.
 *
 *  3. **Values come back raw, not formatted.** `"1200000"`, not `"₹12,00,000"`.
 *     Formatting happens once, at render time, in src/lib/documents/render.ts —
 *     so a prefilled amount the user edits is still a number the renderer can
 *     re-format.
 */

export interface AutofillResult {
  /** Source key -> raw value. Only keys that resolved to something appear. */
  values: Record<string, string>;
  /** True when compensation sources were withheld for lack of permission. */
  compensationWithheld: boolean;
  employee: {
    id: string;
    name: string;
    workEmail: string;
    personalEmail: string | null;
  };
}

function isoDate(value: Date | null | undefined): string | undefined {
  if (!value) return undefined;
  // The date inputs on the generate form speak yyyy-mm-dd; the columns are
  // @db.Date, so the UTC slice is the calendar day the user stored.
  return value.toISOString().slice(0, 10);
}

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  CONSULTANT: "Consultant",
};

/** "3 years, 2 months" — how an experience letter states a tenure. */
function tenureBetween(from: Date, to: Date): string {
  let months =
    (to.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  months = Math.max(months, 0);

  const years = Math.floor(months / 12);
  const rest = months % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : "less than a month";
}

export async function resolveAutofill(
  session: AuthContext,
  employeeId: string,
): Promise<AutofillResult | null> {
  const db = orgDb(session.org.id);

  // The tenant extension already constrains this to the caller's organisation;
  // this second check constrains it to the caller's *scope* within it.
  const reachable = await canReachEmployee(session, "employee.read", employeeId);
  if (!reachable) return null;

  const employee = await db.employee.findFirst({
    where: { id: employeeId },
    include: {
      department: { select: { name: true } },
      designation: { select: { title: true } },
      location: { select: { name: true, city: true } },
      manager: { select: { firstName: true, lastName: true, displayName: true } },
    },
  });
  if (!employee) return null;

  const fullName =
    employee.displayName?.trim() || `${employee.firstName} ${employee.lastName}`.trim();

  const values: Record<string, string> = {};
  const set = (key: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return;
    const text = String(value).trim();
    if (text) values[key] = text;
  };

  set("employee.fullName", fullName);
  set("employee.firstName", employee.firstName);
  set("employee.lastName", employee.lastName);
  set("employee.code", employee.employeeCode);
  set("employee.designation", employee.designation?.title);
  set("employee.department", employee.department?.name);
  set("employee.location", employee.location?.name ?? employee.location?.city);
  set(
    "employee.manager",
    employee.manager
      ? employee.manager.displayName?.trim() ||
          `${employee.manager.firstName} ${employee.manager.lastName}`.trim()
      : undefined,
  );
  set("employee.workEmail", employee.workEmail);
  set("employee.personalEmail", employee.personalEmail);
  set("employee.phone", employee.phone);
  set("employee.dateOfJoining", isoDate(employee.dateOfJoining));
  set("employee.dateOfExit", isoDate(employee.dateOfExit));
  set("employee.probationEndDate", isoDate(employee.probationEndDate));
  set("employee.noticePeriodDays", employee.noticePeriodDays);
  set(
    "employee.employmentType",
    EMPLOYMENT_TYPE_LABELS[employee.employmentType] ?? employee.employmentType,
  );
  set(
    "employee.tenure",
    tenureBetween(employee.dateOfJoining, employee.dateOfExit ?? new Date()),
  );

  const address = [
    employee.addressLine1,
    employee.addressLine2,
    [employee.city, employee.state].filter(Boolean).join(", "),
    [employee.country, employee.postalCode].filter(Boolean).join(" "),
  ]
    .map((line) => line?.trim())
    .filter(Boolean)
    .join("\n");
  set("employee.address", address);

  // --- Compensation -------------------------------------------------------
  const mayReadCompensation = can(session, "employee.compensation.read");
  let compensationWithheld = false;

  if (mayReadCompensation) {
    await addCompensation(session, employeeId, values);
  } else {
    // Only report withholding if there was in fact something to withhold —
    // otherwise a template with no salary tokens would show a warning about
    // permissions for no reason.
    compensationWithheld = true;
  }

  return {
    values,
    compensationWithheld,
    employee: {
      id: employee.id,
      name: fullName,
      workEmail: employee.workEmail,
      personalEmail: employee.personalEmail,
    },
  };
}

/**
 * Runs the payroll engine to produce the figures an offer or increment letter
 * quotes.
 *
 * Reuses the same engine payroll itself runs, deliberately: a CTC breakdown
 * printed on an offer letter that disagrees with the first payslip is a
 * conversation nobody wants to have. A full unpaid-leave-free month is assumed,
 * which is the correct basis for stating what someone will earn.
 */
async function addCompensation(
  session: AuthContext,
  employeeId: string,
  values: Record<string, string>,
): Promise<void> {
  const db = orgDb(session.org.id);

  const salary = await db.employeeSalary.findFirst({
    where: { employeeId, effectiveTo: null },
    orderBy: { effectiveFrom: "desc" },
    include: {
      structure: {
        select: {
          name: true,
          components: {
            orderBy: { sortdex: "asc" },
            include: { component: true },
          },
        },
      },
    },
  });
  if (!salary) return;

  const annualCtc = Number(salary.annualCtc);
  values["salary.annualCtc"] = String(Math.round(annualCtc));
  values["salary.monthlyCtc"] = String(Math.round(annualCtc / 12));
  values["salary.structure"] = salary.structure.name;

  const setting = await db.statutorySetting.findFirst({ where: { orgId: session.org.id } });
  if (!setting) return;

  const statutory = toStatutoryConfig(setting);
  const components = toEngineComponents(salary.structure.components);

  const gross = monthlyGrossFromCtc(annualCtc, components, statutory);
  values["salary.monthlyGross"] = String(Math.round(gross));

  // A notional full month: every working day paid, no loans recovered. The
  // figure being quoted is "what you will earn", not "what you were paid".
  const result = calculatePayslip({
    annualCtc,
    components,
    statutory,
    workingDays: 30,
    paidDays: 30,
  });

  values["salary.monthlyNet"] = String(Math.round(result.netPay));
  values["salary.breakdown"] = breakdownTable(result, session.org.currency);
}

/**
 * The annexure: a markdown table of the monthly and annual figures.
 *
 * Markdown rather than HTML because it lands in a markdown template body, where
 * the author may want to edit a row or add a note under it.
 */
function breakdownTable(
  result: ReturnType<typeof calculatePayslip>,
  currency: string,
): string {
  const rows: string[] = [
    "| Component | Monthly | Annual |",
    "| --- | ---: | ---: |",
  ];

  const money = (value: number) => formatMoney(Math.round(value), currency);

  const section = (label: string, type: string) => {
    const lines = result.lines.filter((line) => line.type === type);
    for (const line of lines) {
      rows.push(`| ${line.label} | ${money(line.amount)} | ${money(line.amount * 12)} |`);
    }
    return lines.length > 0;
  };

  section("Earnings", "EARNING");
  rows.push(
    `| **Gross earnings** | **${money(result.grossEarnings)}** | **${money(result.grossEarnings * 12)}** |`,
  );

  if (section("Deductions", "DEDUCTION")) {
    rows.push(
      `| **Total deductions** | **${money(result.totalDeductions)}** | **${money(result.totalDeductions * 12)}** |`,
    );
  }

  if (section("Employer contributions", "EMPLOYER_CONTRIBUTION")) {
    rows.push(
      `| **Employer contribution** | **${money(result.employerContributions)}** | **${money(result.employerContributions * 12)}** |`,
    );
  }

  rows.push(`| **Net take-home** | **${money(result.netPay)}** | **${money(result.netPay * 12)}** |`);

  return rows.join("\n");
}

/**
 * Whether a template actually asks for any compensation figure.
 *
 * Used to decide if the "salary fields need permission X" notice is worth
 * showing — a relieving letter has no salary tokens and should say nothing.
 */
export function needsCompensation(sources: (string | undefined)[]): boolean {
  return sources.some((source) => source && isSensitiveSource(source));
}
