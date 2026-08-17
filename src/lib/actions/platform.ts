"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { orgDb, rawDb } from "../db";
import { assertPermission, requireAuth, revokeAllSessions } from "../auth";
import { audit } from "../audit";
import { generateToken, hashToken } from "../crypto";
import { ALL_PERMISSION_KEYS, SYSTEM_ROLES } from "../permissions";
import { WEBHOOK_EVENTS } from "../webhooks";
import { fieldErrorsFrom } from "./form";
import type { FormState } from "./auth";

/**
 * Platform administration (PRD §8.27, §8.28, §8.29).
 *
 * Roles, API keys, webhooks, branding and integrations. What they have in
 * common is that each one can hand out or take away power, so every action here
 * is audited and several of them refuse operations that would lock the
 * organisation out of its own account.
 */

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the role").max(60),
  description: z.string().trim().max(300).optional(),
  permissions: z.string(),
});

export async function saveRoleAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "role.manage");

  const parsed = roleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let permissions: string[];
  try {
    permissions = z
      .array(z.string())
      .parse(JSON.parse(parsed.data.permissions))
      // An unknown key would silently grant nothing and be invisible in the UI.
      .filter((key) => (ALL_PERMISSION_KEYS as string[]).includes(key));
  } catch {
    return { error: "Could not read the permission selection." };
  }

  const db = orgDb(session.org.id);
  const { id, name, description } = parsed.data;

  const clash = await db.role.findFirst({
    where: { name, ...(id ? { NOT: { id } } : {}) },
  });
  if (clash) return { fieldErrors: { name: "A role with that name exists." } };

  if (id) {
    const existing = await db.role.findFirst({ where: { id } });
    if (!existing) return { error: "That role no longer exists." };

    // The last door out of the building. Removing `role.manage` from the only
    // role that has it leaves nobody able to put it back, and support for a
    // self-hosted install is "restore from backup".
    if (existing.permissions.includes("role.manage") &&
        !permissions.includes("role.manage")) {
      const others = await db.role.count({
        where: { NOT: { id }, permissions: { has: "role.manage" } },
      });
      if (others === 0) {
        return {
          error:
            "This is the only role that can manage permissions. Grant it to another role first, or nobody will be able to change them again.",
        };
      }
    }

    await db.role.update({
      where: { id },
      data: { name, description: description || null, permissions },
    });

    await audit(session, {
      action: "role.updated",
      entityType: "Role",
      entityId: id,
      summary: `Updated role "${name}" — ${permissions.length} permissions`,
      before: { permissions: existing.permissions },
      after: { permissions },
    });
  } else {
    const created = await db.role.create({
      data: {
        orgId: session.org.id,
        key: slugify(name),
        name,
        description: description || null,
        permissions,
        isSystem: false,
      },
    });

    await audit(session, {
      action: "role.created",
      entityType: "Role",
      entityId: created.id,
      summary: `Created role "${name}" with ${permissions.length} permissions`,
      after: { permissions },
    });
  }

  revalidatePath("/settings/roles");
  return { success: true };
}

export async function deleteRoleAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "role.manage");

  const db = orgDb(session.org.id);
  const role = await db.role.findFirst({
    where: { id },
    include: { _count: { select: { users: true } } },
  });
  if (!role) return { error: "That role no longer exists." };

  if (role.isSystem) {
    return {
      error:
        "Built-in roles can't be deleted. Edit its permissions, or make a custom role and move people to it.",
    };
  }
  if (role._count.users > 0) {
    return {
      error: `${role._count.users} ${role._count.users === 1 ? "person is" : "people are"} on this role. Move them first.`,
    };
  }

  await db.role.delete({ where: { id } });

  await audit(session, {
    action: "role.deleted",
    entityType: "Role",
    entityId: id,
    summary: `Deleted role "${role.name}"`,
  });

  revalidatePath("/settings/roles");
  return { success: true };
}

