# The documents module

Generating HR letters — offer, appointment, confirmation, increment, promotion,
warning, experience, relieving, full-and-final — from reusable templates, and
mailing them.

This document covers how it works, the decisions behind it, and what it
deliberately does not do.

---

## The shape of it

There are two objects and one deliberate gap between them.

A **template** is the letter with the names taken out. It is Markdown with
`{{placeholders}}`, written once, plus a typed description of what each
placeholder means. `LetterTemplate`.

A **letter** is that template filled in for one named person, frozen at the
moment it was issued. `GeneratedLetter`.

The gap is the **mail draft**. Issuing a letter composes an email; it does not
send one. `LetterMailDraft` holds the to/cc/subject/body until a human opens it,
reads it, and presses Send. For a document class that includes offers and
terminations, an automatic send is a bug, not a convenience.

```
Settings → Letterhead        logo, registered address, signatory
        ↓
Documents → Templates        write once, with {{placeholders}}
        ↓
Documents → New document     pick template + person → details fill in
        ↓
GeneratedLetter              frozen HTML, reference number, printable
        ↓
LetterMailDraft              editable, reviewed, sent by hand
```

---

## Variables

The template body is the single source of truth for **which** variables exist.
Typing `{{noticePeriod}}` into a paragraph makes a "Notice period" field appear
on the generate screen; deleting the paragraph takes it away. Nobody maintains a
separate list of fields, because a list that can disagree with the letter
eventually will.

The stored `variables` JSON is the source of truth for what each one **means** —
its label, its type, whether it is required, and where it fills in from.
`reconcile()` in `src/lib/documents/variables.ts` merges the two on every edit.

### Types

`text`, `longtext`, `number`, `money`, `date`, `email`. The type decides the
input control on the generate form and the formatting in the finished letter — a
`money` value stored as `1200000` prints as `₹12,00,000`, a `date` stored as
`2026-04-01` prints as `1 Apr 2026`.

Values are stored **raw** and formatted once at render time, so a prefilled
amount the user edits is still a number the renderer can re-format.

### Autofill

A variable carrying a `source` fills itself in when an employee is picked.
Sources are listed in `AUTOFILL_SOURCES` (`src/lib/documents/types.ts`) and cover
the employee record, their compensation, the organisation and the letter itself.

Prefilled values stay editable. A back-dated experience letter may need the
designation the person held then, not the one on record now.

### System variables

`{{org.name}}`, `{{org.address}}`, `{{org.signatoryName}}`, `{{letter.date}}`,
`{{letter.number}}` and their siblings are resolved by the app and never shown as
form fields. They are facts about the issuing company and the document, not
answers a user gives — and an editable reference number is not a reference
number. `formVariables()` is the filter; `isAutomatic()` is the predicate.

### Unresolved tokens

A known variable left blank renders as an empty string — an optional clause
should not print as `{{bonus}}`. A token with **no definition at all** is left
in the output verbatim, on purpose: it is almost always a typo, and it is far
better for the author to see `{{empolyeeName}}` staring back from the preview
than to have it silently vanish from an offer letter.

---

## Permissions

| Action | Requires |
|---|---|
| Everything in `/documents` | `letter.manage` |
| Editing the letterhead | `org.update` |
| Prefilling salary figures | `employee.compensation.read` |
| Which employees are pickable | the caller's `employee.read` scope |

Salary is gated **separately** from the rest. A user without
`employee.compensation.read` gets every non-salary field prefilled and the salary
fields blank — an empty box to type into, not a 403. An HR coordinator who cannot
see payroll should still be able to raise an experience letter.

Nothing stops that person typing a salary figure by hand. That is intended, and
it is why the values used are recorded in the audit trail against their name.

Employee reachability is checked server-side on the autofill call, so a manager
with team-scoped access cannot pull another team's record by passing an id.

---

## Decisions worth knowing

### No PDF library

Letters render as HTML with **every style inline**, wrapped in a page carrying an
`@page { size: A4 }` rule. Ctrl+P produces the PDF. Every browser already ships a
PDF engine; adding Puppeteer would have put ~300MB of Chromium into the Docker
image to reproduce it.

Inline styles are what make one artifact serve all three destinations: the
on-screen preview, the printed page, and the outbound email — where a `<style>`
block is stripped by Outlook and rewritten by Gmail, and only inline attributes
survive.

The trade-off: the email carries the letter **in the body**, not as an attached
PDF file. If attachments become a requirement, `pdf-lib` against
`GeneratedLetter.renderedHtml` is the smallest next step.

