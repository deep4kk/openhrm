import "server-only";

import type { Prisma } from "@/generated/prisma/client";

/**
 * What a brand-new organisation gets for the Phase 2 and 3 modules.
 *
 * PRD §8.1 sets the standard: signup to a working org in ten minutes, "no
 * manual setup by a developer". A payroll module that opens onto an empty
 * component list, or a helpdesk with no queues, fails that test — the admin has
 * to invent a chart of accounts before they can try the feature.
 *
 * So every module ships with a defensible starting configuration, all of it
 * ordinary editable rows. Nothing here is special-cased in code: an org can
 * rename, re-rate or delete any of it.
 *
 * The India figures are the country the PRD names first. They are data, not
 * logic, precisely so the community can add other countries without touching
 * the payroll engine — and because rates change with every budget.
 */

type Tx = Prisma.TransactionClient;

// ---------------------------------------------------------------------------
// Payroll
// ---------------------------------------------------------------------------

/**
 * A salary structure that adds up.
 *
 * Basic is a share of gross, HRA a share of basic, two small flat allowances,
 * and a special allowance that absorbs whatever is left — which is how Indian
 * structures are actually built, and what makes an arbitrary CTC resolve to
 * exact components without a rounding fudge.
 */
export const DEFAULT_SALARY_COMPONENTS = [
  {
    name: "Basic Salary",
    code: "BASIC",
    type: "EARNING" as const,
    calculation: "PERCENT_OF_GROSS" as const,
    defaultValue: 50,
    description: "Half of gross. Drives PF, gratuity and HRA exemption.",
    sortdex: 1,
  },
  {
    name: "House Rent Allowance",
    code: "HRA",
    type: "EARNING" as const,
    calculation: "PERCENT_OF_BASIC" as const,
    defaultValue: 40,
    description: "40% of basic — the non-metro rate. Metro offices use 50%.",
    sortdex: 2,
  },
  {
    name: "Conveyance Allowance",
    code: "CONV",
    type: "EARNING" as const,
    calculation: "FLAT" as const,
    defaultValue: 1600,
    description: "Fixed monthly travel allowance.",
    sortdex: 3,
  },
  {
    name: "Medical Allowance",
    code: "MED",
    type: "EARNING" as const,
    calculation: "FLAT" as const,
    defaultValue: 1250,
    description: "Fixed monthly medical allowance.",
    sortdex: 4,
  },
  {
    name: "Special Allowance",
    code: "SPL",
    type: "EARNING" as const,
    calculation: "BALANCE" as const,
    defaultValue: 0,
    description:
      "Absorbs the remainder, so earnings always total gross exactly.",
    sortdex: 5,
  },
  {
    name: "Provident Fund",
    code: "PF",
    type: "DEDUCTION" as const,
    calculation: "STATUTORY" as const,
    defaultValue: 0,
    isStatutory: true,
    isTaxable: false,
    description: "Employee share, computed by the compliance pack.",
    sortdex: 10,
  },
  {
    name: "Employee State Insurance",
    code: "ESI",
    type: "DEDUCTION" as const,
    calculation: "STATUTORY" as const,
    defaultValue: 0,
    isStatutory: true,
    isTaxable: false,
    description: "Applies only below the ESI wage ceiling.",
    sortdex: 11,
  },
  {
    name: "Professional Tax",
    code: "PT",
    type: "DEDUCTION" as const,
    calculation: "STATUTORY" as const,
    defaultValue: 0,
    isStatutory: true,
    isTaxable: false,
    description: "State levy, taken from the configured slabs.",
    sortdex: 12,
  },
  {
    name: "Income Tax (TDS)",
    code: "TDS",
    type: "DEDUCTION" as const,
    calculation: "STATUTORY" as const,
    defaultValue: 0,
    isStatutory: true,
    isTaxable: false,
    description: "Annual liability estimated from slabs, spread over 12 months.",
    sortdex: 13,
  },
  {
    name: "Provident Fund (Employer)",
    code: "PF_ER",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calculation: "STATUTORY" as const,
    defaultValue: 0,
    isStatutory: true,
    isTaxable: false,
    description: "Employer share. Costs the company, never reduces net pay.",
    sortdex: 20,
  },
  {
    name: "Employee State Insurance (Employer)",
    code: "ESI_ER",
    type: "EMPLOYER_CONTRIBUTION" as const,
    calculation: "STATUTORY" as const,
    defaultValue: 0,
    isStatutory: true,
    isTaxable: false,
    description: "Employer share of ESI.",
    sortdex: 21,
  },
];

