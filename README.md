# The Schedule

Responsive web MVP for replacing a store's Excel and paper scheduling workflow.

The app is based on the uploaded Store Scheduler SRS and includes:

- Google/Auth.js-ready approved Gmail access control
- Prisma PostgreSQL schema for users, stores, memberships, periods, availability, shifts, coverage, swaps, snapshots, notifications, and audit logs
- API-backed test state saved on the server for the current manager/employee simulation
- West Edmonton Mall default store hours and shift templates
- Manager dashboard, employee management, availability tracker, schedule builder, coverage/swap approvals, hours report, CSV export, print view, and settings
- Employee dashboard, availability submission, my shifts, full team schedule, coverage offers, and swap requests
- Availability conflict checks using full-day, shift-template, and custom-time overlap rules
- Initial published hours versus final worked hours reporting
- Resend email utility functions for schedule publishing and availability reminders

## Quick Start

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

The visible MVP uses seeded test data and saves the current test run through `/api/test-state` into `data/test-state.json`. That lets you act as the manager and multiple employees before connecting a live database.

## Test Workflow

The app currently opens in a pre-release test state:

1. Switch to `Employee`, choose different employees, and submit unavailable days or time ranges.
2. Switch to `Manager` and watch the `Availability` tab badge count drop as employees submit.
3. Open `Builder`, click `Generate`, assign employees, and publish the draft schedule.
4. Switch back to employees to confirm their published shifts are visible.

Employees who have not submitted availability see a highlighted `Availability` tab and dashboard prompt.
The test state persists through the local API and mirrors to browser storage as a fallback. `Reset test` starts the simulated release cycle over.
Schedule views render as Sunday-start calendar weeks.
In the manager builder, click a shift to open the assignment panel, use `Unassigned` to filter unassigned shifts, and `Publish` warns before publishing with unassigned shifts.
Coverage requests and shift swaps are included in the saved test state, so they survive refreshes and can be tested across manager/employee role switches.

## Database Setup

Set `DATABASE_URL` in `.env`, then run:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

The seed creates a West Edmonton Mall sample store, a development manager, sample employees, store hours, shift templates, a schedule period, availability, and audit data.

## Authentication Setup

Create Google OAuth credentials and set:

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
NEXTAUTH_SECRET=""
NEXTAUTH_URL="http://localhost:3000"
```

Only users with an active store membership are allowed through the Auth.js sign-in callback.
The manager Settings screen links to the Auth.js sign-in route and shows the approved Gmail test accounts.

## Email Setup

Set:

```bash
RESEND_API_KEY=""
EMAIL_FROM="The Schedule <schedule@example.com>"
```

Email helpers return `queued` when Resend is not configured, which keeps development safe while preserving notification log semantics.
The manager header and Settings screen include a test email action. Without `RESEND_API_KEY`, the app logs the notification as queued; with Resend configured, the same action attempts a real send.

## SRS Coverage

Implemented in the working MVP surface:

- Manager can add approved Gmail accounts.
- Employees can submit full-day, shift-specific, and custom-time-range unavailability.
- Managers can track availability submissions.
- Managers can generate default shifts from templates, add custom shifts, assign employees, see unavailable employees, and publish.
- Assignment prevents unavailable employees when available employees exist, and requires an audited override when no available employee remains.
- Employees can view their shifts and the full team schedule.
- Employees can request coverage, offer coverage, and request swaps.
- Managers approve or reject coverage and accepted swaps before the schedule changes.
- Reports separate initial published hours from final worked hours and export CSV.
- Print/download paths are available from schedule and report surfaces.

Next production hardening step: replace the JSON-backed test repository with Prisma-backed server actions and route handlers while keeping the same business rules from `src/lib/demo-data.ts`.
