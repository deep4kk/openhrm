import type { Metadata } from "next";
import {
  CalendarDays,
  Clock,
  Database,
  FileText,
  KeyRound,
  Layers,
  Lock,
  Scale,
  Users,
} from "lucide-react";

import { requireAuth } from "@/lib/auth";
import {
  PERMISSION_GROUPS,
  PERMISSIONS,
  SYSTEM_ROLES,
  permissionsInGroup,
} from "@/lib/permissions";
import { PageHeader, PageShell } from "@/components/page-header";
import { Code, Flow, TechNote } from "@/components/about/flow";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const metadata: Metadata = {
  title: "About",
  description:
    "How OpenHRM works — the modules, who can see what, and the logic behind every number on screen.",
};

/**
 * The About page.
 *
 * Two audiences, one page. The prose layer answers "what does this do and what
 * happens when I click things" for an HR admin evaluating the product. Each
 * expandable section under it answers "how is that actually implemented" for a
 * developer about to self-host or contribute.
 *
 * The permission matrix is generated from src/lib/permissions.ts — the same
 * array the server checks against. Documentation that reads from the
 * enforcement cannot drift away from it.
 */
export default async function AboutPage() {
  const session = await requireAuth();

  return (
    <PageShell className="max-w-4xl">
      <PageHeader
        title="How OpenHRM works"
        description="Everything this system does, in plain language — with the technical detail underneath each part if you want it."
      />

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={Layers}
        title="What this is"
        lead={`OpenHRM is a free, open-source HR system. ${session.org.name} runs on it to keep employee records, attendance and leave in one place instead of spread across spreadsheets and chat threads.`}
      >
        <p className="measure text-muted-foreground text-sm leading-relaxed">
          It ships two ways from the same code: a hosted version anyone can sign
          up for, and a copy you download and run on your own server. Both have
          every feature — there is no paid tier holding anything back, and you
          can export all of your data at any time and move between them.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {MODULES.map((module) => (
            <div key={module.name} className="rounded-lg border p-4">
              <div className="flex items-center gap-2">
                <module.icon
                  className="text-muted-foreground size-4"
                  aria-hidden="true"
                />
                <p className="text-sm font-medium">{module.name}</p>
              </div>
              <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                {module.what}
              </p>
            </div>
          ))}
        </div>

        <TechNote title="Stack">
          <p>
            Next.js App Router with React server components, TypeScript
            throughout, PostgreSQL via Prisma, and Tailwind for styling. Writes
            go through server actions rather than a separate API layer, so every
            mutation runs a permission check on the server before it touches the
            database. Sessions are signed JWTs in an httpOnly cookie carrying
            only a session id.
          </p>
        </TechNote>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={Users}
        title="Who can see what"
        lead="Every screen and every action is gated by permissions, not by job titles. Four roles ship by default, and an Org Admin can build new ones."
      >
        <div className="space-y-3">
          {SYSTEM_ROLES.map((role) => (
            <div key={role.key} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{role.name}</p>
                <span className="text-muted-foreground bg-muted rounded px-1.5 py-0.5 font-mono text-[10px]">
                  {role.key}
                </span>
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {role.permissions.length} of {PERMISSIONS.length} permissions
                </span>
              </div>
              <p className="text-muted-foreground measure mt-1.5 text-sm leading-relaxed">
                {role.description}
              </p>
            </div>
          ))}
        </div>

        <p className="text-muted-foreground measure mt-4 text-sm leading-relaxed">
          The important idea: a manager doesn&apos;t see &ldquo;everyone&rdquo;
          and an employee doesn&apos;t see &ldquo;nobody&rdquo;. Permissions come
          in three widths — <strong>self</strong> (just you),{" "}
          <strong>team</strong> (everyone who reports to you, including their
          reports), and <strong>all</strong> (the whole organisation). That is
          why a team lead approving leave sees their own people and nobody
          else&apos;s.
        </p>

        <Accordion className="mt-5">
          <AccordionItem value="matrix">
            <AccordionTrigger>
              See the full permission matrix ({PERMISSIONS.length} permissions)
            </AccordionTrigger>
            <AccordionContent>
              <p className="text-muted-foreground mb-4 text-sm">
                Generated from the same list the server checks against, so it
                can&apos;t fall out of date. A dot means the role holds that
                permission.
              </p>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 pr-4 text-left font-medium">
                        Permission
                      </th>
                      {SYSTEM_ROLES.map((role) => (
                        <th
                          key={role.key}
                          className="px-2 py-2 text-center font-medium whitespace-nowrap"
                        >
                          {role.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_GROUPS.map((group) => (
                      <PermissionGroupRows key={group} group={group} />
                    ))}
                  </tbody>
                </table>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={CalendarDays}
        title="What happens when you request leave"
        lead="The most common thing anyone does here, start to finish."
      >
        <Flow
          steps={[
            {
              title: "You pick a type and dates",
              actor: "Employee",
              detail:
                "The form shows your live balance for the type you choose, so you find out you're short before you submit rather than after.",
            },
            {
              title: "The system works out the real cost",
              actor: "Automatic",
              detail:
                "Weekends and public holidays inside your date range aren't charged to you. A Friday-to-Monday break on a five-day week costs two days, not four.",
            },
            {
              title: "Those days are held aside",
              actor: "Automatic",
              detail:
                "The days move into a 'pending' bucket immediately. Without that you could file three overlapping requests against the same balance and have all three approved.",
            },
            {
              title: "Your manager is notified",
              actor: "Automatic",
              detail:
                "In-app and by email. If you have no manager set, it routes to whoever holds organisation-wide leave approval instead of silently going nowhere.",
            },
            {
              title: "They approve or decline",
              actor: "Manager",
              detail:
                "Approving takes one click. Declining asks for a reason, because a rejection with no explanation is the worst thing an HR system can do to someone who booked flights.",
            },
            {
              title: "Your balance settles",
              actor: "Automatic",
              detail:
                "Approved: pending days become used days. Declined: they go straight back to your balance. Either way you get a notification and an email.",
            },
          ]}
        />

        <TechNote title="Implementation">
          <p>
            The status change and the balance movement happen in one database
            transaction, never separately — if either half failed on its own the
            numbers would stop adding up. Each movement also appends a row to{" "}
            <Code>leave_ledger_entries</Code> recording the delta and why.
          </p>
          <p>
            That ledger is the point: a balance is never a single number
            something increments. It is{" "}
            <Code>
              opening + carried forward + accrued + adjustments − used − pending
            </Code>
            , and every term has matching ledger rows. When someone asks why
            their balance is 7.5 and not 9, the answer is a list, not a shrug.
          </p>
        </TechNote>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={Scale}
        title="How leave balances build up"
        lead="Balances aren't set by hand — they accrue as the year goes on."
      >
        <p className="measure text-muted-foreground text-sm leading-relaxed">
          Each leave type has its own rule. Earned leave might add 1.25 days a
          month and carry forward up to 30 days into next year; casual leave
          might add 1 day a month and expire at year end; maternity leave might
          be a flat 182-day entitlement that doesn&apos;t accrue at all. Someone
          who joins in September has accrued less than someone who was here in
          April, automatically.
        </p>

        <TechNote title="The leave year">
          <p>
            The year boundary follows your organisation&apos;s fiscal year start
            — April for {session.org.name}, so 31 March 2026 belongs to leave
            year 2025 and 1 April 2026 opens 2026. Accruals, carry-forward and
            every balance row hang off that one definition rather than each
            module deciding for itself.
          </p>
        </TechNote>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={Clock}
        title="How attendance is recorded"
        lead="One row per person per day — not a stream of punches."
      >
        <Flow
          steps={[
            {
              title: "You check in",
              actor: "Employee",
              detail:
                "Pressing it twice doesn't create a second day or overwrite your original time. Whether you're 'late' is measured against your shift start plus its grace period, so a 15-minute grace really means 15 minutes.",
            },
            {
              title: "You check out",
              actor: "Employee",
              detail:
                "Worked time is the gap minus your shift's break. Under the half-day threshold, the day is recorded as a half day rather than a full one.",
            },
            {
              title: "You forgot to punch",
              actor: "Employee",
              detail:
                "Raise a regularisation with the times you actually worked and why. Your manager approves it, and the day is marked as corrected rather than pretending the punch was always there.",
            },
          ]}
        />

        <TechNote title="Why one row per day">
          <p>
            A unique constraint on <Code>(employeeId, date)</Code> makes
            &ldquo;was Priya in on the 4th?&rdquo; a primary-key lookup instead
            of a scan over punch events, and makes a duplicate check-in
            impossible to turn into a duplicate day. Dates are stored as
            date-only values at UTC midnight, never as instants — otherwise a
            leave request silently gains or loses a day depending on who is
            looking at it from where.
          </p>
        </TechNote>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={Lock}
        title="How your organisation's data stays separate"
        lead="The hosted version holds many companies in one database. Yours is invisible to the others."
      >
        <p className="measure text-muted-foreground text-sm leading-relaxed">
          Every record belongs to exactly one organisation, and every query is
          bound to the organisation of whoever is signed in. There is no screen,
          filter or URL that reaches across that line — a leaked employee id from
          another company returns nothing rather than someone else&apos;s record.
        </p>

        <TechNote title="Two independent nets">
          <p>
            <strong>Application layer.</strong> Database access goes through a
            client permanently bound to one organisation. It rewrites every
            query to carry that <Code>orgId</Code>, so forgetting a filter
            can&apos;t leak data — the filter is added whether the developer
            wrote it or not. Any Prisma operation it doesn&apos;t explicitly
            know how to scope throws instead of passing through unscoped.
          </p>
          <p>
            <strong>Database layer.</strong> Postgres row-level security
            policies compare each row&apos;s <Code>orgId</Code> against a session
            variable the app sets per transaction. They fail closed: with no
            tenant set, queries return nothing rather than everything. These
            engage when the app connects as a dedicated non-superuser role, which
            is the documented production setup.
          </p>
        </TechNote>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={KeyRound}
        title="Security and the audit trail"
        lead="Sensitive fields are encrypted, and consequential actions are recorded."
      >
        <ul className="measure text-muted-foreground space-y-2.5 text-sm leading-relaxed">
          <li>
            <strong className="text-foreground">Bank and ID numbers</strong> are
            encrypted before they reach the database and decrypted only when
            someone with permission actively asks to see them. Every reveal is
            logged against their name.
          </li>
          <li>
            <strong className="text-foreground">Passwords</strong> are hashed
            with bcrypt. Session and invitation tokens are stored only as
            digests, so a database leak can&apos;t be replayed as a login.
          </li>
          <li>
            <strong className="text-foreground">Failed sign-ins</strong> are
            throttled, and the form never reveals whether an email has an account
            — otherwise it becomes a way to enumerate who works here.
          </li>
          <li>
            <strong className="text-foreground">The audit log</strong> is
            append-only. Nothing in the application updates or deletes from it,
            and entries survive the person who caused them being deleted.
          </li>
        </ul>

        <TechNote title="Encryption detail">
          <p>
            AES-256-GCM with a fresh random IV per value, so the same account
            number encrypts differently every time and tampering is detected
            rather than silently decrypted into garbage. Losing{" "}
            <Code>ENCRYPTION_KEY</Code> makes those columns permanently
            unreadable — self-hosters should back it up separately from the
            database.
          </p>
        </TechNote>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={Database}
        title="What's stored"
        lead="The shape of the data, if you're planning to self-host or build on the API."
      >
        <Accordion>
          <AccordionItem value="model">
            <AccordionTrigger>Core entities and how they relate</AccordionTrigger>
            <AccordionContent>
              <ul className="space-y-3 text-sm">
                {DATA_MODEL.map((entity) => (
                  <li key={entity.name}>
                    <p className="font-mono text-xs font-medium">
                      {entity.name}
                    </p>
                    <p className="text-muted-foreground measure mt-0.5 leading-relaxed">
                      {entity.what}
                    </p>
                  </li>
                ))}
              </ul>

              <p className="text-muted-foreground measure mt-5 text-sm leading-relaxed">
                A person is two records, deliberately: an <Code>Employee</Code>{" "}
                (the HR record) and optionally a <Code>User</Code> (the login).
                HR can build the roster before anyone has an account, and someone
                who leaves loses their login while their record stays for
                reporting and compliance.
              </p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      {/* ---------------------------------------------------------------- */}
      <Section
        icon={FileText}
        title="Running it yourself"
        lead="The whole thing is yours to host. Nothing phones home."
      >
        <p className="measure text-muted-foreground text-sm leading-relaxed">
          A single <Code>docker compose up -d</Code> brings up the app, Postgres,
          Redis and object storage. Configuration is environment variables;
          upgrades are versioned migrations. Full details are in the{" "}
          <Code>README.md</Code> and <Code>docs/</Code> folder of the repository.
        </p>

        <TechNote title="Not yet built">
          <p>
            This is Phase 1 of the roadmap: accounts and organisation setup,
            employee records, attendance, leave, self-service, dashboards and
            notifications. Payroll, recruitment, performance reviews, learning
            and the public API are later phases and are not in this build.
            We&apos;d rather say that plainly than show you a menu of buttons
            that don&apos;t do anything.
          </p>
        </TechNote>
      </Section>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------

function Section({
  icon: Icon,
  title,
  lead,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <section className="surface p-6">
      <div className="flex items-start gap-3">
        <div className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight">{title}</h2>
          <p className="measure text-muted-foreground mt-1 text-sm leading-relaxed">
            {lead}
          </p>
        </div>
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function PermissionGroupRows({ group }: { group: string }) {
  const permissions = permissionsInGroup(group as never);

  return (
    <>
      <tr>
        <td
          colSpan={SYSTEM_ROLES.length + 1}
          className="text-muted-foreground bg-muted/50 px-0 pt-4 pb-1.5 text-[11px] font-medium tracking-wide uppercase"
        >
          <span className="pl-1">{group}</span>
        </td>
      </tr>
      {permissions.map((permission) => (
        <tr key={permission.key} className="border-b last:border-0">
          <td className="py-2 pr-4 align-top">
            <span className="flex items-center gap-1.5">
              {permission.label}
              {permission.sensitive && (
                <span
                  className="bg-warning-subtle text-warning rounded px-1 py-px text-[9px] font-medium"
                  title="Grants access to sensitive data"
                >
                  sensitive
                </span>
              )}
            </span>
            <span className="text-muted-foreground block text-xs">
              {permission.description}
            </span>
          </td>
          {SYSTEM_ROLES.map((role) => {
            const held = role.permissions.includes(permission.key as never);
            return (
              <td key={role.key} className="px-2 py-2 text-center align-top">
                {/* A word for assistive tech, a dot for everyone else — never
                    a bare colour. */}
                <span className="sr-only">
                  {held ? "granted" : "not granted"}
                </span>
                <span
                  aria-hidden="true"
                  className={
                    held
                      ? "bg-success inline-block size-1.5 rounded-full"
                      : "bg-border inline-block h-px w-2.5 align-middle"
                  }
                />
              </td>
            );
          })}
        </tr>
      ))}
    </>
  );
}

const MODULES = [
  {
    name: "People",
    icon: Users,
    what: "One record per person — job details, contact, emergency contact, reporting line and documents.",
  },
  {
    name: "Attendance",
    icon: Clock,
    what: "Check in and out, see the month, and correct missed punches with manager approval.",
  },
  {
    name: "Leave",
    icon: CalendarDays,
    what: "Balances that accrue by your own rules, requests that route to the right approver, and a team calendar.",
  },
  {
    name: "Documents",
    icon: FileText,
    what: "Letter templates with mail-merge placeholders — offer, increment, relieving, experience, full and final. Pick a person and their details fill in; the finished letter prints, or goes out as a mail draft you review first.",
  },
  {
    name: "Dashboards",
    icon: Layers,
    what: "Headcount, who's in, who's away, and what's waiting on you — scoped to what your role can see.",
  },
];

const DATA_MODEL = [
  {
    name: "Organization",
    what: "The tenant. Everything else hangs off it and is deleted with it.",
  },
  {
    name: "User → Role",
    what: "A login and the permission set it carries. Roles are rows, not code, so they can be edited.",
  },
  {
    name: "Employee",
    what: "The HR record: job details, compensation, encrypted bank and ID fields, and a self-referencing manager link that forms the org chart.",
  },
  {
    name: "Department · Designation · Location · Shift",
    what: "Organisation structure. Departments nest; locations carry their own holiday calendars and timezones.",
  },
  {
    name: "AttendanceRecord · AttendanceRegularization",
    what: "One row per person per day, plus the correction requests against them.",
  },
  {
    name: "LeaveType · LeaveBalance · LeaveLedgerEntry · LeaveRequest",
    what: "Accrual rules, the current balance, the append-only history explaining it, and the requests themselves.",
  },
  {
    name: "LetterTemplate · GeneratedLetter · LetterMailDraft",
    what: "The reusable letter and its typed placeholders, the issued document frozen as it was sent, and the email composed for it — which nothing sends automatically.",
  },
  {
    name: "Notification · Announcement · AuditLog",
    what: "What people are told, what the company posts, and an immutable record of who changed what.",
  },
];