/**
 * Professional tax, Karnataka's slabs as of the last revision.
 *
 * PT is a *state* levy, so any national default is wrong somewhere. One
 * concrete, clearly-labelled state beats an averaged fiction — an org in
 * Maharashtra edits two numbers, and knows to.
 */
export const DEFAULT_PT_SLABS = [
  { upTo: 24999, amount: 0 },
  { upTo: null, amount: 200 },
];

/** Income-tax slabs, new regime. Annual figures. */
export const DEFAULT_TDS_SLABS = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 5 },
  { upTo: 1200000, rate: 10 },
  { upTo: 1600000, rate: 15 },
  { upTo: 2000000, rate: 20 },
  { upTo: 2400000, rate: 25 },
  { upTo: null, rate: 30 },
];

// ---------------------------------------------------------------------------
// Onboarding & offboarding
// ---------------------------------------------------------------------------

export const DEFAULT_ONBOARDING_TASKS = [
  { title: "Send offer letter and collect signed acceptance", category: "HR", offsetDays: -10 },
  { title: "Collect ID proofs, education and past-employment documents", category: "HR", offsetDays: -5 },
  { title: "Create email account and grant system access", category: "IT", offsetDays: -2 },
  { title: "Prepare laptop, access card and desk", category: "IT", offsetDays: -1 },
  { title: "Welcome and orientation session", category: "HR", offsetDays: 0 },
  { title: "Introduce the team and assign a buddy", category: "Manager", offsetDays: 0 },
  { title: "Add to payroll and share the salary structure", category: "Finance", offsetDays: 1 },
  { title: "Agree first-month goals", category: "Manager", offsetDays: 3 },
  { title: "Assign mandatory compliance training", category: "HR", offsetDays: 3 },
  { title: "Week-one check-in", category: "HR", offsetDays: 7 },
  { title: "30-day check-in", category: "Manager", offsetDays: 30 },
];

export const DEFAULT_OFFBOARDING_TASKS = [
  { title: "Agree a knowledge-transfer plan", category: "Manager", offsetDays: -14 },
  { title: "Hand over projects and client relationships", category: "Manager", offsetDays: -7 },
  { title: "Return laptop, access card and other assets", category: "IT", offsetDays: -1 },
  { title: "Clear outstanding advances and reimbursements", category: "Finance", offsetDays: -1 },
  { title: "Exit interview", category: "HR", offsetDays: 0 },
  { title: "Revoke email and system access", category: "IT", offsetDays: 0 },
  { title: "Collect ID card and sign the clearance form", category: "Admin", offsetDays: 0 },
  { title: "Compute and approve full & final settlement", category: "Finance", offsetDays: 3 },
  { title: "Issue relieving and experience letters", category: "HR", offsetDays: 5 },
];

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Travel", code: "TRAVEL", maxAmount: 50000, requiresReceipt: true },
  { name: "Meals & entertainment", code: "MEALS", maxAmount: 5000, requiresReceipt: true },
  { name: "Accommodation", code: "STAY", maxAmount: 30000, requiresReceipt: true },
  { name: "Internet & phone", code: "COMMS", maxAmount: 2000, requiresReceipt: false },
  { name: "Training & books", code: "LEARN", maxAmount: 25000, requiresReceipt: true },
  { name: "Office supplies", code: "SUPPLY", maxAmount: 10000, requiresReceipt: true },
];

