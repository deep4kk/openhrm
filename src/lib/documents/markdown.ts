/**
 * A small markdown renderer, written rather than installed.
 *
 * The template body is markdown because an HR admin can read and edit it, and
 * because it is the format a language model produces most reliably. It needs to
 * become HTML good enough to print as a letter — headings, bold, lists, tables,
 * rules — and nothing more. A general-purpose markdown library would bring a
 * parser, a sanitiser and their transitive dependencies to do the same job, on
 * a project whose whole point is being readable end to end.
 *
 * ## The security shape of this file
 *
 * Everything is escaped *first*, then the markdown transforms insert tags this
 * module wrote itself. That ordering is the entire defence and it is not
 * optional: template bodies carry `{{tokens}}` replaced with values that
 * ultimately come from user input — an employee's name, a typed reason — and
 * the result is rendered with `dangerouslySetInnerHTML` in the preview and
 * mailed out as HTML. Escaping afterwards would mean deciding which `<` was
 * ours and which arrived in a variable, which is exactly the bug class this
 * avoids. There is no path here that emits caller-supplied markup verbatim.
 */

/** HTML-escapes text. Applied to the whole document before anything else. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Only these schemes survive into an `href`. `javascript:` and `data:` are the
 * two that turn a link into script execution, so anything not explicitly listed
 * is dropped and the link renders as plain text.
 */
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|#|\/)/i;

function safeHref(url: string): string | null {
  const trimmed = url.trim();
  return SAFE_URL.test(trimmed) ? trimmed : null;
}

/**
 * Inline formatting, applied to already-escaped text.
 *
 * Order matters: links are consumed before emphasis so that a URL containing
 * underscores is not mangled into italics.
 */
function inline(text: string): string {
  let out = text;

  // `code`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");

  // [label](url) — dropped to plain label when the scheme is not allowed.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, url: string) => {
    const href = safeHref(url);
    return href ? `<a href="${href}">${label}</a>` : label;
  });

  // ***bold italic***, **bold**, then *italic* / _italic_.
  out = out.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*(?![*\w])/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_\w])_([^_\n]+)_(?![_\w])/g, "$1<em>$2</em>");

  return out;
}

const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Column alignment taken from the `:---:` divider row. */
function alignments(divider: string): (string | null)[] {
  return splitRow(divider).map((cell) => {
    const left = cell.startsWith(":");
    const right = cell.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    return null;
  });
}

function renderTable(lines: string[]): string {
  const [headerLine, dividerLine, ...bodyLines] = lines;
  const align = alignments(dividerLine);

  const cell = (content: string, index: number, tag: "th" | "td") => {
    const style = align[index] ? ` style="text-align:${align[index]}"` : "";
    return `<${tag}${style}>${inline(content)}</${tag}>`;
  };

  const head = splitRow(headerLine)
    .map((c, i) => cell(c, i, "th"))
    .join("");

  const body = bodyLines
    .filter((line) => line.trim() !== "")
    .map(
      (line) =>
        `<tr>${splitRow(line)
          .map((c, i) => cell(c, i, "td"))
          .join("")}</tr>`,
    )
    .join("");

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

const UNORDERED_ITEM = /^\s*[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;

function renderList(lines: string[], ordered: boolean): string {
  const pattern = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
  const items = lines
    .map((line) => line.match(pattern)?.[1] ?? "")
    .filter((item) => item !== "")
    .map((item) => `<li>${inline(item)}</li>`)
    .join("");

  return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
}

/**
 * Renders markdown to HTML suitable for a printed letter and for an email body.
 *
 * The input is escaped on the way in, so callers may pass text containing
 * user-supplied values directly.
 */
export function renderMarkdown(source: string): string {
  const escaped = escapeHtml(source.replace(/\r\n/g, "\n"));
  const lines = escaped.split("\n");
  const html: string[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];

    // Blank
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    // Horizontal rule — checked before lists, since `---` matches neither.
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      html.push("<hr />");
      index += 1;
      continue;
    }

    // Heading
    const heading = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      html.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      index += 1;
      continue;
    }

    // Table — a header row followed by a divider row.
    if (line.includes("|") && index + 1 < lines.length && TABLE_DIVIDER.test(lines[index + 1])) {
      const block: string[] = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim() !== "") {
        block.push(lines[index]);
        index += 1;
      }
      html.push(renderTable(block));
      continue;
    }

    // Lists
    const ordered = ORDERED_ITEM.test(line);
    if (ordered || UNORDERED_ITEM.test(line)) {
      const pattern = ordered ? ORDERED_ITEM : UNORDERED_ITEM;
      const block: string[] = [];
      while (index < lines.length && pattern.test(lines[index])) {
        block.push(lines[index]);
        index += 1;
      }
      html.push(renderList(block, ordered));
      continue;
    }

    // Blockquote
    if (/^\s*>\s?/.test(line)) {
      const block: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        block.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${inline(block.join("<br />"))}</blockquote>`);
      continue;
    }

    // Paragraph — runs until a blank line or the start of another block.
    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() !== "" &&
      !/^\s*(#{1,6})\s+/.test(lines[index]) &&
      !/^\s*>\s?/.test(lines[index]) &&
      !UNORDERED_ITEM.test(lines[index]) &&
      !ORDERED_ITEM.test(lines[index]) &&
      !/^\s*([-*_])\s*(\1\s*){2,}$/.test(lines[index])
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }

    if (paragraph.length > 0) {
      html.push(`<p>${inline(paragraph.join("<br />"))}</p>`);
    }
  }

  return html.join("\n");
}

/**
 * Strips markdown to readable plain text, for the text/plain half of an email.
 * Every message the app sends carries one — some recipients never render HTML,
 * and a letter that arrives blank is worse than one that arrives unstyled.
 */
export function markdownToPlainText(source: string): string {
  return source
    .replace(/\r\n/g, "\n")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*([-*_])\s*(\1\s*){2,}$/gm, "—")
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "  • ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
