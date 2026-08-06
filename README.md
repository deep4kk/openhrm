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
| Organisation setup — structure, locations, shifts, holidays, leave types | ✅ Built |
| Employee database (Core HR) | ✅ Built |
| Org chart from reporting lines | ✅ Built |
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

---

## Demo login details

`npm run db:seed` creates **Meridian Labs** — 31 employees, two months of
attendance, real reporting lines and pending approvals — plus one account per
role, so you can see the product from each angle.

### 🔑 Password for every demo account

```
openhrm-demo-2026
```

All lowercase, two hyphens. The same password works for all four accounts below.

### Accounts

| # | Email | Password | Role | Signs in as | What they can see |
|---|---|---|---|---|---|
| 1 | `admin@meridianlabs.example` | `openhrm-demo-2026` | **Org Admin** | Deepak Sharma | Everything — all 8 nav sections, settings, roles, every employee |
| 2 | `hr@meridianlabs.example` | `openhrm-demo-2026` | **HR Manager** | Ananya Iyer | All 31 employees, org-wide leave and attendance. No role management |
| 3 | `manager@meridianlabs.example` | `openhrm-demo-2026` | **Manager** | Arjun Reddy | Only his 4 direct reports, and only their approvals |
| 4 | `employee@meridianlabs.example` | `openhrm-demo-2026` | **Employee** | Aditya Verma | Only himself — the sidebar shrinks to 4 items |

**Start with account 1.** Then sign out and try 3, then 4. That sequence is the
fastest way to see the permission model doing real work: the sidebar, the
tables and the approval queue all change, and it is enforced on the server —
typing `/settings` as the employee lands on `/denied`, not a blank page.

> The `.example` domain is reserved by [RFC 2606](https://www.rfc-editor.org/rfc/rfc2606)
> for exactly this purpose, so these addresses can never collide with a real
> mailbox or accidentally send someone an email.

### If sign-in fails

| What you see | What it means | Fix |
|---|---|---|
| "That email and password don't match an account" | The demo data isn't loaded | `npm run db:seed` |
| A database connection error | `npm run db:dev` isn't running, or its port changed | Restart it and copy the printed `DATABASE_URL` into `.env` |
| "Too many failed attempts" | 8 wrong tries in 10 minutes | Wait 10 minutes, or restart `npm run dev` to clear it |

`npm run db:seed` is safe to re-run at any time — it deletes the demo
organisation and rebuilds it, so it never duplicates data. Re-running it also
refreshes attendance so that "today" has records.

> [!IMPORTANT]
> **These credentials are published, on purpose.** Meridian Labs is invented
> data and the logins above are printed in this README so anyone can open the
> demo and look around without signing up. If a public OpenHRM demo is running,
> assume it is seeded exactly like this and that anyone can sign into it.
>
> **That is the opposite of what you want for real HR data.** If you are
> self-hosting OpenHRM for an actual organisation, skip `npm run db:seed`
> entirely and create your organisation through the sign-up page — or delete the
> demo organisation afterwards. Never run a real deployment with the seeded
> accounts present.

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