/**
 * SLA hours are deliberately uneven. A blanket 24 hours across every queue is a
 * number nobody believes; "IT access in 8 hours, policy question in 3 days" is
 * a promise a team can actually keep.
 */
export const DEFAULT_TICKET_CATEGORIES = [
  { name: "Payroll & payslips", slaHours: 24, description: "Salary, payslip and tax queries." },
  { name: "Leave & attendance", slaHours: 24, description: "Balances, corrections and approvals." },
  { name: "IT & access", slaHours: 8, description: "Accounts, hardware and software access." },
  { name: "Documents & letters", slaHours: 48, description: "Experience letters, address proofs, verification." },
  { name: "Policy question", slaHours: 72, description: "Anything about how a policy applies." },
  { name: "Something else", slaHours: 72, description: "Route it and we will find the owner." },
];

export const DEFAULT_ASSET_CATEGORIES = [
  { name: "Laptop", depreciationYears: 4 },
  { name: "Monitor", depreciationYears: 5 },
  { name: "Mobile phone", depreciationYears: 3 },
  { name: "Access card", depreciationYears: null },
  { name: "SIM card", depreciationYears: null },
  { name: "Furniture", depreciationYears: 10 },
];

/**
 * Letter templates use {{token}} mail-merge, resolved in src/lib/letters.ts.
 * Written as letters a person would actually be happy to receive — the offer
 * letter is the first thing a new hire reads about the company.
 */
export const DEFAULT_LETTER_TEMPLATES = [
  {
    name: "Offer letter",
    kind: "offer",
    subject: "Offer of employment — {{candidate.fullName}}",
    body: `Dear {{candidate.firstName}},

We are delighted to offer you the position of {{offer.designation}} at {{org.name}}.

Your annual cost to company will be {{offer.annualCtc}}, and we would like you to join us on {{offer.joiningDate}}. A full breakdown of your salary structure is attached to this offer.

This offer is subject to verification of the documents you have shared with us and to the standard background check described in our hiring policy.

Please confirm your acceptance by signing below on or before {{offer.expiresOn}}. If anything here is unclear — or negotiable — reply to this letter and we will talk it through.

We are looking forward to working with you.

{{issuer.name}}
{{org.name}}`,
  },
  {
    name: "Experience letter",
    kind: "experience",
    subject: "Experience certificate — {{employee.fullName}}",
    body: `To whom it may concern,

This is to certify that {{employee.fullName}} ({{employee.employeeCode}}) was employed with {{org.name}} as {{employee.designation}} in the {{employee.department}} team from {{employee.dateOfJoining}} to {{employee.dateOfExit}}.

During this period we found them to be conscientious and capable, and their conduct was found to be satisfactory.

We wish them every success.

{{issuer.name}}
{{org.name}}
Issued on {{today}}`,
  },
  {
    name: "Relieving letter",
    kind: "relieving",
    subject: "Relieving letter — {{employee.fullName}}",
    body: `Dear {{employee.firstName}},

This letter confirms that your resignation has been accepted and that you were relieved from your duties at {{org.name}} at the close of business on {{employee.dateOfExit}}.

All company property issued to you has been returned and your dues have been settled in accordance with our policy.

Thank you for your contribution. We wish you the very best.

{{issuer.name}}
{{org.name}}
Issued on {{today}}`,
  },
  {
    name: "Increment letter",
    kind: "increment",
    subject: "Revision in compensation — {{employee.fullName}}",
    body: `Dear {{employee.firstName}},

Following this year's review, we are pleased to confirm a revision in your compensation.

Your revised annual cost to company will be {{salary.annualCtc}}, effective {{salary.effectiveFrom}}. Your updated salary structure is available in your OpenHRM profile.

This reflects the contribution you have made over the past year, and our confidence in what comes next. Thank you.

{{issuer.name}}
{{org.name}}`,
  },
];

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

