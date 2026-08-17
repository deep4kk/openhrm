import type { Metadata } from "next";
import Link from "next/link";
import { BookText, Plus, TriangleAlert } from "lucide-react";

import { requirePermission, can } from "@/lib/auth";
import { listPolicies, pendingAcknowledgements } from "@/lib/queries/policies";
import { formatDate } from "@/lib/dates";
import { PageHeader, PageShell, EmptyState } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { LinkButton } from "@/components/link-button";

export const metadata: Metadata = { title: "Policies" };

/**
 * The policy hub.
 *
 * What you still owe comes first, in a box that is impossible to scroll past.
 * The rest is a reference library grouped by category — the thing people search
 * when they want to check the notice period, which is a different job from
 * being chased to sign something.
 */
export default async function PoliciesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const session = await requirePermission("policy.read", "policy.manage");
  const { show } = await searchParams;

  const mayManage = can(session, "policy.manage");
  const [policies, outstanding] = await Promise.all([
    listPolicies(session, { includeArchived: show === "archived" }),
    pendingAcknowledgements(session),
  ]);

  const byCategory = new Map<string, typeof policies>();
  for (const policy of policies) {
    const list = byCategory.get(policy.category) ?? [];
    list.push(policy);
    byCategory.set(policy.category, list);
  }

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        title="Policies"
        description="Company policies, with a record of who has read which version."
        actions={
          mayManage && (
            <LinkButton href="/policies/new">
              <Plus className="size-4" aria-hidden />
              New policy
            </LinkButton>
          )
        }
      />

      {outstanding.length > 0 && (
        <section className="border-warning/40 bg-warning-subtle rounded-lg border p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="size-4" aria-hidden />
            {outstanding.length} to read and acknowledge
          </h2>
          <ul className="mt-3 space-y-2">
            {outstanding.map((policy) => (
              <li key={policy.id}>
                <Link
                  href={`/policies/${policy.id}`}
                  className="hover:underline"
                >
                  <span className="text-sm font-medium">{policy.title}</span>
                  {policy.summary && (
                    <span className="text-muted-foreground ml-2 text-xs">
                      {policy.summary}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mayManage && (
        <div className="flex items-center gap-3">
          <Link
            href="/policies"
            className={filterClass(show !== "archived")}
            aria-current={show !== "archived" ? "page" : undefined}
          >
            Live
          </Link>
          <Link
            href="/policies?show=archived"
            className={filterClass(show === "archived")}
            aria-current={show === "archived" ? "page" : undefined}
          >
            Including archived
          </Link>
        </div>
      )}

      {policies.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={BookText}
            title="No policies yet"
            description={
              mayManage
                ? "Write the handbook once here and every employee gets it, with read receipts that survive an audit."
                : "Nothing has been published yet."
            }
            action={
              mayManage ? (
                <LinkButton href="/policies/new">Write the first one</LinkButton>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(byCategory.entries()).map(([category, items]) => (
            <section key={category}>
              <h2 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
                {category}
              </h2>
              <ul className="surface divide-y overflow-hidden">
                {items.map((policy) => (
                  <li key={policy.id}>
                    <Link
                      href={`/policies/${policy.id}`}
                      className="hover:bg-muted/50 focus-visible:ring-ring flex flex-wrap items-center gap-4 p-4 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-inset"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{policy.title}</p>
                          {policy.version > 1 && (
                            <StatusBadge
                              label={`v${policy.version}`}
                              tone="neutral"
                            />
                          )}
                          {!policy.publishedAt && (
                            <StatusBadge label="Draft" tone="warning" />
                          )}
                          {policy.isArchived && (
                            <StatusBadge label="Archived" tone="neutral" />
                          )}
                        </div>
                        {policy.summary && (
                          <p className="text-muted-foreground measure mt-0.5 text-xs">
                            {policy.summary}
                          </p>
                        )}
                      </div>

                      <div className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                        {policy.effectiveFrom && (
                          <p>From {formatDate(policy.effectiveFrom)}</p>
                        )}
                        {mayManage && policy.requiresAcknowledgement && (
                          <p>
                            {policy._count.acknowledgements} acknowledgement
                            {policy._count.acknowledgements === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function filterClass(active: boolean): string {
  return active
    ? "text-foreground border-foreground border-b-2 pb-1 text-sm font-medium"
    : "text-muted-foreground hover:text-foreground border-b-2 border-transparent pb-1 text-sm transition-colors";
}
