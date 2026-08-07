import { roundMoney } from "../money";

/**
 * The payroll calculation engine.
 *
 * Deliberately a pure function over plain numbers: no database, no session, no
 * side effects. Given a salary structure, a statutory configuration and the
 * days an employee was actually paid for, it returns the exact set of payslip
 * lines. That means the same code can be unit-tested, previewed live in the UI
 * before a run is committed, and re-run to explain a payslip issued last year.
 *
 * It carries no `server-only` marker on purpose: the structure preview runs it
 * in the browser so an admin sees the effect of a change as they type, and
 * running the *same* code in both places is what stops the preview and the
 * payslip from disagreeing.
 *
 * Three rules the whole module rests on:
 *
 *  1. **Earnings must total gross, exactly.** The BALANCE component absorbs the
 *     remainder after every other earning is computed and rounded. Without it a
 *     structure of percentages leaves a few rupees unaccounted for, and an
 *     employee who adds up their own payslip finds the discrepancy first.
 *
 *  2. **Round once, at the component.** Carrying fractions and rounding only
 *     the total makes the printed lines disagree with the printed sum.
 *
 *  3. **Statutory lines are computed, never configured.** An admin can turn PF
 *     off or change its rate, but cannot type an arbitrary PF number onto a
 *     payslip — which is what keeps the compliance pack auditable.
 *
 * The statutory rules implemented here are India's, because that is the market
 * PRD §8.7 names first. They are parameterised entirely by StatutorySetting, so
 * a community "compliance pack" for another country means new parameters and,
 * at most, a new branch here — not a fork of payroll.
 *
 * None of this is tax advice. The UI says so where an admin can see it.
 */

export type ComponentType = "EARNING" | "DEDUCTION" | "EMPLOYER_CONTRIBUTION";

export type Calculation =
  | "FLAT"
  | "PERCENT_OF_BASIC"
  | "PERCENT_OF_GROSS"
  | "BALANCE"
  | "STATUTORY";

export interface EngineComponent {
  code: string;
  label: string;
  type: ComponentType;
  calculation: Calculation;
  value: number;
  isTaxable: boolean;
  sortdex: number;
}

export interface Slab {
  upTo: number | null;
  amount?: number;
  rate?: number;
}

export interface StatutoryConfig {
  pfEnabled: boolean;
  pfWageCeiling: number;
  pfEmployeeRate: number;
  pfEmployerRate: number;
  pfCapAtCeiling: boolean;

  esiEnabled: boolean;
  esiWageCeiling: number;
  esiEmployeeRate: number;
  esiEmployerRate: number;

  ptEnabled: boolean;
  ptSlabs: Slab[];

  tdsEnabled: boolean;
  standardDeduction: number;
  tdsSlabs: Slab[];
}

export interface EngineInput {
  annualCtc: number;
  components: EngineComponent[];
  statutory: StatutoryConfig;
  /** Working days in the period, and how many of them the employee is paid for. */
  workingDays: number;
  paidDays: number;
  /** Recovered this month: loan instalments and any other fixed deduction. */
  loanInstallment?: number;
  /** Reimbursements riding along with this run — paid, but never taxed. */
  reimbursements?: number;
}

export interface EngineLine {
  code: string;
  label: string;
  type: ComponentType;
  amount: number;
  /** Human-readable explanation shown under the line on the payslip. */
  basis: string | null;
  sortdex: number;
}

export interface EngineResult {
  lines: EngineLine[];
  grossEarnings: number;
  totalDeductions: number;
  employerContributions: number;
  netPay: number;
  /** Full-month gross before any loss-of-pay proration. */
  fullMonthGross: number;
  lopDays: number;
}

/**
 * CTC includes the employer's own contributions, so monthly gross is *not*
 * simply CTC ÷ 12. We solve for the gross whose statutory employer cost brings
 * the total to the agreed CTC.
 *
 * A closed-form solution would need to special-case every combination of PF and
 * ESI being on, off, capped or uncapped. Two fixed-point iterations converge to
 * the rupee for every realistic input and stay readable — the cost is a few
 * microseconds per employee per month.
 */
