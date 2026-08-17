import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate, formatRelative } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { ApiKeyManager } from "@/components/settings/api-key-manager";

export const metadata: Metadata = { title: "API keys" };

/**
 * Credentials for the public API.
 *
 * The docs link matters as much as the manager: a key with no accompanying
 * "here is how to call it" is a key nobody uses.
 */
export default async function ApiKeysPage() {
  const session = await requirePermission("apikey.manage");

  const keys = await orgDb(session.org.id).apiKey.findMany({
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />

      <PageHeader
        title="API keys"
        description="Credentials for the read API at /api/v1. A key carries a subset of your own permissions and nothing more."
      />

      <ApiKeyManager
        keys={keys.map((key) => ({
          id: key.id,
          name: key.name,
          prefix: key.prefix,
          permissions: key.permissions,
          createdLabel: formatDate(key.createdAt),
          lastUsedLabel: key.lastUsedAt ? formatRelative(key.lastUsedAt) : null,
          expiresLabel: key.expiresAt ? formatDate(key.expiresAt) : null,
          revoked: key.revokedAt !== null,
        }))}
        permissions={PERMISSIONS.map((permission) => ({
          key: permission.key,
          label: permission.label,
          group: permission.group,
          held: session.role.permissions.includes(permission.key),
        }))}
      />

      <section className="surface space-y-3 p-5">
        <h2 className="text-sm font-semibold">Using a key</h2>
        <p className="text-muted-foreground text-sm">
          Send it as a bearer token. Every response is scoped to this
          organisation — a key cannot reach another tenant even if it asks.
        </p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
{`curl ${process.env.APP_URL ?? "http://localhost:3000"}/api/v1/employees \\
  -H "Authorization: Bearer ohrm_your_key_here"`}
        </pre>
        <p className="text-muted-foreground text-xs">
          The full endpoint list, filters and webhook payloads are on{" "}
          <a href="/api/v1" className="text-brand underline-offset-4 hover:underline">
            /api/v1
          </a>
          .
        </p>
      </section>
    </PageShell>
  );
}
