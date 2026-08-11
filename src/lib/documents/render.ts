/**
 * Turning a filled-in template into the finished document.
 *
 * The output is a single HTML fragment with **every style inline**. That is not
 * an aesthetic choice — it is what makes one artifact serve all three
 * destinations this feature has:
 *
 *   - the on-screen preview, rendered as-is;
 *   - the browser's print-to-PDF, which honours the same inline rules;
 *   - the outbound email, where a `<style>` block is stripped by Outlook and
 *     rewritten by Gmail, and only inline attributes survive intact.
 *
 * It is also why the fragment is stored in `generated_letters.renderedHtml`
 * rather than re-rendered on demand: a document that is emailed, printed and
 * archived must be the same document in all three places, next year as well as
 * today.
 */

import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { renderMarkdown } from "./markdown";
import type { LetterVariable, VariableValues } from "./types";

// ---------------------------------------------------------------------------
// Value formatting
// ---------------------------------------------------------------------------

/**
 * Renders one variable's stored value the way it should read in a letter.
 *
 * Values are stored raw — `"1200000"`, `"2026-04-01"` — so they stay editable
 * and re-parseable. Presentation happens here, once, at render time.
 */
export function formatValue(
  variable: LetterVariable,
  raw: string,
  currency: string,
): string {
  const value = (raw ?? "").trim();
  if (!value) return "";

  if (variable.type === "money") {
    const amount = Number(value.replace(/[^0-9.-]/g, ""));
    // A figure that will not parse is shown as typed rather than as ₹0 — a
    // wrong number in a salary letter must never be invented by the renderer.
    return Number.isFinite(amount) && value !== "" ? formatMoney(amount, currency) : value;
  }

  if (variable.type === "date") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : formatDate(parsed);
  }

  if (variable.type === "number") {
    const amount = Number(value);
    return Number.isFinite(amount) ? new Intl.NumberFormat("en-IN").format(amount) : value;
  }

  return value;
}

/** Every declared variable, formatted, ready for token substitution. */
export function formatValues(
  variables: LetterVariable[],
  values: VariableValues,
  currency: string,
): VariableValues {
  const output: VariableValues = {};
  for (const variable of variables) {
    output[variable.key] = formatValue(variable, values[variable.key] ?? "", currency);
  }
  return output;
}

// ---------------------------------------------------------------------------
// Inline styling
// ---------------------------------------------------------------------------

/**
 * The base style for each tag the markdown renderer can emit.
 *
 * Sizes are in points rather than pixels because the primary destination is a
 * printed page, and colours are hex rather than the app's OKLCH tokens because
 * mail clients do not support custom properties.
 */
const TAG_STYLES: Record<string, string> = {
  p: "margin:0 0 11pt;line-height:1.65",
  h1: "margin:0 0 12pt;font-size:15pt;font-weight:600;letter-spacing:-0.01em",
  h2: "margin:16pt 0 8pt;font-size:12.5pt;font-weight:600",
  h3: "margin:14pt 0 6pt;font-size:11pt;font-weight:600",
  h4: "margin:12pt 0 6pt;font-size:10.5pt;font-weight:600",
  h5: "margin:12pt 0 6pt;font-size:10pt;font-weight:600",
  h6: "margin:12pt 0 6pt;font-size:10pt;font-weight:600",
  ul: "margin:0 0 11pt;padding-left:18pt",
  ol: "margin:0 0 11pt;padding-left:18pt",
  li: "margin:0 0 5pt;line-height:1.6",
  table: "width:100%;border-collapse:collapse;margin:0 0 14pt;font-size:9.5pt",
  th: "border:1px solid #d4d4d8;padding:6pt 8pt;background:#f4f4f5;text-align:left;font-weight:600",
  td: "border:1px solid #d4d4d8;padding:6pt 8pt",
  blockquote:
    "margin:0 0 11pt;padding:0 0 0 12pt;border-left:2px solid #e4e4e7;color:#52525b",
  hr: "border:0;border-top:1px solid #e4e4e7;margin:16pt 0",
  a: "color:#1d4ed8;text-decoration:underline",
  code: "font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9pt;background:#f4f4f5;padding:1pt 3pt;border-radius:2pt",
};

/**
 * Adds the base style to every known tag, merging rather than replacing.
 *
 * Table cells already carry a `text-align` from the markdown alignment row, so
 * clobbering the attribute would silently drop right-aligned salary columns.
 * The base rules go first and the existing declaration last, so the specific
 * one wins on conflict.
 */
function inlineStyles(html: string): string {
  return html.replace(
    /<(p|h[1-6]|ul|ol|li|table|th|td|blockquote|hr|a|code)(\s[^>]*)?>/g,
    (_match, tag: string, attrs: string | undefined) => {
      const base = TAG_STYLES[tag];
      if (!base) return _match;

      const rest = attrs ?? "";
      const existing = rest.match(/\sstyle="([^"]*)"/);

      if (existing) {
        const merged = `${base};${existing[1]}`;
        return `<${tag}${rest.replace(existing[0], ` style="${merged}"`)}>`;
      }

      return `<${tag}${rest} style="${base}">`;
    },
  );
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export interface Letterhead {
  orgName: string;
  /** A `data:` URI. Absent orgs simply print without a logo. */
  logoUrl?: string | null;
  address?: string | null;
  website?: string | null;
  email?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
}

