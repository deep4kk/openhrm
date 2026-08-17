import type { Metadata } from "next";

import { requirePermission } from "@/lib/auth";
import { orgDb } from "@/lib/db";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_DESCRIPTIONS } from "@/lib/webhooks";
import { formatRelative } from "@/lib/dates";
import { PageHeader, PageShell } from "@/components/page-header";
import { BackToSettings } from "@/components/settings/panel";
import { WebhookManager } from "@/components/settings/webhook-manager";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  const session = await requirePermission("webhook.manage");

  const endpoints = await orgDb(session.org.id).webhookEndpoint.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      deliveries: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });

  return (
    <PageShell className="max-w-4xl">
      <BackToSettings />

      <PageHeader
        title="Webhooks"
        description="Push events to another system as they happen, instead of polling the API for changes."
      />

      <WebhookManager
        endpoints={endpoints.map((endpoint) => ({
          id: endpoint.id,
          name: endpoint.name,
          url: endpoint.url,
          events: endpoint.events,
          status: endpoint.status,
          failureCount: endpoint.failureCount,
          lastDeliveryLabel: endpoint.lastDeliveryAt
            ? formatRelative(endpoint.lastDeliveryAt)
            : null,
          deliveries: endpoint.deliveries.map((delivery) => ({
            id: delivery.id,
            event: delivery.event,
            statusCode: delivery.statusCode,
            error: delivery.error,
            createdLabel: formatRelative(delivery.createdAt),
            delivered: delivery.deliveredAt !== null,
          })),
        }))}
        events={WEBHOOK_EVENTS.map((event) => ({
          name: event,
          description: WEBHOOK_EVENT_DESCRIPTIONS[event],
        }))}
      />

      <section className="surface space-y-3 p-5">
        <h2 className="text-sm font-semibold">Verifying a payload</h2>
        <p className="text-muted-foreground text-sm">
          Compute the HMAC over the <em>raw</em> body, before any JSON parsing —
          re-serialising changes the bytes and the signature will not match.
        </p>
        <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">
{`const expected =
  "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");

if (!timingSafeEqual(Buffer.from(expected), Buffer.from(header))) {
  return new Response("bad signature", { status: 401 });
}`}
        </pre>
        <p className="text-muted-foreground text-xs">
          An endpoint that fails ten times in a row is paused automatically
          rather than retried forever. Fixing and saving it clears the counter.
        </p>
      </section>
    </PageShell>
  );
}
