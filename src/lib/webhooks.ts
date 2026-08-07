import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { rawDb } from "./db";

/**
 * Outbound webhooks (PRD §8.27).
 *
 * The contract with a receiver is small and boring on purpose:
 *
 *   POST <url>
 *   X-OpenHRM-Event: leave.approved
 *   X-OpenHRM-Delivery: <delivery id>
 *   X-OpenHRM-Signature: sha256=<hex hmac of the raw body>
 *
 * The signature is what makes the endpoint safe to expose: a receiver verifies
 * it with the shared secret and can then trust the payload, rather than trusting
 * whoever happened to POST to the URL.
 *
 * Delivery is fire-and-forget from the caller's point of view. An HR action must
 * never fail because someone's Zapier account is down, so every failure is
 * caught, recorded on the delivery row and surfaced in the UI instead of thrown.
 * A real deployment would move this to the BullMQ queue the PRD names in §10;
 * the interface here is the same either way, so that swap does not touch call
 * sites.
 */

export const WEBHOOK_EVENTS = [
  "employee.created",
  "employee.updated",
  "employee.exited",
  "leave.requested",
  "leave.approved",
  "leave.rejected",
  "attendance.checked_in",
  "payroll.run.completed",
  "expense.submitted",
  "expense.approved",
  "candidate.created",
  "candidate.hired",
  "ticket.raised",
  "ticket.resolved",
  "policy.published",
  "review.submitted",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEvent, string> = {
  "employee.created": "A new employee record was created.",
  "employee.updated": "An employee's job details changed.",
  "employee.exited": "An employee left the organisation.",
  "leave.requested": "Someone applied for leave.",
  "leave.approved": "A leave request was approved.",
  "leave.rejected": "A leave request was declined.",
  "attendance.checked_in": "Someone checked in for the day.",
  "payroll.run.completed": "A payroll run was approved and payslips released.",
  "expense.submitted": "An expense claim was submitted for approval.",
  "expense.approved": "An expense claim was approved.",
  "candidate.created": "A candidate applied or was added to a pipeline.",
  "candidate.hired": "A candidate was marked hired.",
  "ticket.raised": "An employee raised a helpdesk ticket.",
  "ticket.resolved": "A helpdesk ticket was resolved.",
  "policy.published": "A policy was published or revised.",
  "review.submitted": "A performance review was submitted.",
};

const TIMEOUT_MS = 8_000;
const MAX_FAILURES_BEFORE_PAUSE = 10;

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

/** Exposed so a receiver written against this codebase can verify the same way. */
export function verifySignature(
  secret: string,
  body: string,
  signature: string,
): boolean {
  const expected = Buffer.from(sign(secret, body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * Publishes an event to every active endpoint subscribed to it.
 *
 * Never throws. Callers are business operations that have already succeeded —
 * an undelivered webhook is a monitoring problem, not a reason to roll back a
 * leave approval.
 */
export async function emitWebhook(
  orgId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await rawDb.webhookEndpoint.findMany({
      where: { orgId, status: "ACTIVE", events: { has: event } },
    });

    if (endpoints.length === 0) return;

    const payload = {
      event,
      createdAt: new Date().toISOString(),
      data,
    };
    const body = JSON.stringify(payload);

    await Promise.all(
      endpoints.map((endpoint) => deliver(orgId, endpoint, event, payload, body)),
    );
  } catch (error) {
    console.error("[webhooks] failed to emit", { event, error });
  }
}

async function deliver(
  orgId: string,
  endpoint: { id: string; url: string; secret: string; failureCount: number },
  event: string,
  payload: unknown,
  body: string,
): Promise<void> {
  const delivery = await rawDb.webhookDelivery.create({
    data: {
      orgId,
      endpointId: endpoint.id,
      event,
      payload: payload as never,
      attempts: 1,
    },
  });

  try {
    const response = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "OpenHRM-Webhook/1.0",
        "x-openhrm-event": event,
        "x-openhrm-delivery": delivery.id,
        "x-openhrm-signature": sign(endpoint.secret, body),
      },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    await rawDb.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        statusCode: response.status,
        deliveredAt: response.ok ? new Date() : null,
        error: response.ok ? null : `HTTP ${response.status}`,
      },
    });

    await rawDb.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: response.ok
        ? { lastDeliveryAt: new Date(), failureCount: 0 }
        : { failureCount: { increment: 1 } },
    });

    // A dead endpoint is paused rather than retried forever — otherwise one
    // stale URL generates traffic and delivery rows indefinitely.
    if (!response.ok && endpoint.failureCount + 1 >= MAX_FAILURES_BEFORE_PAUSE) {
      await rawDb.webhookEndpoint.update({
        where: { id: endpoint.id },
        data: { status: "FAILING" },
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Delivery failed";
    await rawDb.webhookDelivery.update({
      where: { id: delivery.id },
      data: { error: message.slice(0, 300) },
    });
    await rawDb.webhookEndpoint.update({
      where: { id: endpoint.id },
      data: { failureCount: { increment: 1 } },
    });
  }
}

/**
 * Chat notifications (PRD §8.24).
 *
 * Slack and Teams both accept a plain JSON body on an incoming-webhook URL, so
 * one function covers both. Kept beside webhooks because it is the same
 * problem — an outbound HTTP call that must never break the caller.
 */
export async function notifyChat(
  orgId: string,
  text: string,
): Promise<void> {
  try {
    const org = await rawDb.organization.findUnique({
      where: { id: orgId },
      select: { slackWebhookUrl: true, teamsWebhookUrl: true },
    });
    if (!org) return;

    const targets: { url: string; body: string }[] = [];
    if (org.slackWebhookUrl) {
      targets.push({ url: org.slackWebhookUrl, body: JSON.stringify({ text }) });
    }
    if (org.teamsWebhookUrl) {
      targets.push({ url: org.teamsWebhookUrl, body: JSON.stringify({ text }) });
    }

    await Promise.all(
      targets.map((target) =>
        fetch(target.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: target.body,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }).catch(() => undefined),
      ),
    );
  } catch (error) {
    console.error("[webhooks] chat notification failed", error);
  }
}
