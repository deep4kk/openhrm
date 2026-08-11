/**
 * The document module's vocabulary.
 *
 * A *template* is written once — "Offer Letter (India)" — and holds markdown
 * with `{{token}}` placeholders plus a typed description of what each token
 * means. A *letter* is that template with the tokens filled in for one person,
 * frozen at the moment it was issued.
 *
 * The typed variable list is what makes the generate screen more than a wall of
 * text boxes: a `date` renders a date picker, a `money` is formatted in the
 * organisation's currency, and a variable carrying a `source` is filled in from
 * the employee record before the user sees the form.
 */

/** Letter kinds we ship starter templates and sensible defaults for. */
export const LETTER_KINDS = [
  { value: "offer", label: "Offer letter" },
  { value: "appointment", label: "Appointment letter" },
  { value: "confirmation", label: "Confirmation letter" },
  { value: "increment", label: "Increment letter" },
  { value: "promotion", label: "Promotion letter" },
  { value: "warning", label: "Warning letter" },
  { value: "experience", label: "Experience letter" },
  { value: "relieving", label: "Relieving letter" },
  { value: "fnf", label: "Full & final settlement" },
  { value: "custom", label: "Other" },
] as const;

export type LetterKind = (typeof LETTER_KINDS)[number]["value"];

export function letterKindLabel(kind: string): string {
  return LETTER_KINDS.find((k) => k.value === kind)?.label ?? "Other";
}

/**
 * How a variable is captured and rendered.
 *
 * `money` is separate from `number` because it is formatted in the
 * organisation's currency and because "12,00,000" typed with separators has to
 * survive being parsed back.
 */
export const VARIABLE_TYPES = [
  { value: "text", label: "Short text" },
  { value: "longtext", label: "Paragraph" },
  { value: "number", label: "Number" },
  { value: "money", label: "Amount" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
] as const;

export type VariableType = (typeof VARIABLE_TYPES)[number]["value"];

export interface LetterVariable {
  /** The token name. `{{salaryAnnual}}` in the body is key `salaryAnnual`. */
  key: string;
  label: string;
  type: VariableType;
  required: boolean;
  /**
   * Where the value comes from when an employee is picked. A key from
   * AUTOFILL_SOURCES, or absent for "the user types it every time".
   *
   * A prefilled value is always still editable — a back-dated experience letter
   * may need the designation the person held then, not the one on record now.
   */
  source?: string;
  defaultValue?: string;
  helpText?: string;
}

/**
 * What the system can fill in by itself once an employee is chosen.
 *
 * `sensitive` marks the sources that read compensation. Those are resolved only
 * for a user holding `employee.compensation.read` — everyone else gets a blank
 * field to type into rather than a refusal, because an HR coordinator without
 * salary access should still be able to raise an experience letter.
 */
export interface AutofillSource {
  key: string;
  label: string;
  type: VariableType;
  group: "Employee" | "Compensation" | "Organisation" | "Letter";
  sensitive?: boolean;
  description?: string;
}

export const AUTOFILL_SOURCES: AutofillSource[] = [
  // --- Employee -----------------------------------------------------------
  { key: "employee.fullName", label: "Full name", type: "text", group: "Employee" },
  { key: "employee.firstName", label: "First name", type: "text", group: "Employee" },
  { key: "employee.lastName", label: "Last name", type: "text", group: "Employee" },
  { key: "employee.code", label: "Employee code", type: "text", group: "Employee" },
  { key: "employee.designation", label: "Designation", type: "text", group: "Employee" },
  { key: "employee.department", label: "Department", type: "text", group: "Employee" },
  { key: "employee.location", label: "Work location", type: "text", group: "Employee" },
  { key: "employee.manager", label: "Reporting manager", type: "text", group: "Employee" },
  { key: "employee.workEmail", label: "Work email", type: "email", group: "Employee" },
  { key: "employee.personalEmail", label: "Personal email", type: "email", group: "Employee" },
  { key: "employee.phone", label: "Phone", type: "text", group: "Employee" },
  { key: "employee.address", label: "Postal address", type: "longtext", group: "Employee" },
  { key: "employee.dateOfJoining", label: "Date of joining", type: "date", group: "Employee" },
  { key: "employee.dateOfExit", label: "Last working day", type: "date", group: "Employee" },
  {
    key: "employee.probationEndDate",
    label: "Probation end date",
    type: "date",
    group: "Employee",
  },
  {
    key: "employee.noticePeriodDays",
    label: "Notice period (days)",
    type: "number",
    group: "Employee",
  },
  {
    key: "employee.employmentType",
    label: "Employment type",
    type: "text",
    group: "Employee",
    description: "Full-time, contract, intern…",
  },
  {
    key: "employee.tenure",
    label: "Tenure",
    type: "text",
    group: "Employee",
    description: "Joining date to exit date in years and months — for experience letters.",
  },

  // --- Compensation -------------------------------------------------------
  {
    key: "salary.annualCtc",
    label: "Annual CTC",
    type: "money",
    group: "Compensation",
    sensitive: true,
  },
  {
    key: "salary.monthlyCtc",
    label: "Monthly CTC",
    type: "money",
    group: "Compensation",
    sensitive: true,
  },
  {
    key: "salary.monthlyGross",
    label: "Monthly gross",
    type: "money",
    group: "Compensation",
    sensitive: true,
    description: "CTC less the employer's own statutory contributions.",
  },
  {
    key: "salary.monthlyNet",
    label: "Monthly take-home",
    type: "money",
    group: "Compensation",
    sensitive: true,
    description: "After employee PF, ESI and professional tax.",
  },
  {
    key: "salary.structure",
    label: "Salary structure name",
    type: "text",
    group: "Compensation",
    sensitive: true,
  },
  {
    key: "salary.breakdown",
    label: "Salary breakdown table",
    type: "longtext",
    group: "Compensation",
    sensitive: true,
    description:
      "A full markdown table of earnings, deductions and employer contributions — the annexure an offer letter needs.",
  },

  // --- Organisation and letter (always resolved, never typed) -------------
  { key: "org.name", label: "Organisation name", type: "text", group: "Organisation" },
  { key: "org.address", label: "Registered address", type: "longtext", group: "Organisation" },
  { key: "org.website", label: "Website", type: "text", group: "Organisation" },
  { key: "org.email", label: "Support email", type: "email", group: "Organisation" },
  { key: "org.signatoryName", label: "Signatory name", type: "text", group: "Organisation" },
  { key: "org.signatoryTitle", label: "Signatory title", type: "text", group: "Organisation" },
  { key: "letter.date", label: "Letter date", type: "date", group: "Letter" },
  { key: "letter.number", label: "Reference number", type: "text", group: "Letter" },
  { key: "letter.recipientName", label: "Recipient name", type: "text", group: "Letter" },
];

export const AUTOFILL_BY_KEY = new Map(AUTOFILL_SOURCES.map((s) => [s.key, s]));

/**
 * Sources the app resolves on its own at render time. They are never shown as
 * form inputs — nobody should be retyping their own company's address on every
 * letter, and a reference number the user can edit is not a reference number.
 */
export const SYSTEM_SOURCE_PREFIXES = ["org.", "letter."];

export function isSystemSource(key: string): boolean {
  return SYSTEM_SOURCE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

export function isSensitiveSource(key: string): boolean {
  return AUTOFILL_BY_KEY.get(key)?.sensitive === true;
}

/** The values a letter is rendered against: token name -> resolved string. */
export type VariableValues = Record<string, string>;
