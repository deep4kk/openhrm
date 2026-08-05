# Security

How OpenHRM protects tenant data, and what you have to do correctly when you
self-host it.

---

## Tenant isolation

The hosted version holds many organisations in one database. PRD §15 names
cross-tenant leakage as the highest-severity failure mode for this product, and
the mitigation is two independent layers. Either alone would be a single point
of failure.

### Layer 1 — the application (always on)

`src/lib/db.ts` exports `orgDb(orgId)`, a Prisma client permanently bound to one
organisation. It rewrites every query against a tenant-owned model to carry that
`orgId`:

- reads and `where`-bearing writes get `orgId` merged into the filter
- `findUnique` is downgraded to `findFirst`, because a unique lookup cannot
  accept an extra filter and would otherwise escape scoping
- `create` / `createMany` / `upsert` have `orgId` injected into the data, and
  the injected value **wins** over anything the caller passed
- any operation the extension doesn't explicitly know how to scope **throws**
  rather than passing through unscoped

The unscoped client, `rawDb`, is legitimately needed in exactly four places:
resolving a login by email, creating an organisation, accepting an invitation,
and seeding. Every other use is a bug — grep for it in review.

### Layer 2 — Postgres row-level security (production only)

`prisma/migrations/*_enable_rls` enables RLS on every tenant table with:

```sql
USING ("orgId" = current_setting('app.current_org_id', true))
```

It **fails closed**: with no tenant set, `current_setting(..., true)` is NULL,
the comparison is NULL, and no rows are returned. A bug that loses tenant
context returns nothing rather than everything.

**This only works if the app is not a superuser or table owner.** Postgres
exempts both from RLS, even with `FORCE ROW LEVEL SECURITY`. So:

- migrations run as `postgres` (owner — needs DDL)
- the app connects as `openhrm_app` (no DDL, subject to RLS)

`docker/init-db.sh` creates that role on first boot, and `docker-compose.yml`
points `DATABASE_URL` at it while `MIGRATE_DATABASE_URL` uses the owner.

> **In local development you connect as the owner**, so RLS is inert and layer 1
> is the only guarantee. That's fine for development and is stated plainly on
> the in-app About page. Do not let it be the arrangement in production.

If you deploy outside Docker Compose, replicate this: create a restricted role,
grant it `SELECT, INSERT, UPDATE, DELETE` and nothing more, and connect the app
as that role.

---

## Encryption at rest

Bank account numbers, PAN and Aadhaar are encrypted by the application before
they reach Postgres (`src/lib/crypto.ts`), with **AES-256-GCM**:

- a fresh random 96-bit IV per value, so the same account number never produces
  the same ciphertext and these columns cannot be equality-matched or correlated
- authenticated, so tampering is detected instead of decrypting into garbage
- a `v1.` prefix, so the algorithm can be rotated later without guessing

Disk encryption does not replace this. Disk encryption protects a stolen drive;
it does nothing about a leaked backup, an over-broad `SELECT`, or a support
engineer with read access.

### The key

`ENCRYPTION_KEY` is 32 random bytes, base64-encoded:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**Losing it makes those columns permanently unreadable.** There is no recovery
path, by design.

Back it up **separately from your database backups**. A backup archive that
contains both the dump and the key is a single point of compromise and throws
away the entire benefit.

---

## Authentication

- **Passwords** are bcrypt at cost 12. The policy is length-first (10 character
  minimum, common passwords rejected) rather than symbol requirements, which
  push people toward `Password1!` and sticky notes.
- **Sessions** are signed JWTs in an httpOnly, SameSite=Lax cookie carrying only
  a session id — never the permission list. Permissions are read from the
  database on every request, so revoking a role takes effect on the user's next
  click rather than whenever their token happens to expire.
- **Refresh and invitation tokens** are stored only as SHA-256 digests, so a
  database leak cannot be replayed as a login. (SHA-256 rather than bcrypt is
  correct here: these are 256 bits of randomness, not user-chosen secrets, so
  there is no dictionary to attack.)
- **Failed logins** are throttled per email (8 attempts / 10 minutes) and the
  form never distinguishes "no such account" from "wrong password" — otherwise
  it becomes an oracle for who works at a company.

> The throttle is in-process. A multi-instance deployment should move it to
> Redis, which Phase 2 introduces anyway for the job queue.

---

## Authorisation

Roles are database rows holding an array of permission keys, not hardcoded
enums. Every check is a permission check — never `if (role === 'ADMIN')` — so an
Org Admin can compose a "Payroll-only HR" or "Read-only Auditor" role without a
code change.

Read and approve permissions come in three widths: `self`, `team` (the whole
reporting subtree, resolved by recursive CTE in `src/lib/scope.ts`) and `all`.

**Every check runs on the server.** Hiding a nav item or a button is a courtesy
so people don't click into a 403; it is never the control. Pages call
`requirePermission()`, actions call `assertPermission()`, and queries apply the
caller's scope before touching the database.

---

## Audit trail

`audit_logs` is append-only. Nothing in the application updates or deletes rows
in it, and the actor's name is denormalised onto each entry so the record
survives the user being deleted.

It records data **access**, not just data changes: revealing someone's bank
details or salary writes an entry naming who looked. Values that must never
appear in the log — password hashes, tokens, decrypted account numbers — are
redacted to a marker, so the *fact* of a change is recorded without the value.

---

## Reporting a vulnerability

Please open a private security advisory on the repository rather than a public
issue.
