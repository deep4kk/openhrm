import { NextResponse } from "next/server";
import { rawDb } from "@/lib/db";

/**
 * Liveness/readiness probe.
 *
 * Checks the database rather than just returning 200, because an app that has
 * lost its database is not healthy — it just hasn't crashed yet. Used by the
 * compose healthcheck and by any load balancer in front of the container.
 *
 * Deliberately returns nothing about the environment: a health endpoint is
 * unauthenticated, so it must not leak version numbers or connection details.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await rawDb.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "degraded" }, { status: 503 });
  }
}
