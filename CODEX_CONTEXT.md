# Codex Project Context

This file is the quick handoff for new Codex sessions working on The Schedule. Read this before making changes, then inspect the relevant source files directly.

## Project

The Schedule is a Next.js scheduling MVP based on the uploaded Store Scheduler SRS. It is currently focused on one mall store, Men Are From Mars, and replaces an Excel/paper scheduling workflow with manager and employee views.

The current product goal is hosted, authenticated UAT with Google identities and Neon-backed shared state:

- Employees can accept a mocked Gmail invite, submit unavailable days, submit no unavailable days, view shifts, request coverage, offer coverage, and request swaps.
- Managers can invite employees by Gmail, track availability, generate and assign schedules, review publish warnings, publish schedules, approve coverage/swaps, preview notifications, export reports, and log UAT issues.
- The test accounts are `m.kodithuwakku803@gmail.com` as manager/floor staff, plus `kodithuw@ualberta.ca`, `m.kodithuwakku.hockey@gmail.com`, and `bobby.cazby@gmail.com` as employees. A clean reset retains m.kodithuwakku803@gmail.com and a.t.morris03@gmail.com as managers and schedulable staff. Other employees must be invited; the workspace has no shifts or history and suggests future period dates from the real Edmonton reset date.
- The app has light/dark mode saved per test identity and a Men Are From Mars visual theme.
- Reported UAT issues and software-impacting notification failures should alert the owner email, currently `m.kodithuwakku803@gmail.com`.
- The future multi-store direction is documented, but the active test build is intentionally single-store.

## Current Architecture

- `src/components/the-schedule-app.tsx` is the main interactive MVP surface. Most current UI and test-mode workflow behavior lives here.
- `src/lib/demo-data.ts` holds seeded business data, scheduling helpers, availability conflict logic, hours calculations, and notification/log types.
- `src/lib/test-state-shared.ts` defines the persisted JSON test-state contract used by the client and API route.
- `src/lib/test-state.ts` normalizes the JSON-backed test-state payload.
- `src/lib/guided-uat.ts` defines the ordered, click-by-click normal schedule journey shown first in Test Plan, including progression into the next schedule.
- `src/lib/uat-checklist.ts` defines the 119-flow advanced production UAT plan and validates persisted manual results; guided steps reuse matching advanced IDs.
- `src/lib/schedule-progression.ts` creates semi-monthly schedule periods (days 1-14, then day 15 through month-end), advances the shared manager-controlled UAT date, and keeps bounded six-period publication history.
- `src/lib/uat-reset.ts` performs the manager-only clean-run reset, clears OAuth/session and UAT artifacts, retains both default managers, removes all employee memberships and orphaned users, and creates a new run identifier.
- `src/lib/auth.ts` configures Google/Auth.js and permits verified Google identities to link to pre-seeded or invited user records on first login.
- `src/lib/access.ts` resolves the signed-in Google account to an active Neon store membership.
- `src/lib/workspace-state.ts` persists and role-filters the shared schedule workspace in Neon.
- `src/lib/workspace-backup.ts` keeps one overwritten, SHA-256-verified workspace snapshot per store and performs guarded restores with stale-tab invalidation.
- `src/app/api/test-state/route.ts` requires authentication, allows managers full writes, and sanitizes employee writes to their own permitted workflow data.
- `src/app/api/notifications/test-email/route.ts` handles test notification sends/logging.
- `src/app/api/cron/schedule-rollout/route.ts` is the `CRON_SECRET`-protected daily Vercel job that opens due schedule windows on the real clock, overwrites protected snapshots, and sends availability reminders starting three Edmonton calendar days before release with catch-up through the deadline.
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
- `docs/LAUNCH_VERIFICATION.md` lists the current release gates and evidence needed. The owner confirmed the hosted configuration/email/cron/multi-device/restore checks on September 8. The owner clarified that the published September schedule was test data and requested a blank slate for real employee onboarding. A live clean reset was completed September 8 at 21:18 UTC, preserving a verified pre-reset backup. Workspace version 175 contains only the two default managers, an empty September 15–30 draft, no shifts/history/availability/invitations, and the real clock. Three old test employee users were removed. Do not restore or repopulate the test schedule; invite real employees and build the actual schedule.
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