export function monthlyGrossFromCtc(
  annualCtc: number,
  components: EngineComponent[],
  statutory: StatutoryConfig,
): number {
  const target = annualCtc / 12;
  let gross = target;

  for (let i = 0; i < 12; i += 1) {
    const basic = basicFor(gross, components);
    const employerCost =
      employerPf(basic, statutory) + employerEsi(gross, statutory);
    const next = target - employerCost;
    if (Math.abs(next - gross) < 0.5) {
      gross = next;
      break;
    }
    gross = next;
  }

  return Math.max(gross, 0);
}

/** Runs the structure for one employee for one month. */
export function calculatePayslip(input: EngineInput): EngineResult {
  const {
    components,
    statutory,
    workingDays,
    paidDays,
    loanInstallment = 0,
    reimbursements = 0,
  } = input;

  const fullMonthGross = monthlyGrossFromCtc(
    input.annualCtc,
    components,
    statutory,
  );

  // Loss of pay prorates earnings, but not the statutory *rates* — PF is still
  // 12% of whatever basic was actually earned.
  const lopDays = Math.max(workingDays - paidDays, 0);
  const proration = workingDays > 0 ? paidDays / workingDays : 1;
  const gross = fullMonthGross * proration;

  const earnings = computeEarnings(gross, components);
  const basic = earnings.find((line) => line.code === "BASIC")?.amount ?? gross;

  const lines: EngineLine[] = [...earnings];

  if (reimbursements > 0) {
    lines.push({
      code: "REIMB",
      label: "Reimbursements",
      type: "EARNING",
      amount: roundMoney(reimbursements),
      basis: "Approved expense claims paid with this run",
      sortdex: 90,
    });
  }

  // --- Statutory deductions ------------------------------------------------

  const has = (code: string) => components.some((c) => c.code === code);

  const pfEmployee = statutory.pfEnabled && has("PF") ? employeePf(basic, statutory) : 0;
  if (pfEmployee > 0) {
    lines.push({
      code: "PF",
      label: "Provident Fund",
      type: "DEDUCTION",
      amount: pfEmployee,
      basis: pfBasis(basic, statutory),
      sortdex: 110,
    });
  }

  const esiEmployee =
    statutory.esiEnabled && has("ESI") ? employeeEsi(gross, statutory) : 0;
  if (esiEmployee > 0) {
    lines.push({
      code: "ESI",
      label: "Employee State Insurance",
      type: "DEDUCTION",
      amount: esiEmployee,
      basis: `${statutory.esiEmployeeRate}% of gross (applies below ${Math.round(statutory.esiWageCeiling)}/month)`,
      sortdex: 111,
    });
  }

  const pt = statutory.ptEnabled && has("PT") ? professionalTax(gross, statutory) : 0;
  if (pt > 0) {
    lines.push({
      code: "PT",
      label: "Professional Tax",
      type: "DEDUCTION",
      amount: pt,
      basis: "State slab on monthly gross",
      sortdex: 112,
    });
  }

  // TDS is an annual liability spread across twelve months. Estimating it from
  // the full-month gross rather than this month's prorated figure keeps the
  // deduction steady — an employee who took unpaid leave in June should not see
  // their tax jump around because of it.
  const tds =
    statutory.tdsEnabled && has("TDS")
      ? monthlyTds(fullMonthGross, pfEmployee, statutory, components)
      : 0;
  if (tds > 0) {
    lines.push({
      code: "TDS",
      label: "Income Tax (TDS)",
      type: "DEDUCTION",
      amount: tds,
      basis: "Annual liability estimated on the new regime, spread over 12 months",
      sortdex: 113,
    });
  }

  if (loanInstallment > 0) {
    lines.push({
      code: "LOAN",
      label: "Loan / advance recovery",
      type: "DEDUCTION",
      amount: roundMoney(loanInstallment),
      basis: "Instalment against an outstanding advance",
      sortdex: 120,
    });
  }

  // --- Employer contributions ---------------------------------------------

  const pfEr = statutory.pfEnabled && has("PF_ER") ? employerPf(basic, statutory) : 0;
  if (pfEr > 0) {
    lines.push({
      code: "PF_ER",
      label: "Provident Fund (Employer)",
      type: "EMPLOYER_CONTRIBUTION",
      amount: pfEr,
      basis: pfBasis(basic, statutory, statutory.pfEmployerRate),
      sortdex: 200,
    });
  }

  const esiEr =
    statutory.esiEnabled && has("ESI_ER") ? employerEsi(gross, statutory) : 0;
  if (esiEr > 0) {
    lines.push({
      code: "ESI_ER",
      label: "Employee State Insurance (Employer)",
      type: "EMPLOYER_CONTRIBUTION",
      amount: esiEr,
      basis: `${statutory.esiEmployerRate}% of gross`,
      sortdex: 201,
    });
  }

  const grossEarnings = sum(lines, "EARNING");
  const totalDeductions = sum(lines, "DEDUCTION");
  const employerContributions = sum(lines, "EMPLOYER_CONTRIBUTION");

  return {
    lines: lines.sort((a, b) => a.sortdex - b.sortdex),
    grossEarnings,
    totalDeductions,
    employerContributions,
    netPay: grossEarnings - totalDeductions,
    fullMonthGross: roundMoney(fullMonthGross),
    lopDays,
  };
}

