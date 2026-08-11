import "server-only";

import { generateJson } from "@/lib/ai/gemini";
import {
  AUTOFILL_SOURCES,
  LETTER_KINDS,
  type LetterVariable,
  type VariableType,
} from "./types";
import { humanise, reconcile } from "./variables";

/**
 * Turning "I need a relieving letter that mentions the notice period served"
 * into a template.
 *
 * The model's job here is narrow and it is worth being precise about what it
 * is: produce the *template*, with tokens left unfilled. It never sees an
 * employee's name, salary or any other personal data — the brief is written by
 * an admin describing a document, and substitution happens later, locally.
 * That keeps the feature useful without exporting the HR database to a third
 * party, which is the property a self-hosted HR system has to preserve.
 *
 * The output is constrained by a response schema rather than parsed out of
 * prose, and everything that comes back is re-validated here: a model that
 * invents a variable type or an autofill key must not be able to write a
 * malformed row into the database.
 */

export interface DraftedTemplate {
  name: string;
  kind: string;
  subject: string;
  body: string;
  variables: LetterVariable[];
}

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    kind: { type: "STRING", enum: LETTER_KINDS.map((k) => k.value) },
    subject: { type: "STRING" },
    body: { type: "STRING" },
    variables: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          key: { type: "STRING" },
          label: { type: "STRING" },
          type: {
            type: "STRING",
            enum: ["text", "longtext", "number", "money", "date", "email"],
          },
          required: { type: "BOOLEAN" },
          source: { type: "STRING" },
          helpText: { type: "STRING" },
        },
        required: ["key", "label", "type", "required"],
      },
    },
  },
  required: ["name", "kind", "subject", "body", "variables"],
} as const;

function systemInstruction(orgName: string, currency: string): string {
  const catalogue = AUTOFILL_SOURCES.map(
    (s) => `  ${s.key} — ${s.label} (${s.type})${s.description ? `. ${s.description}` : ""}`,
  ).join("\n");

  return `You write HR letter templates for ${orgName}, an organisation using an HRMS called OpenHRM. You are producing a REUSABLE TEMPLATE, not a letter for a specific person.

OUTPUT FORMAT
The body is Markdown. Supported: # headings, **bold**, *italic*, - bullet lists, 1. numbered lists, | pipe | tables |, --- rules, [links](https://example.com). Nothing else — no HTML, no images, no code fences around the body.

PLACEHOLDERS
Every detail that changes per person is a {{token}} in double curly braces. Token names are camelCase. Never write a real name, a real salary figure or a real date into the body — always a token.

Do NOT create tokens for these; the system fills them into the letterhead and signature block automatically, and repeating them in the body is duplication:
  the company name, the company address, the letter date, the reference number, the signatory's name and title.

AUTOFILL
When a token's value can come from the employee record, set "source" to the matching key below. When it cannot, omit "source" and the user will type it.
${catalogue}

Set "required": true only for tokens the letter is meaningless without.

STYLE
- Formal Indian corporate register unless the brief says otherwise. Currency is ${currency}.
- Structure the letter properly: subject line, salutation, body paragraphs, closing. Do not include the letterhead or the signature block — the system renders both.
- Use a markdown table for any salary or settlement breakdown.
- Where a real letter would carry a legal clause the organisation must review (non-compete, indemnity, garden leave), include it but keep it plain and short.
- Never invent statutory obligations, notice periods or amounts. If the brief does not specify one, make it a token.

Return only the JSON object described by the schema.`;
}

/** Valid autofill keys, so a hallucinated source is dropped rather than stored. */
const VALID_SOURCES = new Set(AUTOFILL_SOURCES.map((s) => s.key));
const VALID_TYPES = new Set<VariableType>([
  "text",
  "longtext",
  "number",
  "money",
  "date",
  "email",
]);
const VALID_KINDS = new Set<string>(LETTER_KINDS.map((k) => k.value));

interface RawDraft {
  name?: unknown;
  kind?: unknown;
  subject?: unknown;
  body?: unknown;
  variables?: unknown;
}

export async function draftTemplate(params: {
  brief: string;
  orgName: string;
  currency: string;
  /** Refining an existing template rather than starting from nothing. */
  existingBody?: string;
}): Promise<DraftedTemplate> {
  const prompt = params.existingBody
    ? `Here is an existing template body:\n\n---\n${params.existingBody}\n---\n\nRevise it as follows: ${params.brief}\n\nKeep the tokens that still apply and preserve their names.`
    : `Write a letter template for this request: ${params.brief}`;

  const raw = await generateJson<RawDraft>({
    systemInstruction: systemInstruction(params.orgName, params.currency),
    prompt,
    responseSchema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
    temperature: 0.5,
    maxOutputTokens: 6144,
  });

  const body = typeof raw.body === "string" ? stripFence(raw.body).trim() : "";
  if (!body) {
    throw new Error("The AI did not return a letter body. Try again with a more specific brief.");
  }

  const subject =
    typeof raw.subject === "string" && raw.subject.trim()
      ? raw.subject.trim().slice(0, 200)
      : "Letter";

  const declared = parseDraftedVariables(raw.variables);

  return {
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim().slice(0, 120)
        : "Untitled template",
    kind: typeof raw.kind === "string" && VALID_KINDS.has(raw.kind) ? raw.kind : "custom",
    subject,
    body,
    // The body is authoritative about which variables exist. Reconciling here
    // adds anything the model used but forgot to declare, and drops anything it
    // declared but never referenced — either of which would otherwise show up
    // as a broken field on the generate form.
    variables: reconcile(body, subject, declared),
  };
}

/** Occasionally the body arrives wrapped in a fence despite the instruction. */
function stripFence(value: string): string {
  return value
    .replace(/^```(?:markdown|md)?\s*\n?/i, "")
    .replace(/\n?```\s*$/, "");
}

function parseDraftedVariables(value: unknown): LetterVariable[] {
  if (!Array.isArray(value)) return [];

  const output: LetterVariable[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;

    // Tokens are matched against the body by exact name, so anything that could
    // not appear as `{{key}}` is unusable.
    if (typeof row.key !== "string" || !/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(row.key)) continue;
    if (seen.has(row.key)) continue;
    seen.add(row.key);

    const source =
      typeof row.source === "string" && VALID_SOURCES.has(row.source) ? row.source : undefined;

    output.push({
      key: row.key,
      label:
        typeof row.label === "string" && row.label.trim()
          ? row.label.trim().slice(0, 80)
          : humanise(row.key),
      type: VALID_TYPES.has(row.type as VariableType) ? (row.type as VariableType) : "text",
      required: row.required === true,
      source,
      helpText:
        typeof row.helpText === "string" && row.helpText.trim()
          ? row.helpText.trim().slice(0, 200)
          : undefined,
    });
  }

  return output;
}
