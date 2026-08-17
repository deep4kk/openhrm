/**
 * Light resume parsing (PRD §8.8, "basic parsing — name/email/phone/skills").
 *
 * Written rather than installed, and deliberately modest about what it does.
 * A real parser is a machine-learning problem; what a recruiter actually needs
 * on the day is to not retype an email address that is sitting in plain text
 * three lines into the file. So this finds the things that have a *shape* —
 * addresses, phone numbers, known skill words — and leaves everything else to
 * the human, with every extracted field landing in an editable input rather
 * than being written straight to the record.
 *
 * It reads plain text. PDFs are accepted by the upload control and stored, but
 * only their text layer is parsed when the browser can produce one; a scanned
 * image yields nothing and the form simply stays empty, which is the correct
 * failure.
 */

/** Deliberately a plain list, not a taxonomy. Extend it by editing this array. */
const SKILL_VOCABULARY = [
  // Engineering
  "javascript", "typescript", "react", "next.js", "node.js", "python", "django",
  "flask", "java", "spring", "kotlin", "swift", "go", "rust", "ruby", "rails",
  "php", "laravel", "c++", "c#", ".net", "sql", "postgresql", "mysql", "mongodb",
  "redis", "graphql", "rest", "docker", "kubernetes", "aws", "azure", "gcp",
  "terraform", "ci/cd", "git", "linux", "html", "css", "tailwind", "figma",
  // Data
  "machine learning", "deep learning", "tensorflow", "pytorch", "pandas",
  "numpy", "spark", "hadoop", "tableau", "power bi", "excel", "r",
  // Business and HR
  "recruitment", "payroll", "onboarding", "compliance", "pf", "esi", "tds",
  "accounting", "tally", "gst", "sap", "salesforce", "hubspot",
  "project management", "agile", "scrum", "jira", "stakeholder management",
  // Soft
  "communication", "leadership", "mentoring", "negotiation", "presentation",
];

export interface ParsedResume {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  currentCompany?: string;
  skills: string[];
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
/** Indian and international shapes, tolerant of spaces, dashes and brackets. */
const PHONE = /(?:\+?\d{1,3}[\s-]?)?(?:\(\d{2,4}\)[\s-]?)?\d{3,5}[\s-]?\d{3,4}[\s-]?\d{0,4}/;

export function parseResume(text: string): ParsedResume {
  const clean = text.replace(/\r/g, "").slice(0, 200_000);
  const lower = clean.toLowerCase();

  const email = clean.match(EMAIL)?.[0];

  // Phone numbers are matched on lines that look like contact details, because
  // a bare digit run in a resume is as likely to be a date, a postcode or a
  // percentage as a number anyone can call.
  let phone: string | undefined;
  for (const line of clean.split("\n").slice(0, 40)) {
    if (!/(phone|mobile|contact|tel|\+91|\+1)/i.test(line)) continue;
    const match = line.match(PHONE)?.[0]?.trim();
    if (match && match.replace(/\D/g, "").length >= 8) {
      phone = match;
      break;
    }
  }

  const skills = SKILL_VOCABULARY.filter((skill) => {
    // Word-boundary match so "r" doesn't fire on every word containing an r,
    // and "go" doesn't fire on "goal".
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, "i").test(lower);
  }).map(titleCaseSkill);

  const { firstName, lastName } = guessName(clean, email);
  const currentCompany = guessCurrentCompany(clean);

  return { firstName, lastName, email, phone, currentCompany, skills };
}

/**
 * The name is almost always the first non-empty line that is short, has no
 * digits and no "@". That heuristic is right often enough to save typing and
 * wrong visibly enough that nobody trusts it blindly — which is the right
 * balance for a field the recruiter is about to look at anyway.
 */
function guessName(
  text: string,
  email?: string,
): { firstName?: string; lastName?: string } {
  for (const raw of text.split("\n").slice(0, 12)) {
    const line = raw.trim().replace(/^[#*\-•\s]+/, "");
    if (line.length < 3 || line.length > 48) continue;
    if (/[@\d]/.test(line)) continue;
    if (/^(curriculum vitae|resume|cv|profile|summary)$/i.test(line)) continue;

    const words = line.split(/\s+/).filter(Boolean);
    if (words.length < 1 || words.length > 4) continue;
    if (!words.every((w) => /^[\p{L}.'-]+$/u.test(w))) continue;

    return {
      firstName: words[0],
      lastName: words.length > 1 ? words.slice(1).join(" ") : undefined,
    };
  }

  // Fall back to the local part of the email — "priya.nair@" is a better guess
  // than nothing, and the recruiter is going to correct it either way.
  if (email) {
    const local = email.split("@")[0]!.replace(/\d+/g, "");
    const parts = local.split(/[._-]+/).filter((p) => p.length > 1);
    if (parts.length > 0) {
      return {
        firstName: capitalise(parts[0]!),
        lastName: parts[1] ? capitalise(parts[1]) : undefined,
      };
    }
  }

  return {};
}

/** The line after "current" / "present" / the most recent role heading. */
function guessCurrentCompany(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.trim());

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (!/\b(present|current(ly)?|till date|to date)\b/i.test(line)) continue;

    // The company name is usually on the same line, separated by a dash or at,
    // or on the line immediately above.
    const sameLine = line
      .replace(/\b(present|current(ly)?|till date|to date)\b/gi, "")
      .replace(/\d{4}\s*[-–]\s*/g, "")
      .replace(/^[\s|,\-–—]+|[\s|,\-–—]+$/g, "");

    const candidate = sameLine.length >= 3 ? sameLine : lines[i - 1];
    if (candidate && candidate.length >= 3 && candidate.length <= 80) {
      return candidate.replace(/^[\s|,\-–—]+|[\s|,\-–—]+$/g, "");
    }
  }

  return undefined;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** Keeps the vocabulary's own casing for names that have one. */
function titleCaseSkill(skill: string): string {
  const SPECIAL: Record<string, string> = {
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "next.js": "Next.js",
    "node.js": "Node.js",
    "c++": "C++",
    "c#": "C#",
    ".net": ".NET",
    "sql": "SQL",
    "postgresql": "PostgreSQL",
    "mysql": "MySQL",
    "mongodb": "MongoDB",
    "graphql": "GraphQL",
    "rest": "REST",
    "aws": "AWS",
    "gcp": "GCP",
    "ci/cd": "CI/CD",
    "html": "HTML",
    "css": "CSS",
    "php": "PHP",
    "pf": "PF",
    "esi": "ESI",
    "tds": "TDS",
    "gst": "GST",
    "sap": "SAP",
    "power bi": "Power BI",
    "r": "R",
  };

  if (SPECIAL[skill]) return SPECIAL[skill];
  return skill
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