1. Manager sends live invitations to every employee (including UAlberta when testing); each employee accepts from email with the matching Google account.
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
- Server-backed test persistence through `/api/test-state`, without browser workspace caching; legacy caches are cleared and failed authenticated reads never use a cache fallback.
- Shared workspace state revalidates whenever a browser tab becomes active, and visible manager sessions poll every five seconds and employee sessions every fifteen seconds so employee submissions appear without a manual resubmission or page reload. Client saves are debounced and serialized. Every write requires a matching workspaceVersion and uatRunId; conflicts pause saving and offer download/reload recovery. Employee GET and PUT responses are allowlisted, and cached state never substitutes for a failed authenticated read.
- Production-visible guided full schedule run followed by a 119-flow advanced manager UAT plan, with shared manual status tracking, filtering, and CSV/JSON export.
- Manager-only day progression can archive a published period, open the next draft, advance or jump to the reminder date, run real deduplicated reminder delivery, and repeat after the next publication.
- One bounded Neon schedule backup per store, overwritten daily or on demand, automatically refreshed before destructive resets, and restorable by an active manager.
- Every successful workspace save refreshes the same backup row; the cron covers idle days, while same-day manual and `pre_reset` snapshots are preserved from automatic save overwrites.
- Manager-only clean-run reset for first-login retesting, guarded by typed confirmation and stale-run write rejection. It removes every employee membership and orphaned employee user from Neon, leaving both default managers. There are no shifts, employee records, requests, or schedule history. Suggested schedule dates use the real reset date, without creating a normalized schedule period.
- UAT issue tracker and exports.
- Notification preview center and notification log.
- Owner alerts for reported UAT issues, notification delivery failures, and notification API outages.
- Publish confirmation screen before final publish.
- Phone-optimized Google sign-in and an employee-only layout below 768px with a compact account header, fixed bottom navigation, touch-sized shift actions, and a vertical team agenda. Manager tools and the existing desktop employee/calendar views remain desktop layouts. The signed-out desktop landing page uses a non-personalized feature overview and explicitly says real schedule data appears only after sign-in.
- Database-deduplicated availability reminder emails three days before release.
- Consolidated schedule publication emails with Resend provider IDs and failure reasons in `NotificationLog`.
- Invitation email actions open the regular application sign-in page in a fresh browser context and preserve the token acceptance route as the same-origin Google callback for reliable mobile handoff.
- Managers can correct the name or email on a pending invitation and resend it; resending replaces the token, renews the 14-day expiry, logs delivery, and is unavailable after acceptance.
- Schedule auto-complete assigns an employee at most once per day. Unfillable slots, duplicate same-day assignments, availability conflicts, and invalid time ranges are blocking errors; manual cover resolves an otherwise unfillable slot, and the publication API independently enforces the same rules.

## Future Expansion Notes

Multi-store support is planned but not active yet. When it is added:

- Keep stores, employees, memberships, periods, shifts, availability, notifications, and reports scoped by store.
- One Gmail account may belong to multiple stores through memberships.
- Add a manager store switcher.
- Add store-specific branding while keeping light/dark mode personal.
- Replace or reshape the single-store JSON test repository before multi-store UAT.

## Default managers

`m.kodithuwakku803@gmail.com` and `a.t.morris03@gmail.com` have manager access and can work shifts using their own employee view. `src/lib/default-managers.ts` defines the accounts retained by clean resets. Owner alerts continue using the original owner email.

## Real employee onboarding baseline

The September 8 clean reset cleared all test sessions and Google account links, so both managers sign in again. The empty September 15–30 draft opens availability September 8, deadline September 12, planned publication September 14. No schedule has been published. Existing pre-reset tabs cannot save over the new run. Do not reset again once real invitations or scheduling begin unless the user requests it.

## Production schedule lifecycle

- `src/lib/schedule-lifecycle.ts` runs before daily reminders. It snapshots and atomically opens the next draft on its availability opening date, retaining ongoing published shifts and requests.
- October 1–14 opens September 23; reminder September 27, availability deadline September 28, planned manager publication September 30. October 15–31 opens October 7 if the previous period is published.
- Automatic rollover never assigns or publishes shifts and never discards an unfinished draft. Keep `dayProgression.enabled` false in production.
- Employees see published windows while the manager prepares a later draft. Coverage/swaps update the appropriate historical or current publication. Availability counts and edits belong to the work period; older submissions remain for ongoing shift validation.
- Local suite: 64 passing tests, including real-clock transitions, repeated/missed cron invocations, preserved September workflows, distinct October notification keys, shift-specific availability, and draft email suppression. Browser checks use isolated mocked persistence.

## Next Likely Work

### September 10 bug fixes

- Real employees have now been invited and some have submitted availability. Preserve all live accounts, invitations, and workspace data; do not reset or reseed.
- Shift-specific availability matches the selected shift's submitted start/end times, allowing other overlapping templates (Open/Mid/Close and Sunday). Custom time ranges still use overlap and full-day entries still block the whole day. Existing submissions work without a migration or resubmission.
- Draft assignment/unassignment/removal/time changes do not create notifications or send emails. The shared `shift-notification-policy.ts` is applied in the client and notification API, including old open tabs. Publishing still sends consolidated emails; published shift-change emails remain enabled.
- Regression tests cover all template pairs, custom/full-day restrictions, unchanged submitted data, auto-assignment/publication validation, and the real notification route with mocked authentication, database, and email dependencies.
- Validation: 64 tests, lint, typecheck, and production build passed again before the user-authorized commit/push/deployment. Tests/build used an unreachable local database URL and disabled email credentials.
- Production release protection: full Neon snapshot `snap-dawn-cherry-a6za6t20` (`pre-shift-fixes-2026-09-10`) was created and listed successfully on September 10 at 23:41:42 UTC, from production branch `br-rough-sound-a6svpd1g` in project `restless-bar-72431784`. This includes accounts and invitations as well as workspace data. The read-only pre-deploy baseline was workspace version 399, 7 workspace people, 3 availability submissions, and 5 invitation records. No reset, seed, migration, or restore is part of this release.

Before broader real-user UAT:

- Monitor the September 23 automatic opening and September 27 reminder using the owner-confirmed production cron configuration.
- Version-checked saves now reject stale snapshots atomically. Normalized transactional operations remain a future improvement to reduce conflicts; verify the new conflict/download/reload flow across devices before launch.
- Add browser-level authentication tests for signed-out, uninvited, inactive, employee, and manager accounts; the current unit suite covers employee state-write authorization.
- Add manager-controlled activate/deactivate and promote/demote controls backed by `StoreMembership`, with audit logging and protection against removing the final active manager.
- Complete hosted mobile UAT for the employee dashboard, availability, team agenda, coverage, and swaps on a real phone.
- Complete hosted invite, login, availability, schedule, coverage, and swap UAT across manager and employee devices.