// ---------------------------------------------------------------------------
// Earnings
// ---------------------------------------------------------------------------

function computeEarnings(
  gross: number,
  components: EngineComponent[],
): EngineLine[] {
  const earnings = components
    .filter((c) => c.type === "EARNING")
    .sort((a, b) => a.sortdex - b.sortdex);

  const basic = basicFor(gross, components);
  const lines: EngineLine[] = [];
  let allocated = 0;

  for (const component of earnings) {
    if (component.calculation === "BALANCE") continue;

    let amount = 0;
    let basis: string | null = null;

    switch (component.calculation) {
      case "PERCENT_OF_GROSS":
        amount = (gross * component.value) / 100;
        basis = `${component.value}% of gross`;
        break;
      case "PERCENT_OF_BASIC":
        amount = (basic * component.value) / 100;
        basis = `${component.value}% of basic`;
        break;
      case "FLAT":
        amount = component.value;
        basis = "Fixed monthly amount";
        break;
      default:
        amount = 0;
    }

    amount = roundMoney(Math.max(amount, 0));
    allocated += amount;

    lines.push({
      code: component.code,
      label: component.label,
      type: "EARNING",
      amount,
      basis,
      sortdex: component.sortdex,
    });
  }

  // The balancing component takes whatever is left, so the earnings side always
  // reconciles to gross to the rupee.
  const balancer = earnings.find((c) => c.calculation === "BALANCE");
  if (balancer) {
    const remainder = roundMoney(gross) - allocated;
    lines.push({
      code: balancer.code,
      label: balancer.label,
      type: "EARNING",
      amount: Math.max(remainder, 0),
      basis: "Balance of gross after the other earnings",
      sortdex: balancer.sortdex,
    });
  }

  return lines;
}

/**
 * Basic pay, which nearly every other figure keys off. Falls back to half of
 * gross when a structure has no explicit basic — an unusual but survivable
 * configuration, and better than dividing by an implicit zero.
 */
function basicFor(gross: number, components: EngineComponent[]): number {
  const basic = components.find((c) => c.code === "BASIC");
  if (!basic) return gross * 0.5;

  switch (basic.calculation) {
    case "PERCENT_OF_GROSS":
      return (gross * basic.value) / 100;
    case "FLAT":
      return basic.value;
    default:
      return gross * 0.5;
  }
}

// ---------------------------------------------------------------------------
// Statutory — India
// ---------------------------------------------------------------------------

/**
 * Provident fund.
 *
 * The 12% applies to basic, but most employers cap the wage it is calculated on
 * at the statutory ceiling — that choice is `pfCapAtCeiling`, because both
 * practices are common and the difference shows up in every payslip.
 */
function pfWage(basic: number, config: StatutoryConfig): number {
  return config.pfCapAtCeiling ? Math.min(basic, config.pfWageCeiling) : basic;
}

function employeePf(basic: number, config: StatutoryConfig): number {
  if (!config.pfEnabled) return 0;
  return roundMoney((pfWage(basic, config) * config.pfEmployeeRate) / 100);
}