export interface LetterDocument {
  letterhead: Letterhead;
  /** Markdown with tokens already substituted. */
  body: string;
  letterNumber?: string | null;
  issuedAt: Date;
  /** Printed under the signature so the reader knows who to reply to. */
  showSignature?: boolean;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Multi-line plain text (an address) as escaped HTML with breaks. */
function multiline(value: string): string {
  return value
    .split("\n")
    .map((line) => escapeText(line.trim()))
    .filter(Boolean)
    .join("<br />");
}

const PAGE =
  "max-width:180mm;margin:0 auto;padding:0;background:#ffffff;color:#18181b;" +
  "font-family:Georgia,'Times New Roman',serif;font-size:10.5pt;line-height:1.65";

/**
 * The finished letter: letterhead, reference line, body, signature block.
 *
 * Returns a fragment rather than a whole page so it can be dropped into the
 * preview, the print view and the email body without three near-identical
 * copies of the same markup.
 */
export function renderLetterDocument(doc: LetterDocument): string {
  const { letterhead: head } = doc;
  const parts: string[] = [];

  parts.push(`<div style="${PAGE}">`);

  // --- Letterhead ---------------------------------------------------------
  parts.push(
    `<table style="width:100%;border-collapse:collapse;margin:0 0 20pt"><tr>` +
      `<td style="vertical-align:top;padding:0">` +
      (head.logoUrl
        ? `<img src="${escapeAttr(head.logoUrl)}" alt="" style="max-height:52px;max-width:200px;display:block;margin:0 0 6pt" />`
        : "") +
      `<div style="font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;font-size:13pt;font-weight:700;letter-spacing:-0.01em">${escapeText(head.orgName)}</div>` +
      `</td>` +
      `<td style="vertical-align:top;padding:0;text-align:right;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;font-size:8.5pt;line-height:1.5;color:#52525b">` +
      (head.address ? `<div>${multiline(head.address)}</div>` : "") +
      (head.website ? `<div>${escapeText(head.website)}</div>` : "") +
      (head.email ? `<div>${escapeText(head.email)}</div>` : "") +
      `</td>` +
      `</tr></table>`,
  );

  parts.push(`<hr style="border:0;border-top:1.5px solid #18181b;margin:0 0 16pt" />`);

  // --- Reference and date -------------------------------------------------
  parts.push(
    `<table style="width:100%;border-collapse:collapse;margin:0 0 18pt;font-family:ui-sans-serif,system-ui,'Segoe UI',sans-serif;font-size:9pt;color:#52525b"><tr>` +
      `<td style="padding:0">${doc.letterNumber ? `Ref: ${escapeText(doc.letterNumber)}` : ""}</td>` +
      `<td style="padding:0;text-align:right">${escapeText(formatDate(doc.issuedAt))}</td>` +
      `</tr></table>`,
  );

  // --- Body ---------------------------------------------------------------
  parts.push(`<div>${inlineStyles(renderMarkdown(doc.body))}</div>`);

  // --- Signature ----------------------------------------------------------
  if (doc.showSignature !== false && (head.signatoryName || head.signatoryTitle)) {
    parts.push(
      `<div style="margin:28pt 0 0;page-break-inside:avoid">` +
        `<div style="height:34pt"></div>` +
        `<div style="border-top:1px solid #18181b;display:inline-block;min-width:150pt;padding-top:5pt">` +
        (head.signatoryName
          ? `<div style="font-weight:600">${escapeText(head.signatoryName)}</div>`
          : "") +
        (head.signatoryTitle
          ? `<div style="font-size:9pt;color:#52525b">${escapeText(head.signatoryTitle)}</div>`
          : "") +
        `<div style="font-size:9pt;color:#52525b">${escapeText(head.orgName)}</div>` +
        `</div></div>`,
    );
  }

  parts.push(`</div>`);

  return parts.join("\n");
}

/**
 * A standalone HTML page wrapping the document, for the print view.
 *
 * The `@page` rule is what turns Ctrl+P into a correctly margined A4 document
 * rather than a screenshot of a web page, and it is the reason this feature
 * needs no PDF library: every browser already ships one.
 */
export function renderPrintablePage(title: string, documentHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeText(title)}</title>
<style>
  @page { size: A4; margin: 20mm 18mm; }
  html, body { margin: 0; padding: 0; background: #f4f4f5; }
  .sheet { background: #fff; margin: 24px auto; padding: 20mm 18mm; max-width: 210mm; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  @media print {
    html, body { background: #fff; }
    .sheet { margin: 0; padding: 0; max-width: none; box-shadow: none; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
<div class="sheet">${documentHtml}</div>
</body>
</html>`;
}
