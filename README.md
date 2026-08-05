# OpenHRM

A free, open-source HR management system — employee records, attendance and
leave in one place. Run it hosted, or download it and run it on your own server
with your data staying yours.

No per-employee pricing, no paid tier, no feature held back.

---

## What's built

This repository is **Phase 1** of [the roadmap](prd.md#14-release-roadmap-phased):

| Module | State |
|---|---|
| Accounts, organisations, invitations | ✅ Built |
| Roles & granular permissions | ✅ Built |
| Employee database (Core HR) | ✅ Built |
| Attendance & regularisation | ✅ Built |
| Leave — accrual, balances, approvals | ✅ Built |
| Employee self-service | ✅ Built |
| Dashboards & reports | ✅ Built |
| Notifications (in-app + email) | ✅ Built |
| Payroll, ATS, performance, LMS | Later phases — not in this build |

The in-app **About** page documents how each part works, including the full
permission matrix, generated from the same code the server enforces.

---

## Run it locally

Requires Node 22+.

```bash
git clone <your-fork> openhrm && cd openhrm
npm install

cp .env.example .env
# Generate the two secrets .env asks for:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

npm run db:dev      # starts a local Postgres, prints its DATABASE_URL
# paste that DATABASE_URL into .env, then:

npm run db:deploy   # create the schema
npm run db:seed     # load a demo organisation (optional but recommended)
npm run dev
```

Open <http://localhost:3000>.

`npm run db:seed` creates **Meridian Labs** — 31 employees, two months of
attendance, real reporting lines and pending approvals — plus one account per
role so you can see the product from each angle:

| Email | Role | Sees |
|---|---|---|
| `admin@meridianlabs.example` | Org Admin | Everything |
| `hr@meridianlabs.example` | HR Manager | Everyone, minus role management |
| `manager@meridianlabs.example` | Manager | Their reporting line only |
| `employee@meridianlabs.example` | Employee | Themselves only |

Password for all four: `openhrm-demo-2026`

Signing in as the manager and then the employee is the quickest way to see the
permission model working — the sidebar, the tables and the approvals all change.

---

## Self-host with Docker

```bash
cp .env.example .env
# Set AUTH_SECRET, ENCRYPTION_KEY, POSTGRES_PASSWORD, POSTGRES_APP_PASSWORD
docker compose up -d
```

That's the whole thing: app, Postgres, Redis and MinIO. Migrations run
automatically on boot. Open <http://localhost:3000> and create your organisation.

To upgrade, pull and rebuild — migrations are versioned and apply themselves:

```bash
git pull && docker compose up -d --build
```

### Back up

```bash
docker compose exec postgres pg_dump -U postgres openhrm | gzip > openhrm-$(date +%F).sql.gz
```

Back up `ENCRYPTION_KEY` **separately from the database dump**. The dump alone
is useless without it, which is the point — and the key alone is useless without
the dump. Storing both together throws that away.

### Restore

```bash
gunzip -c openhrm-2026-08-05.sql.gz | docker compose exec -T postgres psql -U postgres openhrm
```

---

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:dev` | Local Postgres (no Docker needed) |
| `npm run db:migrate` | Create a migration from schema changes |
| `npm run db:deploy` | Apply pending migrations |
| `npm run db:seed` | Load the demo organisation |
| `npm run db:studio` | Browse the database |
| `npm run db:reset` | Drop, re-migrate, re-seed |

---

## How it's built

- **Next.js (App Router)** with React server components. Mutations are server
  actions, so every write runs its permission check on the server — the UI
  hiding a button is a convenience, never the control.
- **PostgreSQL + Prisma.** Every tenant-owned table carries `orgId`, and the
  Prisma client is bound to one organisation at request time so a forgotten
  `where` clause cannot leak across tenants. Postgres row-level security is the
  second, independent net.
- **Tailwind v4** with semantic tokens defined for light and dark together.
- **bcrypt** for passwords, **AES-256-GCM** for bank and government-ID columns,
  append-only audit log for consequential actions.

More detail: [`docs/SECURITY.md`](docs/SECURITY.md), and the About page inside
the app.

---

## Project layout

```
prisma/
  schema.prisma          data model, one comment per non-obvious decision
  migrations/            includes the row-level-security policies
  seed.ts                the demo organisation
src/
  app/(auth)/            sign in, sign up, accept invitation
  app/(app)/             the authenticated product
  lib/
    db.ts                tenant-scoped Prisma client  ← read this first
    permissions.ts       the permission catalogue and system roles
    auth.ts              sessions, password rules, permission gates
    crypto.ts            field encryption, token hashing
    scope.ts             turns a permission scope into a set of employees
    actions/             server actions (writes)
    queries/             reads, scoped by the caller's permissions
  components/            UI, grouped by module
docker/                  entrypoint and first-boot database role setup
```

If you're reading the code for the first time, start with `src/lib/db.ts` and
`src/lib/permissions.ts` — the tenancy and permission models explain most of the
rest.

---

## Contributing

Issues and pull requests welcome. The architecture is deliberately module-shaped
so new country payroll packs and integrations can be added without touching the
core.

## Licence

MIT.
