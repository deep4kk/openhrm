import type { Metadata } from "next";
import Link from "next/link";

import { rawDb } from "@/lib/db";
import { hashToken } from "@/lib/crypto";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";

export const metadata: Metadata = { title: "Accept invitation" };

/**
 * Invitation acceptance.
 *
 * The link carries a random token; only its digest is stored, so the database
 * never holds anything replayable. An expired or already-used link explains
 * itself rather than showing a broken form.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const invitation = await rawDb.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      org: { select: { name: true } },
      role: { select: { name: true } },
    },
  });

  const invalid =
    !invitation ||
    invitation.status !== "PENDING" ||
    invitation.expiresAt < new Date();

  if (invalid) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold tracking-tight">
          This invitation isn&apos;t valid any more
        </h1>
        <p className="text-muted-foreground measure text-sm leading-relaxed">
          It may have expired, already been used, or been replaced by a newer
          one. Ask whoever invited you to send another — it only takes a moment.
        </p>
        <Link
          href="/login"
          className="text-brand inline-block text-sm font-medium underline-offset-4 hover:underline"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      email={invitation.email}
      name={invitation.name ?? ""}
      orgName={invitation.org.name}
      roleName={invitation.role.name}
    />
  );
}