/** Restores a built-in role to the permission set the code ships with. */
export async function resetSystemRoleAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "role.manage");

  const db = orgDb(session.org.id);
  const role = await db.role.findFirst({ where: { id } });
  if (!role) return { error: "That role no longer exists." };
  if (!role.isSystem) return { error: "That isn't a built-in role." };

  const definition = SYSTEM_ROLES.find((r) => r.key === role.key);
  if (!definition) return { error: "No definition ships for that role." };

  await db.role.update({
    where: { id },
    data: { permissions: [...definition.permissions] },
  });

  await audit(session, {
    action: "role.updated",
    entityType: "Role",
    entityId: id,
    summary: `Reset "${role.name}" to its shipped permissions`,
    before: { permissions: role.permissions },
    after: { permissions: definition.permissions },
  });

  revalidatePath("/settings/roles");
  return { success: true };
}

export async function changeUserRoleAction(
  userId: string,
  roleId: string,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "role.manage");

  const db = orgDb(session.org.id);
  const [user, role] = await Promise.all([
    db.user.findFirst({ where: { id: userId }, include: { role: true } }),
    db.role.findFirst({ where: { id: roleId } }),
  ]);

  if (!user) return { error: "That user no longer exists." };
  if (!role) return { error: "That role no longer exists." };

  // Demoting yourself out of role management is the same lockout as above,
  // arrived at from a different direction.
  if (
    user.id === session.user.id &&
    user.role.permissions.includes("role.manage") &&
    !role.permissions.includes("role.manage")
  ) {
    const others = await db.user.count({
      where: {
        NOT: { id: userId },
        status: "ACTIVE",
        role: { permissions: { has: "role.manage" } },
      },
    });
    if (others === 0) {
      return {
        error:
          "You are the only person who can manage roles. Give someone else that permission before removing your own.",
      };
    }
  }

  await db.user.update({ where: { id: userId }, data: { roleId } });

  await audit(session, {
    action: "user.role.changed",
    entityType: "User",
    entityId: userId,
    summary: `${user.name}: ${user.role.name} → ${role.name}`,
  });

  // A permission change takes effect on the next request because permissions
  // are read per request (see src/lib/auth.ts) — no session invalidation
  // needed. Sessions are only cut when an account is suspended.
  revalidatePath("/settings/roles");
  revalidatePath("/settings/people");
  return { success: true };
}

export async function setUserStatusAction(
  userId: string,
  status: "ACTIVE" | "SUSPENDED",
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "role.manage");

  if (userId === session.user.id) {
    return { error: "You can't suspend your own account." };
  }

  const db = orgDb(session.org.id);
  const user = await db.user.findFirst({ where: { id: userId } });
  if (!user) return { error: "That user no longer exists." };

  await db.user.update({ where: { id: userId }, data: { status } });

  if (status === "SUSPENDED") {
    await revokeAllSessions(userId);
  }

  await audit(session, {
    action: "user.suspended",
    entityType: "User",
    entityId: userId,
    summary: `${user.name} ${status === "SUSPENDED" ? "suspended and signed out everywhere" : "reactivated"}`,
  });

  revalidatePath("/settings/roles");
  return { success: true };
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || `role_${Date.now()}`
  );
}

// ---------------------------------------------------------------------------
// API keys
// ---------------------------------------------------------------------------

const apiKeySchema = z.object({
  name: z.string().trim().min(2, "Name the key").max(60),
  permissions: z.string(),
  expiresInDays: z.string().optional(),
});

/**
 * Issuing an API key.
 *
 * The plaintext is returned once, in the action's result, and never stored —
 * only a SHA-256 hash goes to the database. Two consequences worth knowing:
 * a database dump hands over no working credentials, and a lost key cannot be
 * recovered, only replaced. The UI says both.
 *
 * A key can never exceed the permissions of the person issuing it. Otherwise
 * "manage API keys" would quietly be a privilege-escalation permission.
 */
