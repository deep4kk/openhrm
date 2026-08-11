/**
 * The mail-merge engine.
 *
 * Templates carry `{{tokens}}`; generation swaps in values. The interesting
 * part is not the substitution — it is keeping the *typed* variable list in
 * step with a body the user is freely editing. Someone who types
 * `{{noticePeriod}}` into a paragraph expects a Notice period field to appear
 * on the generate screen without visiting a separate settings panel, and
 * someone who deletes that paragraph expects the field to go away.
 *
 * So the body is the source of truth for *which* variables exist, and the
 * stored list is the source of truth for what each one *means*. `reconcile()`
 * is where the two are merged.
 */

import {
  AUTOFILL_BY_KEY,
  isSystemSource,
  type LetterVariable,
  type VariableType,
  type VariableValues,
} from "./types";

/** `{{ key }}` — dots allowed so autofill keys can be written inline. */
const TOKEN = /\{\{\s*([a-zA-Z][a-zA-Z0-9_.]*)\s*\}\}/g;

/** Every distinct token in the given text, in the order they first appear. */
export function extractTokens(...sources: string[]): string[] {
  const seen = new Set<string>();
  for (const source of sources) {
    for (const match of source.matchAll(TOKEN)) {
      seen.add(match[1]);
    }
  }
  return [...seen];
}

/**
 * Replaces tokens with their values.
 *
 * A known variable with no value becomes an empty string — an optional clause
 * that was left blank should not print as `{{bonus}}`. A token with no
 * definition at all is left untouched on purpose: it is almost always a typo,
 * and it is far better for the author to see `{{empolyeeName}}` staring back
 * from the preview than to have it silently vanish from an offer letter.
 */
export function applyVariables(
  source: string,
  values: VariableValues,
  known: Set<string>,
): string {
  return source.replace(TOKEN, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(values, key)) return values[key] ?? "";
    if (known.has(key)) return "";
    return match;
  });
}

/** Tokens present in the body that have no value and no definition. */
export function unresolvedTokens(
  source: string,
  values: VariableValues,
  known: Set<string>,
): string[] {
  return extractTokens(source).filter(
    (key) => !known.has(key) && !Object.prototype.hasOwnProperty.call(values, key),
  );
}

/**
 * Turns `dateOfJoining` into "Date of joining" — good enough that an author
 * rarely has to retype the label, which is the point.
 */
export function humanise(key: string): string {
  const words = key
    .replace(/^.*\./, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim()
    .toLowerCase();

  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Type guess from the token's name, used when a variable first appears. */
function inferType(key: string): VariableType {
  const name = key.toLowerCase();
  if (/(^|[^a-z])(date|dob|day|from|till|until|deadline)([^a-z]|$)/.test(name)) return "date";
  if (name.endsWith("date") || name.startsWith("date")) return "date";
  if (/(salary|ctc|amount|pay|gross|net|bonus|stipend|wage|settlement|cost)/.test(name)) {
    return "money";
  }
  if (/(count|days|months|years|number|qty|quantity|percent)/.test(name)) return "number";
  if (name.includes("email")) return "email";
  if (/(address|reason|remarks|notes|description|summary|terms|breakdown)/.test(name)) {
    return "longtext";
  }
  return "text";
}

/** A sensible first definition for a token nobody has described yet. */
export function inferVariable(key: string): LetterVariable {
  // A token written as a full autofill key — `{{employee.fullName}}` — carries
  // its own meaning, so adopt the catalogue's label and type wholesale.
  const source = AUTOFILL_BY_KEY.get(key);
  if (source) {
    return {
      key,
      label: source.label,
      type: source.type,
      required: false,
      source: source.key,
    };
  }

  return {
    key,
    label: humanise(key),
    type: inferType(key),
    required: true,
  };
}

/**
 * Merges the tokens actually used with the definitions already stored.
 *
 * Definitions are kept for tokens still in the body, created for new ones, and
 * dropped for tokens no longer referenced anywhere — a variable that appears in
 * no text has nothing to fill in. Order follows the body so the generate form
 * reads in the same sequence as the letter.
 */
export function reconcile(
  body: string,
  subject: string,
  existing: LetterVariable[],
): LetterVariable[] {
  const byKey = new Map(existing.map((v) => [v.key, v]));
  return extractTokens(subject, body).map((key) => byKey.get(key) ?? inferVariable(key));
}

/**
 * Whether the app resolves this variable by itself.
 *
 * `{{org.name}}` and `{{letter.number}}` are facts about the issuing company
 * and the document, not answers a user gives. They still have to be *known*, so
 * `reconcile` keeps returning them and substitution fills them in — but showing
 * them as form fields would invite someone to type a different company name
 * onto a letter, and an editable reference number is not a reference number.
 */
export function isAutomatic(variable: LetterVariable): boolean {
  return isSystemSource(variable.key) || (!!variable.source && isSystemSource(variable.source));
}

/** The subset a human actually fills in. What the generate form renders. */
export function formVariables(variables: LetterVariable[]): LetterVariable[] {
  return variables.filter((variable) => !isAutomatic(variable));
}

/** Required variables with nothing filled in. Blocks generation. */
export function missingRequired(
  variables: LetterVariable[],
  values: VariableValues,
): LetterVariable[] {
  return variables.filter(
    (variable) => variable.required && !(values[variable.key] ?? "").trim(),
  );
}

/**
 * Parses the `variables` JSON column back into typed definitions.
 *
 * Defensive because the column is `Json`: a hand-edited row, or a template
 * written by an older version of this code, must not crash the generate screen.
 * Anything unrecognisable is discarded rather than trusted.
 */
export function parseVariables(value: unknown): LetterVariable[] {
  if (!Array.isArray(value)) return [];

  const output: LetterVariable[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.key !== "string" || row.key === "") continue;

    output.push({
      key: row.key,
      label: typeof row.label === "string" && row.label ? row.label : humanise(row.key),
      type: isVariableType(row.type) ? row.type : inferType(row.key),
      required: row.required === true,
      source: typeof row.source === "string" && row.source ? row.source : undefined,
      defaultValue: typeof row.defaultValue === "string" ? row.defaultValue : undefined,
      helpText: typeof row.helpText === "string" ? row.helpText : undefined,
    });
  }

  return output;
}

function isVariableType(value: unknown): value is VariableType {
  return (
    value === "text" ||
    value === "longtext" ||
    value === "number" ||
    value === "money" ||
    value === "date" ||
    value === "email"
  );
}

/** Values as a plain record, dropping anything not declared on the template. */
export function pickDeclared(
  variables: LetterVariable[],
  values: VariableValues,
): VariableValues {
  const output: VariableValues = {};
  for (const variable of variables) {
    output[variable.key] = (values[variable.key] ?? variable.defaultValue ?? "").trim();
  }
  return output;
}
