import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Mail, Plus, Settings2 } from "lucide-react";

import { requirePermission } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { letterKindLabel } from "@/lib/documents/types";
import { documentsSummary, listLetters } from "@/lib/queries/documents";
import { EmptyState, PageHeader, PageShell } from "@/components/page-header";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Documents" };

/**
 * Everything the organisation has issued.
 *
 * Deliberately the landing screen rather than the template list: templates are
 * written a handful of times, letters are issued every week, and "what did we
 * send that candidate" is the question people actually arrive here with.
 */
export default async function DocumentsPage() {
  const session = await requirePermission("letter.manage");

  const [summary, letters] = await Promise.all([
    documentsSummary(session),
    listLetters(session),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Documents"
        description="Offer letters, increments, relieving and experience letters — generated from your templates and mailed from here."
        actions={
          <>
            <LinkButton href="/documents/templates" variant="outline">
              <Settings2 className="size-4" aria-hidden />
              Templates
              <Badge variant="secondary" className="ml-1">
                {summary.activeTemplates}
              </Badge>
            </LinkButton>
            <LinkButton href="/documents/new">
              <Plus className="size-4" aria-hidden />
              New document
            </LinkButton>
          </>
        }
      />

      {summary.pendingDrafts > 0 && (
        <div className="surface flex items-center gap-3 p-4">
          <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <p className="text-sm">
            <span className="font-medium">
              {summary.pendingDrafts} mail draft
              {summary.pendingDrafts === 1 ? "" : "s"}
            </span>{" "}
            <span className="text-muted-foreground">
              waiting to be reviewed and sent.
            </span>
          </p>
        </div>
      )}

      <div className="surface overflow-hidden">
        {letters.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No documents issued yet"
            description={
              summary.activeTemplates === 0
                ? "Start by creating a template — describe the letter you want and let AI draft it, or write it yourself."
                : "Pick a template, choose who it's for, and the details fill in from their record."
            }
            action={
              <LinkButton
                href={
                  summary.activeTemplates === 0
                    ? "/documents/templates/new"
                    : "/documents/new"
                }
              >
                {summary.activeTemplates === 0 ? "Create a template" : "New document"}
              </LinkButton>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Issued to</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Mail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {letters.map((letter) => {
                const draft = letter.mailDrafts[0];
                return (
                  <TableRow key={letter.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {letter.letterNumber ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/documents/${letter.id}`}
                        className="font-medium hover:underline"
                      >
                        {letter.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {letter.employee ? (
                        <Link
                          href={`/people/${letter.employee.id}`}
                          className="hover:underline"
                        >
                          {letter.recipientName}
                        </Link>
                      ) : (
                        letter.recipientName
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {letterKindLabel(letter.template?.kind ?? "custom")}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(letter.issuedAt)}
                    </TableCell>
                    <TableCell>
                      {!draft ? (
                        <span className="text-muted-foreground text-xs">—</span>
                      ) : draft.status === "SENT" ? (
                        <Badge variant="secondary">Sent</Badge>
                      ) : draft.status === "FAILED" ? (
                        <Badge variant="destructive">Failed</Badge>
                      ) : (
                        <Badge variant="outline">Draft</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </PageShell>
  );
}