export async function createApiKeyAction(
  _prev: FormState & { plaintext?: string },
  formData: FormData,
): Promise<FormState & { plaintext?: string }> {
  const session = await requireAuth();
  await assertPermission(session, "apikey.manage");

  const parsed = apiKeySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let requested: string[];
  try {
    requested = z.array(z.string()).parse(JSON.parse(parsed.data.permissions));
  } catch {
    return { error: "Could not read the permission selection." };
  }

  const granted = requested.filter(
    (key) =>
      (ALL_PERMISSION_KEYS as string[]).includes(key) &&
      session.role.permissions.includes(key),
  );

  if (granted.length === 0) {
    return {
      fieldErrors: {
        permissions: "Choose at least one permission that you hold yourself.",
      },
    };
  }

  const days = parsed.data.expiresInDays
    ? Number(parsed.data.expiresInDays)
    : null;

  // `ohrm_` makes a leaked key greppable in logs and scanning tools.
  const secret = `ohrm_${generateToken(24)}`;

  const key = await orgDb(session.org.id).apiKey.create({
    data: {
      orgId: session.org.id,
      name: parsed.data.name,
      prefix: secret.slice(0, 13),
      keyHash: hashToken(secret),
      permissions: granted,
      createdById: session.user.id,
      expiresAt:
        days && days > 0 ? new Date(Date.now() + days * 86_400_000) : null,
    },
  });

  await audit(session, {
    action: "apikey.created",
    entityType: "ApiKey",
    entityId: key.id,
    summary: `Issued API key "${parsed.data.name}" with ${granted.length} permissions`,
    after: { permissions: granted },
  });

  revalidatePath("/settings/api-keys");
  return { success: true, plaintext: secret };
}

export async function revokeApiKeyAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "apikey.manage");

  const db = orgDb(session.org.id);
  const key = await db.apiKey.findFirst({ where: { id } });
  if (!key) return { error: "That key no longer exists." };

  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });

  await audit(session, {
    action: "apikey.revoked",
    entityType: "ApiKey",
    entityId: id,
    summary: `Revoked API key "${key.name}"`,
  });

  revalidatePath("/settings/api-keys");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------

const webhookSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Name the endpoint").max(60),
  url: z.string().trim().url("That isn't a URL").max(2000),
  events: z.string(),
});

export async function saveWebhookAction(
  _prev: FormState & { secret?: string },
  formData: FormData,
): Promise<FormState & { secret?: string }> {
  const session = await requireAuth();
  await assertPermission(session, "webhook.manage");

  const parsed = webhookSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let events: string[];
  try {
    events = z
      .array(z.string())
      .parse(JSON.parse(parsed.data.events))
      .filter((event) => (WEBHOOK_EVENTS as readonly string[]).includes(event));
  } catch {
    return { error: "Could not read the event selection." };
  }

  if (events.length === 0) {
    return { fieldErrors: { events: "Choose at least one event." } };
  }

  const url = new URL(parsed.data.url);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    return {
      fieldErrors: {
        url: "Use https. The payload carries employee data and a plain http endpoint sends it in the clear.",
      },
    };
  }

  const db = orgDb(session.org.id);

  if (parsed.data.id) {
    await db.webhookEndpoint.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        url: parsed.data.url,
        events,
        // Editing a failing endpoint is how you fix it, so saving un-pauses it.
        status: "ACTIVE",
        failureCount: 0,
      },
    });

    await audit(session, {
      action: "webhook.updated",
      entityType: "WebhookEndpoint",
      entityId: parsed.data.id,
      summary: `Updated webhook "${parsed.data.name}" — ${events.length} events`,
    });

    revalidatePath("/settings/webhooks");
    return { success: true };
  }

  const secret = `whsec_${generateToken(24)}`;

  const endpoint = await db.webhookEndpoint.create({
    data: {
      orgId: session.org.id,
      name: parsed.data.name,
      url: parsed.data.url,
      secret,
      events,
      createdById: session.user.id,
    },
  });

  await audit(session, {
    action: "webhook.created",
    entityType: "WebhookEndpoint",
    entityId: endpoint.id,
    summary: `Registered webhook "${parsed.data.name}" for ${events.length} events`,
  });

  revalidatePath("/settings/webhooks");
  return { success: true, secret };
}

export async function deleteWebhookAction(id: string): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "webhook.manage");

  const db = orgDb(session.org.id);
  const endpoint = await db.webhookEndpoint.findFirst({ where: { id } });
  if (!endpoint) return { error: "That endpoint no longer exists." };

  await db.webhookEndpoint.delete({ where: { id } });

  await audit(session, {
    action: "webhook.deleted",
    entityType: "WebhookEndpoint",
    entityId: id,
    summary: `Deleted webhook "${endpoint.name}"`,
  });

  revalidatePath("/settings/webhooks");
  return { success: true };
}

