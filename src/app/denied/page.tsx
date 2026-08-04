import type { Metadata } from "next";
import Link from "next/link";
import { ShieldOff } from "lucide-react";

import { getSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "No access",
};

/**
 * Shown when a permission check fails.
 *
 * It names the role the viewer holds and tells them who can change it. A bare
 * "403 Forbidden" makes people file a ticket; this makes them ask the right
 * person directly.
 */
export default async function DeniedPage() {
  const session = await getSession();

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="bg-muted text-muted-foreground mb-5 flex size-11 items-center justify-center rounded-lg">
        <ShieldOff className="size-5" aria-hidden="true" />
      </div>

      <h1 className="text-lg font-semibold tracking-tight">
        You don&apos;t have access to that page
      </h1>

      <p className="text-muted-foreground measure mt-2 text-sm">
        {session ? (
          <>
            You&apos;re signed in as <strong>{session.user.name}</strong> with the{" "}
            <strong>{session.role.name}</strong> role, which doesn&apos;t include
            this. An Org Admin can change what your role can reach in Settings →
            Roles.
          </>
        ) : (
          <>Sign in to continue.</>
        )}
      </p>

      <div className="mt-6 flex gap-2">
        <Button
          variant="outline"
          render={<Link href={session ? "/dashboard" : "/login"} />}
        >
          {session ? "Back to home" : "Sign in"}
        </Button>
        {session && (
          <Button variant="ghost" render={<Link href="/about#permissions" />}>
            See what each role can do
          </Button>
        )}
      </div>
    </main>
  );
}
