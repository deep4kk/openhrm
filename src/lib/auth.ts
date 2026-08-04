import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";

import { rawDb } from "./db";
import { generateToken, hashToken } from "./crypto";
import type { PermissionKey, Scope } from "./permissions";
import { resolveScope } from "./permissions";

/**
 * Sessions.
 *
 * A signed JWT in an httpOnly cookie carries only a session id — never the
 * permission list. Permissions are read from the database on every request, so
 * revoking a role takes effect on the user's next click rather than whenever
 * their token happens to expire. That costs one indexed query per request and
 * removes an entire class of "they still had access for 20 minutes" bugs.
 *
 * The matching Session row gives us revocation for free: device list, force
 * logout, and expiry all become row updates.
 */

const SESSION_COOKIE = "openhrm_session";
const SESSION_DAYS = 14;

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    throw new Error(
      "AUTH_SECRET is not set. Generate one with:\n" +
        "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  return new TextEncoder().encode(value);
}

export interface AuthContext {
  sessionId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  org: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    currency: string;
    fiscalYearStartMonth: number;
    workingDays: number[];
    logoUrl: string | null;
  };
  role: {
    id: string;
    key: string;
    name: string;
    permissions: string[];
  };
  /** Null for admin accounts that were never given an employee record. */
  employee: {
    id: string;
    employeeCode: string;
    firstName: string;
    lastName: string;
    displayName: string | null;
    avatarUrl: string | null;
    departmentId: string | null;
    managerId: string | null;
    designationTitle: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Password handling
// ---------------------------------------------------------------------------

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Password rules. Deliberately length-first rather than a symbol-soup policy:
 * long passphrases beat short complex ones, and complexity rules push people
 * toward "Password1!" and sticky notes.
 */
export function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return "Use at least 10 characters — length matters more than symbols.";
  }
  if (password.length > 200) {
    return "That password is too long.";
  }
  if (/^\s|\s$/.test(password)) {
    return "Password cannot start or end with a space.";
  }
  const common = ["password", "12345678", "qwerty", "letmein", "welcome"];
  if (common.some((c) => password.toLowerCase().includes(c))) {
    return "That password contains a very common word. Pick something less guessable.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Creating and ending sessions
// ---------------------------------------------------------------------------

export async function createSession(userId: string, orgId: string) {
  const refreshToken = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const headerList = await headers();
  const session = await rawDb.session.create({
    data: {
      userId,
      orgId,
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 500) ?? null,
      ipAddress: clientIp(headerList),
    },
  });

  const jwt = await new SignJWT({ sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .setSubject(userId)
    .sign(secret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  await rawDb.user.update({
    where: { id: userId },
    data: { lastLoginAt: new Date() },
  });

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      const sid = payload.sid as string | undefined;
      if (sid) {
        await rawDb.session.update({
          where: { id: sid },
          data: { revokedAt: new Date() },
        });
      }
    } catch {
      // An unreadable cookie is already useless; just clear it.
    }
  }

  cookieStore.delete(SESSION_COOKIE);
}

/** Ends every session for a user except optionally the current one. */
export async function revokeAllSessions(userId: string, exceptId?: string) {
  await rawDb.session.updateMany({
    where: {
      userId,
      revokedAt: null,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    data: { revokedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Reading the current session
// ---------------------------------------------------------------------------

/**
 * Resolves the signed-in user, or null.
 *
 * Wrapped in React's `cache` so that a page rendering ten server components
 * performs one database round trip, not ten.
 */
export const getSession = cache(async (): Promise<AuthContext | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let sessionId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    sessionId = payload.sid as string;
    if (!sessionId) return null;
  } catch {
    return null;
  }

  const session = await rawDb.session.findUnique({
    where: { id: sessionId },
    include: {
      org: true,
      user: {
        include: {
          role: true,
          employee: {
            include: { designation: true },
          },
        },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;
  if (session.user.status !== "ACTIVE") return null;

  const { user, org } = session;

  return {
    sessionId: session.id,
    user: { id: user.id, name: user.name, email: user.email },
    org: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      timezone: org.timezone,
      currency: org.currency,
      fiscalYearStartMonth: org.fiscalYearStartMonth,
      workingDays: org.workingDays,
      logoUrl: org.logoUrl,
    },
    role: {
      id: user.role.id,
      key: user.role.key,
      name: user.role.name,
      permissions: user.role.permissions,
    },
    employee: user.employee
      ? {
          id: user.employee.id,
          employeeCode: user.employee.employeeCode,
          firstName: user.employee.firstName,
          lastName: user.employee.lastName,
          displayName: user.employee.displayName,
          avatarUrl: user.employee.avatarUrl,
          departmentId: user.employee.departmentId,
          managerId: user.employee.managerId,
          designationTitle: user.employee.designation?.title ?? null,
        }
      : null,
  };
});

/** For pages: sends anonymous visitors to the login screen. */
export async function requireAuth(): Promise<AuthContext> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/**
 * The authorisation gate. Every protected page and every server action calls
 * this — checks live on the server, never only in the UI (PRD §9, "RBAC
 * enforced at API layer, not just UI").
 */
export async function requirePermission(
  ...required: PermissionKey[]
): Promise<AuthContext> {
  const session = await requireAuth();
  const ok = required.some((key) => session.role.permissions.includes(key));
  if (!ok) {
    redirect("/denied");
  }
  return session;
}

/** Server-action variant: returns an error rather than redirecting. */
export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function assertPermission(
  session: AuthContext,
  ...required: PermissionKey[]
): Promise<void> {
  const ok = required.some((key) => session.role.permissions.includes(key));
  if (!ok) throw new AuthorizationError();
}

export function can(session: AuthContext, permission: PermissionKey): boolean {
  return session.role.permissions.includes(permission);
}

export function canAny(
  session: AuthContext,
  ...permissions: PermissionKey[]
): boolean {
  return permissions.some((p) => session.role.permissions.includes(p));
}

export function scopeFor(session: AuthContext, base: string): Scope | null {
  return resolveScope(session.role.permissions, base);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clientIp(headerList: Headers): string | null {
  const forwarded = headerList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return headerList.get("x-real-ip")?.slice(0, 64) ?? null;
}

export { SESSION_COOKIE };