/**
 * Creates the Phase 2/3 defaults for one organisation.
 *
 * Runs inside the same transaction that creates the tenant, so a failure here
 * leaves no half-configured org behind. Safe to call again — every write is
 * keyed on a natural unique constraint and skips duplicates, so an existing
 * org that predates a new default picks it up rather than erroring.
 */
export async function provisionModuleDefaults(
  tx: Tx,
  orgId: string,
): Promise<void> {
  await tx.statutorySetting.upsert({
    where: { orgId },
    create: {
      orgId,
      ptSlabs: DEFAULT_PT_SLABS,
      tdsSlabs: DEFAULT_TDS_SLABS,
    },
    update: {},
  });

  await tx.salaryComponent.createMany({
    data: DEFAULT_SALARY_COMPONENTS.map((component) => ({
      orgId,
      name: component.name,
      code: component.code,
      type: component.type,
      calculation: component.calculation,
      defaultValue: component.defaultValue,
      isStatutory: component.isStatutory ?? false,
      isTaxable: component.isTaxable ?? true,
      description: component.description,
      sortdex: component.sortdex,
    })),
    skipDuplicates: true,
  });

  const components = await tx.salaryComponent.findMany({ where: { orgId } });

  const structure = await tx.salaryStructure.upsert({
    where: { orgId_name: { orgId, name: "Standard" } },
    create: {
      orgId,
      name: "Standard",
      description:
        "The default recipe: half of gross as basic, HRA on top, and a special allowance that balances the total.",
      isDefault: true,
    },
    update: {},
  });

  await tx.salaryStructureComponent.createMany({
    data: components.map((component) => ({
      orgId,
      structureId: structure.id,
      componentId: component.id,
      sortdex: component.sortdex,
    })),
    skipDuplicates: true,
  });

  await provisionChecklistTemplate(tx, orgId, {
    name: "New joiner onboarding",
    kind: "ONBOARDING",
    description:
      "Runs from offer acceptance to the 30-day check-in. Dates are offsets from the joining date.",
    items: DEFAULT_ONBOARDING_TASKS,
  });

  await provisionChecklistTemplate(tx, orgId, {
    name: "Exit clearance",
    kind: "OFFBOARDING",
    description:
      "Runs from notice to final settlement. Dates are offsets from the last working day.",
    items: DEFAULT_OFFBOARDING_TASKS,
  });

  await tx.expenseCategory.createMany({
    data: DEFAULT_EXPENSE_CATEGORIES.map((category) => ({
      orgId,
      ...category,
    })),
    skipDuplicates: true,
  });

  await tx.ticketCategory.createMany({
    data: DEFAULT_TICKET_CATEGORIES.map((category) => ({
      orgId,
      ...category,
    })),
    skipDuplicates: true,
  });

  await tx.assetCategory.createMany({
    data: DEFAULT_ASSET_CATEGORIES.map((category) => ({
      orgId,
      ...category,
    })),
    skipDuplicates: true,
  });

  await tx.letterTemplate.createMany({
    data: DEFAULT_LETTER_TEMPLATES.map((template) => ({
      orgId,
      ...template,
    })),
    skipDuplicates: true,
  });
}

async function provisionChecklistTemplate(
  tx: Tx,
  orgId: string,
  input: {
    name: string;
    kind: "ONBOARDING" | "OFFBOARDING";
    description: string;
    items: { title: string; category: string; offsetDays: number }[];
  },
) {
  const existing = await tx.checklistTemplate.findFirst({
    where: { orgId, name: input.name },
    select: { id: true },
  });
  if (existing) return;

  const template = await tx.checklistTemplate.create({
    data: {
      orgId,
      name: input.name,
      kind: input.kind,
      description: input.description,
      isDefault: true,
    },
  });

  await tx.checklistTemplateItem.createMany({
    data: input.items.map((item, index) => ({
      orgId,
      templateId: template.id,
      title: item.title,
      category: item.category,
      offsetDays: item.offsetDays,
      sortdex: index,
    })),
  });
}
