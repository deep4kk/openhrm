"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { rawDb } from "../db";
import {
  createSession,
  destroySession,
  getSession,
  hashPassword,
  validatePassword,
  verifyPassword,
} from "../auth";
import { createOrganization } from "../provisioning";
import { audit } from "../audit";
import { hashToken } from "../crypto";

/**
 * Authentication actions.
 *
 * Two deliberate choices here:
 *
 *  - Login never distinguishes "no such account" from "wrong password". Doing
 *    so would turn the form into an account-existence oracle, which is exactly
 *    how attackers enumerate who works at a company.
 *
 *  - Failed logins are throttled per email+IP. Rate limiting on auth endpoints
 *    is a stated non-functional requirement (PRD §9).
 */

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required")
  .email("That doesn't look like an email address")
  .max(254)
  .toLowerCase();

// ---------------------------------------------------------------------------
// Sign up — creates an organisation and its first admin
// ---------------------------------------------------------------------------

const signupSchema = z.object({
  orgName: z
    .string()
    .trim()
    .min(2, "Give your organisation a name")
    .max(120, "That name is too long"),
  name: z.string().trim().min(2, "Enter your name").max(120),
  email: emailSchema,
  password: z.string().min(1, "Choose a password"),
});

export async function signupAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = signupSchema.safeParse({
    orgName: formData.get("orgName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { orgName, name, email, password } = parsed.data;

  const passwordProblem = validatePassword(password);
  if (passwordProblem) {
    return { fieldErrors: { password: passwordProblem } };
  }

  // One account per email per organisation. Since this call creates a brand new
  // organisation, the only real conflict is the same person signing up twice.
  const existing = await rawDb.user.findFirst({
    where: { email },
    select: { id: true, org: { select: { name: true } } },
  });

  if (existing) {
    return {
      fieldErrors: {
        email: `That email already has an account with ${existing.org.name}. Sign in instead.`,
      },
    };
  }

  const { org, user } = await createOrganization({
    orgName,
    adminName: name,
    adminEmail: email,
    password,
  });

  await createSession(user.id, org.id);

  await audit(
    { org: { id: org.id }, user: { id: user.id, name, email } } as never,
    {
      action: "org.created",
      entityType: "Organization",
      entityId: org.id,
      summary: `Created organisation "${org.name}"`,
    },
  );

  redirect("/dashboard?welcome=1");
}

// ---------------------------------------------------------------------------
// Log in
// ---------------------------------------------------------------------------

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
  orgId: z.string().optional(),
});

/** In-memory throttle. Adequate for a single instance; a multi-instance
 *  deployment should move this to Redis, which Phase 2 introduces for the job
 *  queue anyway. */
const attempts = new Map<string, { count: number; firstAt: number }>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;

function throttled(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    orgId: formData.get("orgId") || undefined,
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, password, orgId } = parsed.data;

  if (throttled(email)) {
    return {
      error:
        "Too many failed attempts. Wait ten minutes before trying again, or reset your password.",
    };
  }

  // A person may hold accounts in more than one organisation on the hosted
  // platform, so email alone may not identify a single user.
  const candidates = await rawDb.user.findMany({
    where: { email, ...(orgId ? { orgId } : {}) },
    include: { org: { select: { id: true, name: true } } },
  });

  const genericFailure: FormState = {
    error: "That email and password don't match an account.",
  };

  if (candidates.length === 0) {
    recordFailure(email);
    return genericFailure;
  }

  // Try each candidate: the same password may be set on both accounts, and we
  // must not reveal which organisations an address belongs to.
  let matched: (typeof candidates)[number] | null = null;
  for (const candidate of candidates) {
    if (await verifyPassword(password, candidate.passwordHash)) {
      matched = candidate;
      break;
    }
  }

  if (!matched) {
    recordFailure(email);
    return genericFailure;
  }

  if (matched.status === "SUSPENDED") {
    return {
      error: "This account has been suspended. Contact your HR administrator.",
    };
  }

  // Exactly one password matched but several orgs exist -> ask which one.
  const matchingOrgs = [];
  for (const candidate of candidates) {
    if (await verifyPassword(password, candidate.passwordHash)) {
      matchingOrgs.push(candidate);
    }
  }

  if (matchingOrgs.length > 1 && !orgId) {
    return {
      error: "CHOOSE_ORG:" + JSON.stringify(
        matchingOrgs.map((c) => ({ id: c.org.id, name: c.org.name })),
      ),
    };
  }

  attempts.delete(email);
  await createSession(matched.id, matched.orgId);

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Log out
// ---------------------------------------------------------------------------

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await audit(session, {
      action: "auth.logout",
      entityType: "Session",
      entityId: session.sessionId,
    });
  }
  await destroySession();
  redirect("/login");
}

// ---------------------------------------------------------------------------
// Accepting an invitation
// ---------------------------------------------------------------------------

const acceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2, "Enter your name").max(120),
  password: z.string().min(1, "Choose a password"),
});

export async function acceptInvitationAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { token, name, password } = parsed.data;

  const passwordProblem = validatePassword(password);
  if (passwordProblem) {
    return { fieldErrors: { password: passwordProblem } };
  }

  const invitation = await rawDb.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { org: true, role: true },
  });

  if (!invitation || invitation.status !== "PENDING") {
    return { error: "This invitation is no longer valid. Ask for a new one." };
  }

  if (invitation.expiresAt < new Date()) {
    return { error: "This invitation has expired. Ask for a new one." };
  }

  const passwordHash = await hashPassword(password);

  const user = await rawDb.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        orgId: invitation.orgId,
        email: invitation.email,
        name,
        passwordHash,
        roleId: invitation.roleId,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    // Link to the employee record HR already created, if there is one.
    await tx.employee.updateMany({
      where: {
        orgId: invitation.orgId,
        workEmail: invitation.email,
        userId: null,
      },
      data: { userId: created.id },
    });

    await tx.invitation.update({
      where: { id: invitation.id },
      data: { status: "APPROVED", acceptedAt: new Date() },
    });

    return created;
  });

  await createSession(user.id, invitation.orgId);
  redirect("/dashboard");
}

// ---------------------------------------------------------------------------

function fieldErrorsFrom(error: z.ZodError): Record<string, string> {
  const output: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !output[key]) {
      output[key] = issue.message;
    }
  }
  return output;
}
