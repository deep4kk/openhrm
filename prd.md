# Product Requirements Document
## OpenHRM — Free, Open-Source Human Resource Management System

**Version:** 1.0 (Draft)
**Owner:** Deepak (Flowmative)
**Status:** Draft for review
**Last updated:** August 2026

---

## 1. Executive Summary

OpenHRM is a free, open-source Human Resource Management System (HRMS) that covers the full employee lifecycle — hiring to exit — for organizations of any size. It ships two ways:

1. **Hosted (multi-tenant SaaS)** — anyone can sign up, create an organization account, and start using it immediately, free of cost.
2. **Self-hosted** — anyone can download the source, deploy it on their own server (Docker Compose, one-click scripts, or cloud marketplace images), and run it independently with full data ownership.

The product targets SMEs and mid-size companies who currently rely on spreadsheets, WhatsApp, or fragmented paid tools (BambooHR, Zoho People, Keka, Darwinbox) and want a single, no-cost, self-ownable alternative — similar in spirit to what Frappe/ERPNext and OrangeHRM have done for open-source business software.

---

## 2. Problem Statement

- SMEs (Flowmative's own client base) run HR on spreadsheets, paper, and WhatsApp — leading to lost data, no audit trail, and manual payroll errors.
- Existing HRMS products are either expensive per-employee SaaS tools (Zoho People, BambooHR, Keka, Darwinbox) or open-source but narrow/abandoned/hard to self-host.
- There is no single open-source HRMS that is genuinely "everything included" (payroll + attendance + recruitment + performance + LMS + helpdesk) AND easy to both self-host and use as a free hosted product.

---

## 3. Goals

| Goal | Description |
|---|---|
| G1 | Cover the full breadth of HRMS functionality found across the market's leading tools, in one product |
| G2 | Let anyone sign up for a free hosted account (multi-tenant) with zero setup |
| G3 | Let anyone self-host the same codebase with a single command (Docker Compose) |
| G4 | Make the codebase genuinely open source (permissive or source-available license) so others can contribute, fork, and extend |
| G5 | Support companies from 1 to 5,000+ employees without a rewrite |
| G6 | Ship with sane RBAC so Admin, HR, Manager, and Employee each get an experience scoped to their role |

### Non-Goals (v1)
- Building a payroll *compliance/filing* engine for every country's tax law (v1 supports configurable salary structures + payroll runs, not statutory e-filing for every jurisdiction — starts with India-specific compliance, extensible to others)
- Native iOS/Android apps in v1 (PWA first; native wrapper later)
- Deep BI/data-warehouse analytics (basic dashboards + exports in v1)

---

## 4. Target Users / Personas

1. **Super Admin (Platform Owner)** — only relevant on the hosted multi-tenant version; manages tenants, billing (if ever introduced), platform health.
2. **Org/HR Admin** — sets up the company account, configures departments, policies, roles, payroll structures, integrations.
3. **HR Manager / HR Executive** — day-to-day HR operations: onboarding, leave approvals, attendance corrections, payroll runs, recruitment.
4. **Department / Reporting Manager** — approves leave/timesheets for their team, runs performance reviews, views team dashboards.
5. **Employee** — self-service: applies leave, views payslips, clocks in/out, updates profile, raises HR tickets, does trainings.
6. **Recruiter (optional role)** — manages job postings, candidate pipeline, interviews.
7. **IT/Self-hoster / Developer** — deploys and maintains a self-hosted instance; needs Docker, env config, backups, upgrade path.

---

## 5. Deployment & Account Model

### 5.1 Hosted Multi-Tenant SaaS (free)
- Public sign-up flow: user registers → creates an **Organization** (tenant) → becomes its first Org Admin.
- Each organization's data is logically isolated (tenant_id scoping at the database layer, or schema-per-tenant for larger orgs).
- No credit card, no paywalled features — the hosted version is free, consistent with the self-hosted version (same codebase, same feature set).
- Optional: users can invite teammates via email during onboarding.

### 5.2 Self-Hosted
- One-command deploy: `docker compose up -d` spins up app server, Postgres, Redis, and object storage (MinIO) locally.
- `.env`-based configuration (SMTP, storage, domain, JWT secrets).
- One-click deploy buttons for Railway / Render / DigitalOcean App Platform / a Hetzner install script.
- Self-update mechanism (versioned migrations, `openhrm upgrade` CLI command).
- Data export/import so a hosted-tenant can migrate to self-hosted and vice versa (no lock-in — this is a core value prop).

### 5.3 Licensing
- Core product under a permissive OSS license (MIT or Apache-2.0) so companies can freely self-host and modify.
- (Optional future consideration, not v1: an "open core" model where a handful of enterprise-scale add-ons like SSO/SAML or advanced analytics are paid — but the PRD's stated requirement is that the product stays free, so v1 keeps everything free and open.)

---

## 6. Roles & Permissions (RBAC)

| Capability | Super Admin (SaaS) | Org Admin | HR Manager | Dept. Manager | Employee |
|---|---|---|---|---|---|
| Manage tenants/billing | ✅ | — | — | — | — |
| Configure org settings, roles, policies | — | ✅ | Partial | — | — |
| Manage employee records | — | ✅ | ✅ | View team only | View self only |
| Approve leave/attendance | — | ✅ | ✅ | Team only | — |
| Run payroll | — | ✅ | ✅ | — | — |
| View own payslips/documents | — | ✅ | ✅ | ✅ | ✅ |
| Post job openings / manage ATS | — | ✅ | ✅ | Request only | — |
| Conduct performance reviews | — | ✅ | ✅ | Team only | Self-review only |
| Raise HR helpdesk ticket | — | ✅ | ✅ | ✅ | ✅ |
| Access org-wide reports | — | ✅ | ✅ | Team-level | — |

Permissions should be implemented as a **granular, configurable permission matrix** (not hardcoded roles) so Org Admins can create custom roles later (e.g., "Payroll-only HR", "Read-only Auditor").

---

## 7. Feature Set (Full Module List)

This is the "everything" list — grouped into modules. Each is detailed further in Section 8.

1. **Authentication & Account Management** — signup, login, SSO (Google/Microsoft), 2FA, password policies, magic links
2. **Organization Setup** — company profile, departments, designations, locations/branches, org chart
3. **Employee Database (Core HR)** — master employee records, custom fields, document vault
4. **Onboarding & Offboarding** — pre-boarding checklists, digital forms, asset issuance, exit workflows
5. **Attendance & Time Tracking** — check-in/out, geofencing, biometric integration, shift rosters, timesheets
6. **Leave Management** — leave types, balances, accrual rules, approval workflows, holiday calendars
7. **Payroll Management** — salary structures, payroll runs, payslips, statutory deductions (PF/ESI/TDS for India, extensible), reimbursements, bonuses
8. **Recruitment / ATS** — job postings, candidate pipeline (kanban), resume parsing, interview scheduling, offer letters
9. **Performance Management** — goals/OKRs, appraisal cycles, 360° feedback, 1:1 tracking
10. **Learning & Development (LMS)** — course library, assignments, certifications, quizzes
11. **Employee Self-Service Portal** — profile, payslips, leave, documents, org directory
12. **Manager Dashboard** — team attendance, leave approvals, performance, headcount
13. **Admin/HR Dashboard & Analytics** — headcount trends, attrition, DEI stats, payroll cost, custom reports
14. **Document Management** — employee documents, company policies, e-signatures, templates
15. **Asset Management** — issue/track company assets (laptops, ID cards, SIMs) per employee
16. **Expense & Reimbursement** — expense claims, approval chains, receipts
17. **Benefits Administration** — insurance, provident fund, perks tracking
18. **Compliance & Policy Hub** — policy acknowledgments, statutory compliance checklists, audit trail
19. **HR Helpdesk / Ticketing** — employee queries routed to HR, SLA tracking
20. **Announcements & Engagement** — company news feed, polls/surveys, eNPS, birthdays/anniversaries
21. **Exit Management** — resignation workflow, clearance checklist, full & final settlement, exit interview
22. **Notifications** — email, SMS, push, in-app, Slack/Teams integration
23. **Reports & Exports** — pre-built + custom report builder, CSV/PDF/Excel export
24. **Integrations** — Google Workspace, Microsoft 365, Slack, biometric devices, accounting tools, payment gateways for payroll disbursement
25. **Mobile Experience** — responsive PWA (installable), later native apps
26. **Multi-language & Localization** — i18n framework, RTL support
27. **Multi-currency & Multi-country Payroll** (phase 2) — configurable per-country statutory modules
28. **API & Webhooks** — public REST/GraphQL API, webhook events for integrations
29. **Audit Logs & Security** — full activity logs, data-access logs, GDPR-style data export/delete
30. **White-labeling (self-hosted)** — custom logo, domain, colors for self-hosted orgs

---

## 8. Detailed Module Specs

### 8.1 Authentication & Account Management
- Email/password signup with verification, Google/Microsoft OAuth login, optional SSO (SAML/OIDC) for larger self-hosted orgs.
- 2FA (TOTP) optional per org policy.
- Org Admin can invite users by email/bulk CSV upload; invited users set their own password.
- Password policy configuration (length, expiry, reuse) per org.
- Session management: device list, force logout, refresh-token rotation.

**Acceptance criteria:** A new user can sign up, create an org, invite 3 teammates, and each teammate can log in and land on a role-appropriate dashboard — all within 10 minutes, no manual setup by a developer.

### 8.2 Organization Setup
- Company profile: name, logo, industry, address(es)/branches, time zone, fiscal year.
- Department & designation hierarchy (tree structure), cost centers.
- Auto-generated, editable org chart (visual, drag-to-reassign reporting lines).
- Holiday calendar per location.

### 8.3 Employee Database (Core HR)
- Master record: personal info, contact, emergency contact, job details (title, department, manager, employment type, join date), compensation (visible only to authorized roles), bank details.
- Custom fields per org (e.g., "T-shirt size", "Blood group") — admin-configurable field builder.
- Document vault per employee (ID proofs, contracts, certificates) with expiry-date reminders (e.g., visa/passport expiry).
- Employee directory with search/filter, org chart view, "who's who" profile cards.

### 8.4 Onboarding & Offboarding
- Pre-boarding portal: new hire fills personal details, uploads documents, e-signs offer/contract before day 1.
- Configurable onboarding checklist/workflow (IT setup, asset issuance, buddy assignment, orientation schedule) with task owners and due dates.
- Offboarding mirrors this: clearance checklist across IT/Finance/Admin, asset return, access revocation, final settlement trigger.

### 8.5 Attendance & Time Tracking
- Web/mobile check-in/out with optional geofencing and selfie capture.
- Shift management: fixed, rotational, flexible shifts; shift roster builder/calendar.
- Biometric device integration (standard protocols e.g. ZKTeco-style push API) for offices with physical scanners.
- Timesheet mode for project/hourly billing (useful for agencies — relevant to Flowmative-style businesses too).
- Regularization workflow for missed punches, with manager approval.
- Overtime calculation rules, configurable per org/labor law.

### 8.6 Leave Management
- Configurable leave types (casual, sick, earned, unpaid, maternity/paternity, comp-off) with accrual rules (monthly accrual, carry-forward caps, encashment).
- Leave request → manager approval → HR override workflow, with balance auto-deduction.
- Team leave calendar view to avoid overlap.
- Public holiday calendar per location, optional restricted holidays (choose N from a list).

### 8.7 Payroll Management
- Configurable salary structure builder (basic, HRA, allowances, deductions as formula-driven components).
- Monthly payroll run: pulls attendance/leave data, computes gross/net pay, generates payslips (PDF) automatically.
- Statutory compliance module — starts with India (PF, ESI, Professional Tax, TDS) since that's the primary market context, built as a pluggable "compliance pack" so other countries can be added by the community.
- Bonus, incentive, and reimbursement inclusion in payroll runs.
- Loan/advance tracking with auto-deduction schedules.
- Bank file / payment gateway export for salary disbursement.
- Payslip portal for employees (download, historical access).

### 8.8 Recruitment / ATS
- Job requisition → approval → job posting (career page + external job board syndication later).
- Candidate pipeline as a kanban board (Applied → Screening → Interview → Offer → Hired/Rejected).
- Resume upload + basic parsing (name/email/phone/skills extraction).
- Interview scheduling with calendar integration and structured scorecards.
- Offer letter generation from templates, e-signature.
- Careers page builder (public, brandable) per org.

### 8.9 Performance Management
- Goal-setting (individual/team OKRs or KPIs), cascading from company → department → individual.
- Appraisal cycles (quarterly/annual) with self-review, manager review, and optional 360° peer feedback.
- Continuous feedback / 1:1 meeting notes and action items.
- Performance history tied to employee record for promotion/raise decisions.

### 8.10 Learning & Development (LMS)
- Course library (upload video/PDF/SCORM-lite content or link external content).
- Assign courses to individuals/roles/departments with due dates.
- Quizzes and completion certificates.
- Compliance training tracking (e.g., mandatory POSH training) with reminders.

### 8.11 Employee Self-Service Portal
- Single "My Space" hub: profile, payslips, leave balance/apply, attendance history, documents, org directory, announcements, helpdesk tickets, assigned trainings.

### 8.12 Manager Dashboard
- Team roster, pending approvals (leave/timesheet/expense), team attendance today, upcoming reviews, team performance snapshot.

### 8.13 Admin/HR Dashboard & Analytics
- Headcount trend, attrition rate, department-wise cost, gender/diversity ratio, leave trends, payroll cost trend.
- Custom report builder (choose fields/filters, save, schedule email delivery).

### 8.14 Document Management
- Company-wide policy documents with version history and mandatory acknowledgment tracking (read receipts).
- Templated letters (offer, experience, relieving, increment) with mail-merge from employee data.
- Basic e-signature support for contracts/offers.

### 8.15 Asset Management
- Asset register (laptops, phones, ID cards, access cards) with serial numbers.
- Assign/return workflow tied to onboarding/offboarding, condition notes, depreciation-lite tracking.

### 8.16 Expense & Reimbursement
- Expense claim submission with receipt upload, category, project/cost-center tagging.
- Multi-level approval chain, reimbursement included in next payroll run or paid separately.

### 8.17 Benefits Administration
- Track enrolled benefits per employee (health insurance, PF, gratuity eligibility) and basic plan documents.

### 8.18 Compliance & Policy Hub
- Central place for statutory checklists (POSH committee, labor law postings) relevant to org's country/state.
- Full audit trail of who changed what employee/payroll data and when.

### 8.19 HR Helpdesk / Ticketing
- Employees raise categorized tickets (Payroll query, IT, Policy question, etc.) routed to the right HR/IT owner, with SLA timers and resolution tracking.

### 8.20 Announcements & Engagement
- Company news feed/wall, birthday & work-anniversary widgets, polls/surveys, eNPS pulse surveys.

### 8.21 Exit Management
- Resignation submission → approval → notice period tracking → clearance workflow (IT/Finance/Admin sign-off) → full & final settlement → exit interview form → auto-generate relieving/experience letter.

### 8.22 Notifications
- In-app, email, and optional SMS/push notifications for approvals, reminders, announcements; Slack/Teams webhook integration for HR alerts.

### 8.23 Reports & Exports
- Pre-built report templates (headcount, attrition, leave, payroll summary) plus ad-hoc report builder; export to CSV/Excel/PDF.

### 8.24 Integrations
- Google Workspace / Microsoft 365 calendar & SSO sync.
- Slack/Teams notifications.
- Biometric device push-API integration.
- Accounting software export (Tally/Zoho Books/QuickBooks-style CSV or API).
- Payment gateway/bank API for salary disbursement (phase 2).

### 8.25 Mobile Experience
- Installable PWA (offline-capable for attendance check-in) as v1; native app wrapper (Capacitor/React Native) as a later phase if adoption warrants it.

### 8.26 Multi-language & Localization
- i18n framework from day one (even if only English ships first) so community translations are easy to add; RTL layout support.

### 8.27 API & Webhooks
- Documented REST API (and/or GraphQL) covering all core entities; webhook events (employee.created, leave.approved, payroll.run.completed, etc.) for integration builders — this also lets Flowmative-style automation agencies build on top of it.

### 8.28 Audit Logs & Security
- Immutable audit log of sensitive actions (salary changes, permission changes, data exports).
- Encryption at rest for sensitive fields (bank details, government ID numbers).
- Configurable data retention and a "right to be forgotten" data export/delete flow for departed employees.

### 8.29 White-labeling (self-hosted)
- Self-hosted orgs can set their own logo, brand color, and domain (custom domain support via reverse proxy config).

---

## 9. Non-Functional Requirements

| Category | Requirement |
|---|---|
| Scalability | Support a single tenant scaling from 1 to 5,000+ employees without architecture change; hosted platform supports thousands of tenants via tenant-scoped queries/indexes |
| Performance | Core pages (dashboard, employee list, payroll run for 500 employees) load/complete in under 3 seconds under normal load |
| Availability | 99.5%+ uptime target for the hosted version |
| Security | RBAC enforced at API layer, not just UI; encrypted secrets; regular dependency vulnerability scanning; rate limiting on auth endpoints |
| Data portability | Full data export (JSON/CSV) at any time — no lock-in, supports self-host migration |
| Backups | Automated daily backups (hosted); documented backup/restore procedure for self-hosted |
| Accessibility | WCAG 2.1 AA target for core employee-facing screens |
| Extensibility | Plugin/module architecture so new country payroll packs or integrations can be added without forking core |

---

## 10. Suggested Technical Architecture

Given the builder's existing stack (TypeScript, Node.js, React, Prisma, PostgreSQL, Docker), a natural fit:

- **Backend:** Node.js + TypeScript (NestJS or Express), REST + optional GraphQL, Prisma ORM
- **Database:** PostgreSQL with row-level tenant scoping (`org_id` on every table + Postgres Row-Level Security for defense-in-depth)
- **Cache/Queue:** Redis (sessions, job queue for payroll runs, notifications, report generation via BullMQ)
- **File storage:** S3-compatible (AWS S3 for hosted, MinIO for self-hosted) for documents/resumes/payslips
- **Frontend:** React + TypeScript, component library (e.g., shadcn/ui or similar) for a consistent, themeable UI
- **Auth:** JWT + refresh tokens, OAuth providers, optional SAML/OIDC for enterprise self-hosters
- **Multi-tenancy model:** shared database, shared schema, `org_id` scoping (simplest to start; can evolve to schema-per-tenant for very large self-hosted deployments)
- **Deployment:** Docker Compose for self-host; containerized deployment (ECS/Kubernetes) for the hosted SaaS
- **Background jobs:** payroll runs, report generation, reminder emails handled asynchronously via a job queue

---

## 11. High-Level Data Model (Core Entities)

`Organization → Department → Designation → Employee → User (auth) → Role/Permission`
`Employee → AttendanceRecord, LeaveRequest, PayrollRecord, Document, Asset, PerformanceReview, TrainingEnrollment, ExpenseClaim, ExitRecord`
`JobPosting → Candidate → Interview → Offer`
`Ticket (Helpdesk) → Employee, AssignedTo`
`Announcement, Survey → Organization`

(A full ER diagram and migration schema should be built as a follow-up technical design doc once this PRD is approved.)

---

## 12. Open Source Strategy

- Public GitHub repo, permissive license (MIT/Apache-2.0) recommended so any business — including Flowmative's own SME clients — can freely self-host and modify.
- Clear `CONTRIBUTING.md`, issue templates, and a public roadmap so community contributions (especially country-specific payroll/compliance packs and translations) are easy.
- "Compliance packs" and "integration packs" designed as pluggable modules so contributors can add e.g. Philippines payroll rules or a Zoho integration without touching core.
- Documentation site (self-host guide, API reference, admin guide) treated as a first-class deliverable, not an afterthought.

---

## 13. Success Metrics

| Metric | Target (12 months post-launch) |
|---|---|
| Hosted sign-ups (organizations) | 500+ |
| Self-hosted deployments (tracked via optional anonymous telemetry ping, opt-out) | 200+ |
| GitHub stars / community contributors | 1,000+ stars, 20+ external contributors |
| Core module coverage | All 30 modules in Section 7 shipped |
| Uptime (hosted) | 99.5%+ |
| Median time from signup to "first payroll run completed" | Under 7 days |

---

## 14. Release Roadmap (Phased)

**Phase 1 — MVP (Core HR + Self-Service)**
Auth & org setup, Employee database, Attendance, Leave management, Employee self-service portal, Admin dashboard basics, Notifications, Docker self-host deploy.

**Phase 2 — Payroll & Workforce Ops**
Payroll engine (India compliance pack first), Onboarding/Offboarding workflows, Document management, Asset management, Expense/Reimbursement, HR Helpdesk.

**Phase 3 — Talent & Growth**
Recruitment/ATS, Performance management, Learning & Development (LMS), Announcements/Engagement, Exit management.

**Phase 4 — Scale & Ecosystem**
Public API/webhooks, integrations marketplace (Slack, accounting tools, biometric devices), multi-country payroll packs, custom report builder, white-labeling, mobile PWA polish, optional native apps.

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| "Everything" scope leads to endless build with nothing shipped | Strict phased roadmap (Section 14); MVP ships with a narrow but usable slice first |
| Payroll/compliance errors carry real financial/legal risk for users | Clearly label compliance packs as "community-maintained, verify with your accountant"; start with one well-tested country pack |
| Multi-tenant data isolation bugs are high-severity | Enforce `org_id` scoping at the ORM query-builder level + Postgres RLS as a second safety net; automated tests for cross-tenant access |
| Low community contribution despite open-source label | Invest early in documentation, a clean plugin architecture, and a public roadmap to lower the contribution barrier |
| Self-hosters struggle with setup/updates | One-command Docker deploy, versioned migrations, and a clear upgrade CLI are treated as v1 requirements, not nice-to-haves |

---

## 16. Open Questions

1. Should the hosted version stay free forever, or is a future "hosted convenience fee" (infra cost only, not a paid-feature model) ever on the table?
2. Which country's payroll/statutory compliance should the first compliance pack target — India only, or India + one more from day one?
3. Should recruitment/ATS include a public job board (discoverable across all tenants) or stay private per org?
4. What's the anonymous telemetry policy for self-hosted instances (fully opt-in, or opt-out with clear disclosure)?

---

*End of document.*