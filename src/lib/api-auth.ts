import "server-only";

import { rawDb } from "./db";
import { hashToken } from "./crypto";
import type { PermissionKey } from "./permissions";

/**
 * Authentication for the public API (PRD §8.27).
 *
 * A key is presented as a bearer token, looked up by the hash of the whole
 * string, and resolved to an organisation plus a permission list. Three
 * properties this is built to have:
 *
 *  1. The plaintext key is never stored, so this lookup is by hash and a
 *     database dump yields nothing usable.
 *  2. The key carries its own permission list, always a subset of what the
 *     issuer held. `apiKey.manage` therefore cannot be used to escalate.
 *  3. Every request is scoped to the key's organisation before any query runs.
 *     There is no code path in an API route that can name a different tenant.
 *
 * Rate limiting is deliberately in-process rather than in Redis. On a
 * self-hosted single container that is exactly right; behind more than one
 * replica it becomes per-replica, which is documented rather than pretended
 * away — the fix is to move this map to the Redis the compose file already
 * starts.
 */

export interface ApiContext {
  orgId: string;
  keyId: string;
  keyName: string;
  permissions: string[];
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const RATE_LIMIT = 120;
const WINDOW_MS = 60_000;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(keyId: string): void {
  const now = Date.now();
  const bucket = buckets.get(keyId);

  if (!bucket || bucket.resetAt < now) {
    buckets.set(keyId, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }

  bucket.count += 1;
  if (bucket.count > RATE_LIMIT) {
    throw new ApiError(
      429,
      "rate_limited",
      `More than ${RATE_LIMIT} requests in a minute. Try again shortly.`,
    );
  }
}

/**
 * Resolves the caller, or throws an ApiError the route handler turns into a
 * response. Updates `lastUsedAt` so a key nobody is using is visible as such
 * in the settings screen.
 */
export async function authenticateRequest(
  request: Request,
): Promise<ApiContext> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new ApiError(
      401,
      "unauthenticated",
      "Send your key as `Authorization: Bearer ohrm_…`.",
    );
  }

  const token = header.slice(7).trim();
  if (!token) {
    throw new ApiError(401, "unauthenticated", "Empty bearer token.");
  }

  const key = await rawDb.apiKey.findUnique({
    where: { keyHash: hashToken(token) },
    select: {
      id: true,
      orgId: true,
      name: true,
      permissions: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  // One message for "wrong key" and "no key": distinguishing them turns this
  // endpoint into an oracle for whether a guessed key exists.
  if (!key || key.revokedAt) {
    throw new ApiError(401, "unauthenticated", "That key is not valid.");
  }
  if (key.expiresAt && key.expiresAt < new Date()) {
    throw new ApiError(401, "key_expired", "That key has expired.");
  }

  rateLimit(key.id);

  // Fire and forget: a failed timestamp write must not fail the request.
  void rawDb.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => undefined);

  return {
    orgId: key.orgId,
    keyId: key.id,
    keyName: key.name,
    permissions: key.permissions,
  };
}

export function requireApiPermission(
  context: ApiContext,
  ...required: PermissionKey[]
): void {
  const ok = required.some((key) => context.permissions.includes(key));
  if (!ok) {
    throw new ApiError(
      403,
      "forbidden",
      `This key needs one of: ${required.join(", ")}.`,
    );
  }
}

/** Consistent JSON envelope, so a client can parse success and failure alike. */
export function apiJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, {
    ...init,
    headers: {
      "cache-control": "no-store",
      ...init.headers,
    },
  });
}

export function apiError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status, headers: { "cache-control": "no-store" } },
    );
  }

  console.error("[api] unhandled error", error);
  return Response.json(
    { error: { code: "internal", message: "Something went wrong." } },
    { status: 500 },
  );
}

/** Shared paging, capped so a single call cannot ask for the whole table. */
export function readPaging(request: Request): { take: number; skip: number } {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  return {
    take: Number.isFinite(limit) ? Math.min(Math.max(1, limit), 200) : 50,
    skip: Number.isFinite(offset) ? Math.max(0, offset) : 0,
  };
}