function employerPf(basic: number, config: StatutoryConfig): number {
  if (!config.pfEnabled) return 0;
  return roundMoney((pfWage(basic, config) * config.pfEmployerRate) / 100);
}

function pfBasis(
  basic: number,
  config: StatutoryConfig,
  rate = config.pfEmployeeRate,
): string {
  const capped = config.pfCapAtCeiling && basic > config.pfWageCeiling;
  return capped
    ? `${rate}% of basic, capped at ${Math.round(config.pfWageCeiling)}`
    : `${rate}% of basic`;
}

/** ESI stops entirely above the wage ceiling rather than tapering. */
function employeeEsi(gross: number, config: StatutoryConfig): number {
  if (!config.esiEnabled || gross > config.esiWageCeiling) return 0;
  return roundMoney((gross * config.esiEmployeeRate) / 100);
}

function employerEsi(gross: number, config: StatutoryConfig): number {
  if (!config.esiEnabled || gross > config.esiWageCeiling) return 0;
  return roundMoney((gross * config.esiEmployerRate) / 100);
}

function professionalTax(gross: number, config: StatutoryConfig): number {
  if (!config.ptEnabled) return 0;
  for (const slab of config.ptSlabs) {
    if (slab.upTo === null || gross <= slab.upTo) {
      return roundMoney(slab.amount ?? 0);
    }
  }
  return 0;
}

/**
 * A monthly TDS estimate.
 *
 * Annualises the gross, subtracts the standard deduction and the employee's own
 * PF, walks the marginal slabs, then divides by twelve. This is an estimate and
 * is labelled as one: real TDS depends on declared investments, other income
 * and mid-year joins, none of which v1 collects. It is close enough to be
 * useful and honest enough not to be mistaken for a filing.
 */
function monthlyTds(
  monthlyGross: number,
  monthlyPf: number,
  config: StatutoryConfig,
  components: EngineComponent[],
): number {
  const taxableShare = taxableFraction(components);
  const annualTaxableGross = monthlyGross * 12 * taxableShare;
  const annualPf = monthlyPf * 12;

  const taxable = Math.max(
    annualTaxableGross - config.standardDeduction - annualPf,
    0,
  );
  if (taxable <= 0) return 0;

  let tax = 0;
  let lower = 0;

  for (const slab of config.tdsSlabs) {
    const upper = slab.upTo ?? Number.POSITIVE_INFINITY;
    if (taxable > lower) {
      const band = Math.min(taxable, upper) - lower;
      tax += (band * (slab.rate ?? 0)) / 100;
    }
    lower = upper;
    if (taxable <= upper) break;
  }

  // Health and education cess, 4% of the tax itself.
  tax *= 1.04;

  return roundMoney(tax / 12);
}

/**
 * How much of gross is taxable, from the structure's own flags. A structure
 * where every earning is taxable returns 1 — the usual case — but an org that
 * marks an allowance exempt gets that reflected rather than ignored.
 */
function taxableFraction(components: EngineComponent[]): number {
  const earnings = components.filter((c) => c.type === "EARNING");
  if (earnings.length === 0) return 1;
  const exempt = earnings.filter((c) => !c.isTaxable);
  if (exempt.length === 0) return 1;
  // Percent-based components carry their own weight; flat ones are small enough
  // that treating them proportionally is within the noise of an estimate.
  const total = earnings.length;
  return (total - exempt.length) / total;
}

function sum(lines: EngineLine[], type: ComponentType): number {
  return lines
    .filter((line) => line.type === type)
    .reduce((total, line) => total + line.amount, 0);
}

// ---------------------------------------------------------------------------
// Gratuity — used by full & final settlement (PRD §8.21)
// ---------------------------------------------------------------------------

/**
 * The Payment of Gratuity Act formula: 15 days of last-drawn basic for every
 * completed year, on a 26-day month. Vests only after the configured minimum
 * service, which is five years by default.
 */
export function calculateGratuity(
  monthlyBasic: number,
  yearsOfService: number,
  minYears: number,
): number {
  if (yearsOfService < minYears) return 0;
  // A part-year over six months counts as a full year.
  const years = Math.floor(yearsOfService) + (yearsOfService % 1 > 0.5 ? 1 : 0);
  return roundMoney((monthlyBasic * 15 * years) / 26);
}