export async function setWebhookStatusAction(
  id: string,
  status: "ACTIVE" | "PAUSED",
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "webhook.manage");

  const db = orgDb(session.org.id);
  const endpoint = await db.webhookEndpoint.findFirst({ where: { id } });
  if (!endpoint) return { error: "That endpoint no longer exists." };

  await db.webhookEndpoint.update({
    where: { id },
    data: { status, ...(status === "ACTIVE" ? { failureCount: 0 } : {}) },
  });

  revalidatePath("/settings/webhooks");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Branding and integrations
// ---------------------------------------------------------------------------

const brandingSchema = z.object({
  brandColor: z.string().trim().max(40).optional(),
  loginTagline: z.string().trim().max(160).optional(),
  supportEmail: z.string().trim().max(254).optional(),
  customDomain: z.string().trim().max(253).optional(),
  faviconUrl: z.string().optional(),
});

export async function saveBrandingAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "branding.manage");

  const parsed = brandingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  const input = parsed.data;

  // The colour lands in a CSS custom property, so it is validated as an OKLCH
  // triple rather than accepted as free text — anything else would be a way to
  // inject declarations into every page.
  if (input.brandColor && !/^[\d.]+\s+[\d.]+\s+[\d.]+$/.test(input.brandColor)) {
    return {
      fieldErrors: {
        brandColor:
          "Give three numbers: lightness chroma hue, like 0.55 0.18 265.",
      },
    };
  }

  if (input.supportEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.supportEmail)) {
    return { fieldErrors: { supportEmail: "That isn't an email address." } };
  }

  if (input.faviconUrl && input.faviconUrl.length > 512 * 1024) {
    return { fieldErrors: { faviconUrl: "Keep the icon under 512 KB." } };
  }

  await orgDb(session.org.id).organization.update({
    where: { id: session.org.id },
    data: {
      brandColor: input.brandColor || null,
      loginTagline: input.loginTagline || null,
      supportEmail: input.supportEmail || null,
      customDomain: input.customDomain || null,
      ...(input.faviconUrl !== undefined
        ? { faviconUrl: input.faviconUrl || null }
        : {}),
    },
  });

  await audit(session, {
    action: "branding.updated",
    entityType: "Organization",
    entityId: session.org.id,
    summary: "Updated branding",
    after: {
      brandColor: input.brandColor ?? null,
      customDomain: input.customDomain ?? null,
    },
  });

  revalidatePath("/settings/branding");
  revalidatePath("/settings");
  return { success: true };
}

const integrationSchema = z.object({
  slackWebhookUrl: z.string().trim().max(2000).optional(),
  teamsWebhookUrl: z.string().trim().max(2000).optional(),
});

export async function saveIntegrationsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "integration.manage");

  const parsed = integrationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  for (const [field, value] of [
    ["slackWebhookUrl", parsed.data.slackWebhookUrl],
    ["teamsWebhookUrl", parsed.data.teamsWebhookUrl],
  ] as const) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") {
        return { fieldErrors: { [field]: "Incoming webhook URLs are https." } };
      }
    } catch {
      return { fieldErrors: { [field]: "That isn't a URL." } };
    }
  }

  await orgDb(session.org.id).organization.update({
    where: { id: session.org.id },
    data: {
      slackWebhookUrl: parsed.data.slackWebhookUrl || null,
      teamsWebhookUrl: parsed.data.teamsWebhookUrl || null,
    },
  });

  await audit(session, {
    action: "integration.updated",
    entityType: "Organization",
    entityId: session.org.id,
    summary: `Chat notifications ${
      parsed.data.slackWebhookUrl || parsed.data.teamsWebhookUrl
        ? "connected"
        : "disconnected"
    }`,
  });

  revalidatePath("/settings/integrations");
  return { success: true };
}

/** Fires a test payload so a new endpoint can be verified before it matters. */
export async function testChatIntegrationAction(): Promise<FormState> {
  const session = await requireAuth();
  await assertPermission(session, "integration.manage");

  const org = await rawDb.organization.findUnique({
    where: { id: session.org.id },
    select: { slackWebhookUrl: true, teamsWebhookUrl: true },
  });

  if (!org?.slackWebhookUrl && !org?.teamsWebhookUrl) {
    return { error: "No chat webhook is configured yet." };
  }

  const { notifyChat } = await import("../webhooks");
  await notifyChat(
    session.org.id,
    `✅ Test message from OpenHRM, sent by ${session.user.name}.`,
  );

  return { success: true };
}
