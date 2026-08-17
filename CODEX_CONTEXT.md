# Codex Project Context

This file is the quick handoff for new Codex sessions working on The Schedule. Read this before making changes, then inspect the relevant source files directly.

## Project

The Schedule is a Next.js scheduling MVP based on the uploaded Store Scheduler SRS. It is currently focused on one mall store, Men Are From Mars, and replaces an Excel/paper scheduling workflow with manager and employee views.

The current product goal is hosted, authenticated UAT with Google identities and Neon-backed shared state:

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
- `src/lib/guided-uat.ts` defines the ordered, click-by-click normal schedule journey shown first in Test Plan, including progression into the next schedule.
- `src/lib/uat-checklist.ts` defines the 117-flow advanced production UAT plan and validates persisted manual results; guided steps reuse matching advanced IDs.
- `src/lib/schedule-progression.ts` creates consecutive schedule periods, advances the shared manager-controlled UAT date, and keeps bounded six-period publication history.
- `src/lib/uat-reset.ts` performs the manager-only clean-run reset, restores seeded identities, clears OAuth/session and UAT artifacts, and creates a new run identifier.
- `src/lib/auth.ts` configures Google/Auth.js and permits verified Google identities to link to pre-seeded or invited user records on first login.
- `src/lib/access.ts` resolves the signed-in Google account to an active Neon store membership.
- `src/lib/workspace-state.ts` persists and role-filters the shared schedule workspace in Neon.
- `src/lib/workspace-backup.ts` keeps one overwritten, SHA-256-verified workspace snapshot per store and performs guarded restores with stale-tab invalidation.
- `src/app/api/test-state/route.ts` requires authentication, allows managers full writes, and sanitizes employee writes to their own permitted workflow data.
- `src/app/api/notifications/test-email/route.ts` handles test notification sends/logging.
- `src/app/api/cron/schedule-rollout/route.ts` is the `CRON_SECRET`-protected daily Vercel job that overwrites each store's protected schedule snapshot and sends availability requests three Edmonton calendar days before release.
- `src/app/api/schedule/publish/route.ts` is the manager-only publication path that persists publication and sends one consolidated schedule email per active member.
- `src/lib/schedule-rollout.ts` contains pure Edmonton date, recipient, consolidation, and retry-deduplication planning logic.
- `src/lib/schedule-notifications.ts` connects rollout plans to Prisma notification claims and Resend delivery.
- `src/app/api/invites/route.ts` creates production invite records and sends invite emails.
- `src/app/api/invites/accept/route.ts` lets invited employees accept a token after Google sign-in.
- `src/lib/email.ts` wraps email delivery and defines the owner alert email fallback. Without `RESEND_API_KEY`, notifications safely return queued/logged behavior.
- `src/lib/app-url.ts` centralizes the public app URL used in invite links.
- `prisma/schema.prisma` contains the production-facing data model, including Store and StoreMembership for future multi-store expansion.
- `StoreWorkspaceState` is the current hosted shared-state bridge while schedule workflows are moved into normalized Prisma models.
- `public/men-are-from-mars-logo.png` is the current store logo asset.
- `README.md` is the user-facing project overview and setup guide.
- `PRODUCTION_SETUP.md` is the hosted UAT checklist and manager domain/payment handoff.
- `docs/README.md` is the documentation index. Its architecture, API, user, UAT, and operations guides are the maintained project reference and should be updated with relevant behavior changes.

## Local Commands

```bash
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
```

The dev app usually runs at `http://127.0.0.1:3000`. If `npm run build` leaves the dev server returning 500s, stop the dev server, clear `.next`, and restart `npm run dev -- --hostname 127.0.0.1 --port 3000`.

Starting the development server does not reset Neon. Use the manager-only `Test Plan` clean-run control only when a deliberately destructive first-login UAT restart is required; development scenario presets remain available for non-destructive local setup.

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

Authentication rules to preserve:

- Every page visit requires Google sign-in and an active `User` plus active `StoreMembership`.
- Employees are bound to the profile matching their signed-in email and cannot switch identities.
- Managers can use manager tools and their own employee view, but cannot impersonate another employee.
- Manager permissions must be checked again in route handlers; hiding a control is not sufficient authorization.

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
- Production-visible guided full schedule run followed by a 117-flow advanced manager UAT plan, with shared manual status tracking, filtering, and CSV/JSON export.
- Manager-only day progression can archive a published period, open the next draft, advance or jump to the reminder date, run real deduplicated reminder delivery, and repeat after the next publication.
- One bounded Neon schedule backup per store, overwritten daily or on demand, automatically refreshed before destructive resets, and restorable by an active manager.
- Every successful workspace save refreshes the same backup row; the cron covers idle days, while same-day manual and `pre_reset` snapshots are preserved from automatic save overwrites.
- Manager-only clean-run reset for first-login retesting, guarded by typed confirmation and stale-run write rejection.
- UAT issue tracker and exports.
- Notification preview center and notification log.
- Owner alerts for reported UAT issues, notification delivery failures, and notification API outages.
- Publish confirmation screen before final publish.
- Mobile employee quick actions.
- Database-deduplicated availability reminder emails three days before release.
- Consolidated schedule publication emails with Resend provider IDs and failure reasons in `NotificationLog`.

## Future Expansion Notes

Multi-store support is planned but not active yet. When it is added:

- Keep stores, employees, memberships, periods, shifts, availability, notifications, and reports scoped by store.
- One Gmail account may belong to multiple stores through memberships.
- Add a manager store switcher.
- Add store-specific branding while keeping light/dark mode personal.
- Replace or reshape the single-store JSON test repository before multi-store UAT.

## Next Likely Work

Before broader real-user UAT:

- Confirm `CRON_SECRET` is present in Vercel Production before relying on the scheduled rollout route.
- Replace whole-workspace autosaves with normalized Prisma route handlers/server actions and database transactions. This prevents stale manager and employee browser snapshots from overwriting each other.
- Add browser-level authentication tests for signed-out, uninvited, inactive, employee, and manager accounts; the current unit suite covers employee state-write authorization.
- Add manager-controlled activate/deactivate and promote/demote controls backed by `StoreMembership`, with audit logging and protection against removing the final active manager.
- Add mobile visual QA for the calendar, availability submission, and employee dashboard.
- Complete hosted invite, login, availability, schedule, coverage, and swap UAT across manager and employee devices.
