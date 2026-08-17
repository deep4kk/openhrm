import { apiJson } from "@/lib/api-auth";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_DESCRIPTIONS } from "@/lib/webhooks";

/**
 * GET /api/v1
 *
 * The API describes itself. Unauthenticated on purpose: it lists what exists
 * and what each endpoint needs, and reveals nothing about any organisation —
 * which is the difference between a discovery document and a data leak.
 *
 * A machine-readable index rather than a docs page because the audience is
 * someone with curl open, and because it cannot drift from the code the way a
 * hand-written page would.
 */
export function GET(request: Request) {
  const base = new URL(request.url).origin;

  return apiJson({
    name: "OpenHRM API",
    version: "v1",
    authentication: {
      scheme: "bearer",
      header: "Authorization: Bearer ohrm_…",
      issue_keys_at: "/settings/api-keys",
      note: "A key carries a subset of the permissions held by whoever issued it, and is scoped to one organisation.",
    },
    rate_limit: { requests: 120, per: "minute", scope: "per key" },
    paging: {
      parameters: ["limit", "offset"],
      default_limit: 50,
      max_limit: 200,
      response_field: "paging",
    },
    errors: {
      shape: { error: { code: "string", message: "string" } },
      codes: [
        "unauthenticated",
        "key_expired",
        "forbidden",
        "not_found",
        "bad_request",
        "range_too_wide",
        "rate_limited",
        "internal",
      ],
    },
    endpoints: [
      {
        method: "GET",
        path: "/api/v1/employees",
        permissions: ["employee.read.all", "directory.read"],
        filters: ["status", "department", "updated_since", "limit", "offset"],
        description:
          "The employee directory. Never returns compensation, bank or government-ID data.",
        example: `curl ${base}/api/v1/employees?status=ACTIVE -H "Authorization: Bearer ohrm_…"`,
      },
      {
        method: "GET",
        path: "/api/v1/employees/{id_or_code}",
        permissions: ["employee.read.all", "directory.read"],
        description: "One employee, by internal id or by employee code.",
      },
      {
        method: "GET",
        path: "/api/v1/departments",
        permissions: ["org.read", "directory.read", "employee.read.all"],
        description: "Departments with live headcount.",
      },
      {
        method: "GET",
        path: "/api/v1/leave",
        permissions: ["leave.read.all"],
        filters: ["status", "from", "to", "employee_code", "limit", "offset"],
        description:
          "Leave requests. `from` and `to` match anything overlapping the window, not only requests fully inside it.",
      },
      {
        method: "GET",
        path: "/api/v1/attendance",
        permissions: ["attendance.read.all"],
        filters: ["from (required)", "to", "employee_code", "limit", "offset"],
        description: "Attendance records. At most 92 days per call.",
      },
    ],
    webhooks: {
      configure_at: "/settings/webhooks",
      signature: {
        header: "X-OpenHRM-Signature",
        algorithm: "sha256=hex(hmac_sha256(secret, raw_body))",
        note: "Compute over the raw body before parsing — re-serialising changes the bytes.",
      },
      events: WEBHOOK_EVENTS.map((event) => ({
        name: event,
        description: WEBHOOK_EVENT_DESCRIPTIONS[event],
      })),
    },
  });
}
