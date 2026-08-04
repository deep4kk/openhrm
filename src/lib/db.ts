import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Database access, with tenant isolation built into the client itself.
 *
 * PRD §15 flags cross-tenant leakage as the highest-severity failure mode for a
 * multi-tenant HRMS, and the mitigation it asks for is "enforce org_id scoping
 * at the ORM query-builder level + Postgres RLS as a second safety net".
 *
 * That is what this file implements. Two clients are exported:
 *
 *   orgDb(orgId)  — the one you almost always want. Every query against a
 *                   tenant-owned model is rewritten to carry `orgId`. Forgetting
 *                   a `where` clause cannot leak another organisation's data
 *                   because the extension adds it whether you did or not.
 *
 *   rawDb         — unscoped. Legitimately needed in exactly four places:
 *                   resolving a login by email, creating an organisation,
 *                   accepting an invitation, and seeding. Every other use is a
 *                   bug. Grep for it during review.
 *
 * The second net is Postgres row-level security — see the `enable_rls`
 * migration and docs/SECURITY.md. It only engages when the app connects as a
 * non-superuser role, which is the documented production configuration.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at a Postgres instance " +
        "(`npm run db:dev` starts a local one).",
    );
  }

  // Prisma 7 talks to Postgres through a driver adapter rather than its own
  // query engine binary, which is what lets this run unchanged on serverless
  // hosts as well as a self-hosted container.
  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const rawDb = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rawDb;

/**
 * Models that belong to exactly one organisation. Every one of these carries an
 * `orgId` column. If you add a tenant-owned model to the schema, add it here —
 * the test in src/lib/__tests__/tenancy.test.ts fails if the two drift apart.
 */
export const TENANT_MODELS = new Set([
  "User",
  "Role",
  "Session",
  "Invitation",
  "Department",
  "Designation",
  "Location",
  "Employee",
  "CustomFieldDefinition",
  "CustomFieldValue",
  "Shift",
  "AttendanceRecord",
  "AttendanceRegularization",
  "Holiday",
  "LeaveType",
  "LeaveBalance",
  "LeaveLedgerEntry",
  "LeaveRequest",
  "Notification",
  "Announcement",
  "AuditLog",
]);

/** Reads and writes that must be constrained to a single organisation. */
const READ_OPERATIONS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
]);

const WHERE_OPERATIONS = new Set([
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

type AnyArgs = Record<string, unknown>;

function withOrgFilter(where: unknown, orgId: string): AnyArgs {
  return { ...((where as AnyArgs) ?? {}), orgId };
}

/**
 * Returns a Prisma client permanently bound to one organisation.
 *
 * Cheap to call — the extension wraps the shared connection pool rather than
 * opening a new one, so calling it per request is correct and intended.
 */
export function orgDb(orgId: string) {
  if (!orgId) {
    // A missing tenant id is never a recoverable condition: continuing would
    // run an unscoped query. Fail loudly instead.
    throw new Error("orgDb() called without an organisation id");
  }

  return rawDb.$extends({
    name: "tenant-isolation",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) {
            return query(args);
          }

          const nextArgs = { ...(args as AnyArgs) };

          if (READ_OPERATIONS.has(operation) || WHERE_OPERATIONS.has(operation)) {
            nextArgs.where = withOrgFilter(nextArgs.where, orgId);
            return query(nextArgs);
          }

          // `findUnique` only accepts unique fields, so an extra `orgId` filter
          // would be rejected. Downgrading to `findFirst` keeps the same
          // semantics (unique lookup) while letting us constrain the tenant.
          if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            nextArgs.where = withOrgFilter(nextArgs.where, orgId);
            const downgraded =
              operation === "findUnique" ? "findFirst" : "findFirstOrThrow";
            const delegate = (
              rawDb as unknown as Record<
                string,
                Record<string, (a: unknown) => unknown>
              >
            )[lowerFirst(model)];
            return delegate[downgraded](nextArgs);
          }

          if (operation === "create") {
            nextArgs.data = { ...((nextArgs.data as AnyArgs) ?? {}), orgId };
            return query(nextArgs);
          }

          if (operation === "createMany" || operation === "createManyAndReturn") {
            const data = nextArgs.data;
            nextArgs.data = Array.isArray(data)
              ? data.map((row) => ({ ...(row as AnyArgs), orgId }))
              : { ...((data as AnyArgs) ?? {}), orgId };
            return query(nextArgs);
          }

          if (operation === "upsert") {
            nextArgs.where = withOrgFilter(nextArgs.where, orgId);
            nextArgs.create = {
              ...((nextArgs.create as AnyArgs) ?? {}),
              orgId,
            };
            return query(nextArgs);
          }

          // Anything unrecognised is refused rather than passed through
          // unscoped — new Prisma operations must be reviewed before use.
          throw new Error(
            `orgDb: operation "${operation}" on tenant model "${model}" is not tenant-scoped. ` +
              `Add explicit handling in src/lib/db.ts before using it.`,
          );
        },
      },
    },
  });
}

export type OrgClient = ReturnType<typeof orgDb>;

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

/**
 * Runs work inside a transaction that also publishes the tenant id to Postgres
 * as `app.current_org_id`, which is what the row-level-security policies read.
 *
 * Only meaningful when the connection is a non-superuser role (superusers and
 * table owners bypass RLS). Used for raw SQL and reporting queries that sidestep
 * the Prisma query builder and therefore the extension above.
 */
export async function withOrgContext<T>(
  orgId: string,
  fn: (tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">) => Promise<T>,
): Promise<T> {
  return rawDb.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org_id', $1, true)`,
      orgId,
    );
    return fn(tx);
  });
}