### The logo is a `data:` URI in the database

Not object storage. A logo is a few kilobytes that has to appear inside emails,
where a link to private storage renders as a broken image and a link to public
storage is a leak. Keeping it on the `Organization` row means it travels with the
database backup instead of needing its own bucket and its own restore procedure.

Capped at 256KB in `updateLetterheadAction`, which matters rather than being
cosmetic: the value is read on every page render for the sidebar and inlined into
every outbound email.

SVG is accepted because logos are usually vector, and it is served exclusively as
a `data:` URI inside an `<img>`, where scripts do not execute.

### Issued letters are frozen

`GeneratedLetter.renderedHtml` is written once and never recomputed. Re-rendering
from the template on demand would be smaller, but it would mean editing a
template silently rewrites letters already issued under it — including the logo
and registered address in the letterhead. A letter is a record of what was sent.

The template editor says so when a template has issued letters.

### The markdown renderer is written, not installed

`src/lib/documents/markdown.ts`. It needs headings, bold, lists, tables and rules
— nothing else. A general-purpose library would bring a parser, a sanitiser and
their transitive dependencies to do the same job.

**Its security shape matters.** Everything is escaped *first*, then the markdown
transforms insert tags the module wrote itself. That ordering is the entire
defence and it is not optional: placeholders are replaced with values that
originate in user input, and the result is rendered with
`dangerouslySetInnerHTML` and mailed as HTML. Escaping afterwards would mean
deciding which `<` was ours and which arrived in a variable.

Link `href`s are restricted to `https:`, `http:`, `mailto:`, `tel:` and relative
paths; anything else renders as plain text.

### Reference numbers

`OL/2026/0001` — prefix by document kind, then year, then a per-organisation
sequence. Drawn via `{ letterSequence: { increment: 1 } }`, so Postgres applies
the increment and two people issuing at the same moment get different numbers
rather than both reading the same value and writing it back.

---

## AI drafting

Optional. Set `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`, default
`gemini-3.6-flash`) to enable "describe the letter you want".

Without a key the panel is replaced by a note explaining how to turn it on, and
every other part of the module works unchanged. `isConfigured()` is what the
screens branch on — a fresh clone is a supported state, not an error.

### What is sent

**The template, never the data.** The model receives the admin's plain-English
brief and — when revising — the existing template body. It never sees an employee
name, a salary or any other personal data: it produces the letter with the
placeholders still in it, and substitution happens locally afterwards. That keeps
the feature useful without exporting the HR database to a third party, which is
the property a self-hosted HR system has to preserve.

### Implementation

`src/lib/ai/gemini.ts` — one `fetch` to `generateContent`, no SDK, so an auditor
can read the whole integration in forty lines. Output is constrained with a
response schema rather than parsed out of prose, and everything that comes back
is re-validated in `src/lib/documents/ai.ts`: a hallucinated variable type or
autofill key is dropped rather than written to the database.

The model name is configuration because model identifiers are renamed and retired
on Google's schedule, not ours.

---

## Email

Sending goes through the existing `src/lib/mail.ts` — the same SMTP configuration
the invitation and leave-notification emails use.

`sendMail()` returns a `MailResult` rather than throwing, because a failed leave
notification must not roll back the approval that triggered it. The documents
module reads that result: `failed` marks the draft `FAILED` with the reason shown
on screen, `sent` marks it `SENT`.

When `SMTP_HOST` is unset the message is printed to the server console and the
result is `logged`. The draft is still marked sent — the send was performed — and
the screen **warns about the unconfigured mailer before the button is pressed**
rather than pretending afterwards.

A letter that has already been emailed cannot be deleted. The recipient is
holding it; a system that denies issuing it is worse than one that keeps the
record.

---

## Files

```
src/lib/documents/
  types.ts        letter kinds, variable types, the autofill catalogue
  markdown.ts     markdown → HTML, escaping first
  variables.ts    token extraction, substitution, reconcile, formVariables
  render.ts       value formatting, inline styling, the letter document
  autofill.ts     employee + compensation → variable values  (server only)
  ai.ts           the drafting prompt and response validation (server only)
src/lib/ai/gemini.ts          the REST client
src/lib/actions/documents.ts  templates, generation, mail drafts
src/lib/queries/documents.ts  reads
src/app/(app)/documents/      the screens; [id]/print is a bare route handler
src/components/documents/     editor, generate form, mail panel
```

Starter templates for offer, relieving, experience and increment letters ship in
`prisma/seed.ts`.
