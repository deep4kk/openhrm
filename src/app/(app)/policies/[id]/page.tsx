import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Pencil } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import {
  acknowledgementCoverage,
  getPolicy,
  hasAcknowledged,
} from "@/lib/queries/policies";
import { renderMarkdown } from "@/lib/documents/markdown";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { ProgressBar } from "@/components/progress-bar";
import { StatusBadge } from "@/components/status-badge";
import { PersonCell } from "@/components/people/person-avatar";
import { LinkButton } from "@/components/link-button";
import {
  AcknowledgeButton,
  ArchivePolicyButton,
} from "@/components/policies/acknowledge-button";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const session = await requirePermission("policy.read", "policy.manage");
  const { id } = await params;
  const policy = await getPolicy(session, id);
  return { title: policy?.title ?? "Policy" };
}

/**
 * Reading a policy.
 *
 * The acknowledgement sits below the text, and coverage — who has signed, who
 * has not — is shown only to people who can manage policies. For everyone else
 * a list of colleagues who have not yet read the handbook is gossip, not
 * information.
 */
export default async function PolicyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission("policy.read", "policy.manage");
  const { id } = await params;

  const policy = await getPolicy(session, id);
  if (!policy) notFound();

  const mayManage = can(session, "policy.manage");
  const [signed, coverage] = await Promise.all([
    hasAcknowledged(session, policy.id, policy.version),
    mayManage
      ? acknowledgementCoverage(session, policy.id, policy.version)
      : Promise.resolve(null),
  ]);

  const needsAcknowledgement =
    policy.requiresAcknowledgement &&
    !policy.isArchived &&
    policy.publishedAt !== null &&
    session.employee !== null;

  return (
    <PageShell className="max-w-3xl">
      <Link
        href="/policies"
        className="text-muted-foreground hover:text-foreground -ml-1 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden />
        Policies
      </Link>

      <PageHeader
        title={policy.title}
        description={policy.summary ?? undefined}
        actions={
          mayManage && (
            <>
              <ArchivePolicyButton
                policyId={policy.id}
                isArchived={policy.isArchived}
              />
              <LinkButton href={`/policies/${policy.id}/edit`} variant="outline">
                <Pencil className="size-4" aria-hidden />
                Edit
              </LinkButton>
            </>
          )
        }
      />

      <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <StatusBadge label={`Version ${policy.version}`} tone="neutral" />
        {!policy.publishedAt && <StatusBadge label="Draft" tone="warning" />}
        {policy.isArchived && <StatusBadge label="Archived" tone="neutral" />}
        {signed && <StatusBadge label="You have acknowledged this" tone="positive" />}
        <span>{policy.category}</span>
        {policy.effectiveFrom && (
          <span>Effective {formatDate(policy.effectiveFrom)}</span>
        )}
        {policy.author && <span>Written by {policy.author.name}</span>}
      </div>

      <article
        className="surface prose-letter p-6 sm:p-8"
        // The renderer escapes its input before inserting any markup — see the
        // header comment in src/lib/documents/markdown.ts.
        dangerouslySetInnerHTML={{ __html: renderMarkdown(policy.body) }}
      />

      {needsAcknowledgement &&
        (signed ? (
          <p className="text-muted-foreground text-sm">
            You acknowledged version {policy.version} of this policy.
          </p>
        ) : (
          <AcknowledgeButton policyId={policy.id} version={policy.version} />
        ))}

      {coverage && policy.requiresAcknowledgement && (
        <section>
          <h2 className="mb-3 text-sm font-semibold">
            Who has read version {policy.version}
          </h2>

          <div className="surface space-y-4 p-5">
            <ProgressBar
              percent={
                coverage.total === 0
                  ? 0
                  : (coverage.signed.length / coverage.total) * 100
              }
              label={`${coverage.signed.length} of ${coverage.total}`}
              tone={
                coverage.outstanding.length === 0 ? "positive" : "warning"
              }
            />

            {coverage.outstanding.length > 0 && (
              <div>
                <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                  Still outstanding ({coverage.outstanding.length})
                </h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {coverage.outstanding.map((person) => (
                    <li key={person.id}>
                      <PersonCell
                        firstName={person.firstName}
                        lastName={person.lastName}
                        avatarUrl={person.avatarUrl}
                        secondary={person.department?.name ?? person.employeeCode}
                        size="xs"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {coverage.signed.length > 0 && (
              <details className="border-t pt-4">
                <summary className="cursor-pointer text-xs font-semibold">
                  Acknowledged ({coverage.signed.length})
                </summary>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {coverage.signed.map((person) => (
                    <li key={person.id}>
                      <PersonCell
                        firstName={person.firstName}
                        lastName={person.lastName}
                        avatarUrl={person.avatarUrl}
                        secondary={formatDate(person.acknowledgedAt)}
                        size="xs"
                      />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
      )}
    </PageShell>
  );
}
