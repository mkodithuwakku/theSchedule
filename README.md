# The Schedule

Responsive web MVP for replacing a store's Excel and paper scheduling workflow.

For future Codex sessions, start with [`CODEX_CONTEXT.md`](./CODEX_CONTEXT.md). It is the dedicated project handoff with current architecture, UAT flow, user preferences, and next likely work.

For hosted UAT setup, use [`PRODUCTION_SETUP.md`](./PRODUCTION_SETUP.md). It covers public URL, database, Google OAuth, Resend email, invite acceptance, and what to ask the manager for domain/payment setup.

The app is based on the uploaded Store Scheduler SRS and includes:

- Google/Auth.js-ready approved Gmail access control
- Prisma PostgreSQL schema for users, stores, memberships, periods, availability, shifts, coverage, swaps, snapshots, notifications, and audit logs
- Database-backed employee invitation records and invite acceptance route for hosted UAT
- Neon-backed shared workspace state for hosted manager and employee use
- Bounded daily schedule protection in Neon: one verified snapshot per store, overwritten daily, with manager backup-now and guarded restore controls
- Men Are From Mars default store hours and shift templates
- Saved light/dark theme preference per test identity
- Documented future path for multi-store expansion with store-specific branding, employees, schedules, and themes
- Manager dashboard, employee management, availability tracker, schedule builder, coverage/swap approvals, hours report, CSV export, print view, and settings
- Employee dashboard, availability submission, my shifts, full team schedule, coverage offers, and swap requests
- Production UAT test plan with 111 manually tracked flows, search/filtering, and CSV/JSON result export
- Manager-only clean-run reset that restores seeded identities while clearing UAT data, OAuth links, sessions, and notification deduplication
- Development-only scenario presets for quickly loading common workflow states
- UAT issue tracker with status toggles and CSV/JSON export
- Employee invite acceptance mock for testing the Gmail join flow before production auth is enabled
- Manager notification preview center for invite, availability, publishing, coverage, swap, and approval emails
- Availability conflict checks using full-day, shift-template, and custom-time overlap rules
- Initial published hours versus final worked hours reporting
- Gmail-oriented notification queue for invites, availability, draft generation, assignments, publishing, coverage, and swaps

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000` and sign in with an active seeded Google account.

Run the authorization regression suite with:

```bash
npm test
```

The suite verifies that employees cannot modify manager-controlled schedule fields, impersonate coworkers, approve manager requests, forge audit entries, or resolve UAT issues.

The app uses seeded scheduling data and saves the shared workspace through `/api/test-state` into Neon. Google sign-in is required, and each account is bound to its own active `StoreMembership`.

Current test accounts:

- Manager and floor staff: `m.kodithuwakku803@gmail.com`
- Employee: `kodithuw@ualberta.ca`
- Employee: `m.kodithuwakku.hockey@gmail.com`
- Employee: `bobby.cazby@gmail.com`

## Access-Controlled Workflow

The app currently opens in a pre-release test state:

1. Each employee signs in with the exact Google email the manager invited and submits their own unavailable days or time ranges.
2. The manager signs in with an active manager membership and watches the `Availability` tab badge count drop.
3. The manager opens `Builder`, generates the schedule, assigns employees, and publishes the draft.
4. Employees refresh their own accounts to see published shifts and use coverage or swap tools.

In local development only, managers also see a test-mode banner with scenario presets:

- `Fresh pre-release`
- `Availability submitted`
- `Draft generated`
- `Published`

Employees who have not submitted availability see a highlighted `Availability` tab and dashboard prompt.
The manager account can switch to `My employee view` for its own availability, shifts, coverage, and swaps. It cannot impersonate another employee.
The workspace persists through Neon. Browser storage remains only a temporary resilience fallback when the API cannot be reached.
Schedule views render as Sunday-start calendar weeks.
In the manager builder, click a shift to open the assignment panel, use `Unassigned` to filter unassigned shifts, and `Publish` warns before publishing with unassigned shifts.
Coverage requests and shift swaps are included in the saved test state, so they survive refreshes and can be tested across manager/employee role switches.
The manager `Test Plan` tab contains 111 production flows across release configuration, authentication, invitations, availability, schedule building, publishing, coverage, swaps, reports, persistence, backups, authorization failures, and reset behavior. Mark each flow Not run, Passed, Failed, or Blocked; progress is saved in Neon and can be exported as CSV or JSON.
When a new end-to-end run must begin from first login, use `Test Plan` → `Clean production UAT run`. Type `RESET CLEAN RUN` and confirm. This deliberately signs out every store test account, removes their Google account links, clears UAT workspace/normalized schedule/invite/notification/audit data, and restores the four seeded users and memberships. The clean period is dated from the current Edmonton day so availability is open for five days, release is seven days away, and the schedule begins the following day. A per-run identifier prevents an old browser tab from writing stale state back after the reset.
Use `Report issue` from the test-mode banner or employee mobile dashboard to log UAT notes while testing. Managers can review, resolve, reopen, and export those notes from the `UAT Issues` tab.
Employees can accept a mocked invite from their dashboard, which records the join flow without requiring live Google sign-in yet.
Managers can use the `Notifications` tab to preview the Gmail copy for each major workflow and review queued/sent/failed notification logs.
Publishing now opens a confirmation review with warnings, employee notification counts, and an hours snapshot before the schedule is actually submitted.

## Database Setup

Set `DATABASE_URL` in `.env`, then run:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The seed creates a Men Are From Mars sample store, a development manager, sample employees, store hours, shift templates, a schedule period, availability, and audit data.

## Authentication Setup

Create Google OAuth credentials and set:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

Only users with an active store membership are allowed through the Auth.js sign-in callback.
Users with a pending, unexpired store invite are also allowed through Google login so they can accept the invite and activate membership.
The signed-in email is matched to an active user and active store membership on the server before the app renders. The manager `Employees` tab creates Gmail invitations. Employees are locked to their own identity, and manager-only APIs independently enforce manager status.
The app only distinguishes between manager access and employee access; store-specific job roles are intentionally not part of the workflow.
Managers can still work floor shifts. In this app, manager/employee is an access level, not a store job role, so active manager accounts can appear in availability, assignment, shift, coverage, and swap workflows.

## Email Setup

Set:

```bash
RESEND_API_KEY=""
EMAIL_FROM="The Schedule <schedule@your-domain.com>"
OWNER_ALERT_EMAIL="m.kodithuwakku803@gmail.com"
CRON_SECRET="replace-with-a-long-random-secret"
```

Email helpers return `queued` when Resend is not configured, which keeps development safe while preserving notification log semantics.
The manager header and Settings screen include a test email action. Without `RESEND_API_KEY`, the app logs notifications as queued; with Resend configured, the same action attempts a real send.
The secured Vercel Cron route runs daily, overwrites each store's single protected schedule snapshot, and sends one availability request to every active store member exactly three Edmonton calendar days before the schedule release date. `CRON_SECRET` authorizes that route.
Managers can inspect the latest backup in Settings, create one immediately, or restore it by typing `RESTORE LATEST BACKUP`. Restore verifies a SHA-256 integrity fingerprint and creates a new workspace run identifier so stale tabs cannot overwrite recovered data. A clean-run reset also refreshes this protected copy immediately before deleting UAT state.
Publishing sends one consolidated email per active member, including all assigned shifts and a link to the hosted application. Notification logs store deterministic deduplication keys, Resend delivery IDs, queued/sent/failed status, and failure reasons.
Reported UAT issues and notification delivery failures are sent to the owner alert email, defaulting to `m.kodithuwakku803@gmail.com`. Real delivery still requires `RESEND_API_KEY`; otherwise those owner alerts are recorded as queued.

For hosted testing, set `NEXT_PUBLIC_APP_URL` and `NEXTAUTH_URL` to the public HTTPS app URL so invite links work from phones and other devices.

## Future Multi-Store Scalability

The current UAT build is intentionally focused on one store: Men Are From Mars. If the manager likes the workflow and wants to use the same application for another mall store, the app should expand through the existing store/member architecture instead of becoming a separate copy.

Planned multi-store expansion:

- Add a manager store switcher for users who manage more than one store.
- Keep each store's employee list, invites, availability, shifts, coverage, swaps, reports, and notifications separate.
- Allow one Gmail account to belong to multiple stores through store memberships.
- Add store-specific branding: store name, logo, accent colors, and default light/dark theme behavior.
- Keep light/dark mode as a personal user preference while applying the selected store's brand theme underneath it.
- Scope every production query by `storeId` and `schedulePeriodId` to prevent cross-store data mixing.
- Extend the local test mode with multiple store presets only after the single-store UAT flow is stable.

The Prisma schema already includes `Store` and `StoreMembership`, so the production expansion should build on those entities. The current JSON-backed test repository is single-store by design and should be replaced or reshaped when multi-store testing begins.

## SRS Coverage

Implemented in the working MVP surface:

- Manager can add approved Gmail accounts.
- Manager can invite employees by Gmail.
- Manager invite creates a database invitation token for hosted UAT acceptance.
- Employees can submit full-day, shift-specific, and custom-time-range unavailability.
- Employees can edit and resubmit availability during the pre-release window.
- Managers can track availability submissions.
- Managers can generate default shifts from templates, add custom shifts, assign employees, see unavailable employees, and publish.
- Managers see a publish-readiness checklist before submitting the schedule.
- Assignment prevents unavailable employees when available employees exist, and requires an audited override when no available employee remains.
- Employees can view their shifts and the full team schedule.
- Employees can request coverage, offer coverage, and request swaps.
- Managers approve or reject coverage and accepted swaps before the schedule changes.
- Reports separate initial published hours from final worked hours and export CSV.
- Managers can log/export UAT issues, preview notification templates, and confirm schedule publishing before notifications are queued.
- Employees have mobile quick actions for availability, shifts, team schedule, and issue reporting.
- Print/download paths are available from schedule and report surfaces.

Next production hardening step: move each scheduling workflow from the shared Neon JSON workspace into its existing normalized Prisma models and transactional server actions while keeping the same business rules from `src/lib/demo-data.ts`.
