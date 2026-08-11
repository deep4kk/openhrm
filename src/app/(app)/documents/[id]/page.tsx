import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Printer } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { letterKindLabel } from "@/lib/documents/types";
import { isMailConfigured } from "@/lib/mail";
import { getLetter } from "@/lib/queries/documents";
import { PageHeader, PageShell } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteLetterButton } from "@/components/documents/delete-letter-button";
import { MailDraftPanel } from "@/components/documents/mail-draft-panel";

export const metadata: Metadata = { title: "Document" };

export default async function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission("letter.manage");

  const letter = await getLetter(session, id);
  if (!letter) notFound();

  const draft = letter.mailDrafts[0] ?? null;

  return (
    <PageShell className="max-w-4xl">
      <Link
        href="/documents"
        className="text-muted-foreground hover:text-foreground -mb-2 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Documents
      </Link>

      <PageHeader
        title={letter.title}
        description={[
          letter.letterNumber,
          letterKindLabel(letter.template?.kind ?? "custom"),
          `issued to ${letter.recipientName}`,
          `on ${formatDate(letter.issuedAt)}`,
          letter.issuedBy ? `by ${letter.issuedBy.name}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            {/* A plain anchor opening a new tab, not a Link: the print view is
                a bare route handler outside the React tree, and it has no way
                back into the app. */}
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href={`/documents/${letter.id}/print`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Printer className="size-4" aria-hidden />
              Print / save as PDF
            </Button>
            <DeleteLetterButton id={letter.id} title={letter.title} />
          </>
        }
      />

      {letter.employee && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Employee record:</span>
          <Link
            href={`/people/${letter.employee.id}`}
            className="font-medium hover:underline"
          >
            {letter.employee.firstName} {letter.employee.lastName}
          </Link>
          {letter.template && (
            <Badge variant="outline" className="ml-1">
              from {letter.template.name}
            </Badge>
          )}
        </div>
      )}

      <MailDraftPanel
        letterId={letter.id}
        mailConfigured={isMailConfigured()}
        draft={
          draft
            ? {
                id: draft.id,
                to: draft.to,
                cc: draft.cc,
                subject: draft.subject,
                body: draft.body,
                status: draft.status,
                sentAt: draft.sentAt,
                error: draft.error,
              }
            : null
        }
      />

      {/* The document exactly as it was frozen at issue time. It is stored as
          fully inline-styled HTML, so it renders identically here, in the print
          view and in the email. */}
      <div className="surface overflow-x-auto p-6 sm:p-10">
        <div dangerouslySetInnerHTML={{ __html: letter.renderedHtml }} />
      </div>
    </PageShell>
  );
}
