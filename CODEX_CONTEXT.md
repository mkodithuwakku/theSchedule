# Codex Project Context

This file is the quick handoff for new Codex sessions working on The Schedule. Read this before making changes, then inspect the relevant source files directly.

## Project

The Schedule is a Next.js scheduling MVP based on the uploaded Store Scheduler SRS. It is currently focused on one mall store, Men Are From Mars, and replaces an Excel/paper scheduling workflow with manager and employee views.

The current product goal is personal UAT before production auth/database hardening:

- Employees can accept a mocked Gmail invite, submit unavailable days, submit no unavailable days, view shifts, request coverage, offer coverage, and request swaps.
- Managers can invite employees by Gmail, track availability, generate and assign schedules, review publish warnings, publish schedules, approve coverage/swaps, preview notifications, export reports, and log UAT issues.
- The active test accounts are `m.kodithuwakku803@gmail.com` as manager/floor staff, plus `kodithuw@ualberta.ca`, `m.kodithuwakku.hockey@gmail.com`, and `bobby.cazby@gmail.com` as employees.
- The app has light/dark mode saved per test identity and a Men Are From Mars visual theme.
- Reported UAT issues and software-impacting notification failures should alert the owner email, currently `m.kodithuwakku803@gmail.com`.
- The future multi-store direction is documented, but the active test build is intentionally single-store.

## Current Architecture

- `src/components/the-schedule-app.tsx` is the main interactive MVP surface. Most current UI and test-mode workflow behavior lives here.
- `src/lib/demo-data.ts` holds seeded business data, scheduling helpers, availability conflict logic, hours calculations, and notification/log types.
- `src/lib/test-state-shared.ts` defines the persisted JSON test-state contract used by the client and API route.
- `src/lib/test-state.ts` normalizes the JSON-backed test-state payload.
- `src/app/api/test-state/route.ts` persists local UAT state to `data/test-state.json`.
- `src/app/api/notifications/test-email/route.ts` handles test notification sends/logging.
- `src/app/api/invites/route.ts` creates production invite records and sends invite emails.
- `src/app/api/invites/accept/route.ts` lets invited employees accept a token after Google sign-in.
- `src/lib/email.ts` wraps email delivery and defines the owner alert email fallback. Without `RESEND_API_KEY`, notifications safely return queued/logged behavior.
- `src/lib/app-url.ts` centralizes the public app URL used in invite links.
- `prisma/schema.prisma` contains the production-facing data model, including Store and StoreMembership for future multi-store expansion.
- `public/men-are-from-mars-logo.png` is the current store logo asset.
- `README.md` is the user-facing project overview and setup guide.
- `PRODUCTION_SETUP.md` is the hosted UAT checklist and manager domain/payment handoff.

## Local Commands

```bash
npm run dev
npm run lint
npm run typecheck
npm run build
```

The dev app usually runs at `http://127.0.0.1:3000`. If `npm run build` leaves the dev server returning 500s, stop the dev server, clear `.next`, and restart `npm run dev -- --hostname 127.0.0.1 --port 3000`.

`npm run dev` intentionally resets `data/test-state.json` through `predev` so each local UAT run starts from a clean checklist state. The fresh state still shows the default shift blocks, but has no accepted invites, availability submissions, assignments, requests, or UAT issue progress.

## UAT Flow To Preserve

The app should start before schedule release so the manager can test the whole cycle:

1. Employee accepts the mocked invite.
2. Employee submits unavailable days, or submits no unavailable days.
3. Manager checks availability status and missing-submission highlights.
4. Manager generates a draft schedule.
5. Manager assigns employees from the Sunday-start calendar builder.
6. Manager reviews publish confirmation, warnings, employee notifications, and hours snapshot.
7. Manager publishes.
8. Employees review their shifts and team calendar.
9. Coverage requests and swaps can be tested after publishing.
10. UAT issues can be logged, resolved/reopened, and exported.

Important UX expectations from the user:

- The calendar must look like a real calendar, with weeks starting on Sunday.
- Names in calendar cells should not be cut off.
- The UI should feel modern, spacious, and not tiny or cluttered.
- Roles should remain simple: manager or employee only. Do not add store job roles.
- Managers can work floor shifts. Keep manager/employee as access roles, but active managers must be schedulable and able to use the employee view for their own availability, shifts, coverage, and swaps.
- Employees who have not submitted availability should have a visible highlighted notification/prompt.
- Dark mode should be personal preference, not a global store toggle.

## Current Test Features

- Test-mode scenario buttons: Fresh pre-release, Availability submitted, Draft generated, Published.
- Server-backed test persistence through `/api/test-state`, with browser localStorage fallback.
- Manager UAT checklist.
- UAT issue tracker and exports.
- Notification preview center and notification log.
- Owner alerts for reported UAT issues, notification delivery failures, and notification API outages.
- Publish confirmation screen before final publish.
- Mobile employee quick actions.

## Future Expansion Notes

Multi-store support is planned but not active yet. When it is added:

- Keep stores, employees, memberships, periods, shifts, availability, notifications, and reports scoped by store.
- One Gmail account may belong to multiple stores through memberships.
- Add a manager store switcher.
- Add store-specific branding while keeping light/dark mode personal.
- Replace or reshape the single-store JSON test repository before multi-store UAT.

## Next Likely Work

Before real UAT:

- Add stronger browser smoke tests for the full manager/employee cycle.
- Add production route/server-action layer backed by Prisma instead of JSON test state.
- Add real Google invite acceptance and membership activation flow.
- Add mobile visual QA for the calendar, availability submission, and employee dashboard.
- Add seed/test data reset tooling that preserves a clean UAT start state.
