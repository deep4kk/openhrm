import { can, getSession } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { renderPrintablePage } from "@/lib/documents/render";

/**
 * The printable document.
 *
 * A route handler rather than a page, because the letter has to arrive on a
 * bare A4 sheet — no sidebar, no theme, no app chrome. Sitting outside the
 * React tree means there is no layout to fight and no risk of a stray element
 * appearing in the PDF.
 *
 * The stored HTML is served exactly as it was frozen at issue time. Ctrl+P from
 * here produces the PDF, which is why this feature needs no PDF library: the
 * `@page` rule in the wrapper does the work every browser already ships.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return new Response("Not signed in.", { status: 401 });
  }
  if (!can(session, "letter.manage")) {
    return new Response("You do not have permission to view this document.", {
      status: 403,
    });
  }

  const { id } = await params;
  const letter = await orgDb(session.org.id).generatedLetter.findFirst({
    where: { id },
    select: { title: true, renderedHtml: true, letterNumber: true },
  });

  if (!letter) {
    return new Response("That document does not exist.", { status: 404 });
  }

  return new Response(
    renderPrintablePage(
      letter.letterNumber ? `${letter.letterNumber} — ${letter.title}` : letter.title,
      letter.renderedHtml,
    ),
    {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // A letter is per-recipient and carries salary data; it must not be
        // held by a shared cache anywhere between here and the browser.
        "cache-control": "private, no-store",
      },
    },
  );
}
