# Launch verification

Updated September 8, 2026. Record the deployed commit, deployment URL, Edmonton timestamp, tester, account, browser/device, and evidence for every hosted result. Local tests and mocked browser checks do not prove a live service works.

## Implementation and local verification

- Workspace reads return the database `workspaceVersion`. Writes atomically compare version and `uatRunId`; a stale or missing revision returns 409. No schema migration is needed for this change because the version column already exists.
- Browser saves are serialized. Conflicts and uncertain saves pause editing, retain the unsaved snapshot for download, and require an explicit reload. Reloading discards the tab's unsaved changes; reapply them after reviewing the latest saved schedule.
- Publication and day progression require the browser revision. Notification appends recompute from the latest workspace and retry version conflicts within the same run.
- Employee GET and PUT responses exclude coworker availability/drafts/preferences/emails, unpublished shifts, internal shift notes, manager audit records, UAT issues/results, and invitation acceptance records. Published team shifts and names, relevant requests, own availability/preferences/notifications remain available.
- Clean reset retains `m.kodithuwakku803@gmail.com` and `a.t.morris03@gmail.com` as managers and schedulable staff, removes all employee memberships and orphaned users, and leaves no shifts, requests, availability, invitations, notifications, preferences, or schedule history. Store configuration remains. Suggested future dates are calculated from the real Edmonton reset date; no normalized schedule period is created.
- Local automated tests cover concurrent manager/employee writes, version rejection, notification append races, employee response filtering and redacted coverage offers, and the default-manager reset transaction. They use controlled database adapters, not Neon.
- The local isolated browser check uses mocked API responses to verify the empty dashboard, serialized saves, and visible 409 recovery controls. It does not test Google authentication or hosted persistence.

On September 8 the owner confirmed that the hosted configuration, email/cron delivery, multi-device workflows, and backup restoration checks work. These are owner-confirmed results; the agent did not repeat destructive reset/restore or send emails. The agent independently read the live workspace: September 15–30 is published, all 36 shifts are filled (34 employee assignments and two named manual covers), four active members have submitted availability, no blocking scheduling issues were found, and simulated time is disabled. Preserve this operational schedule.

Local result for this implementation: **59/59 automated tests passed; lint, TypeScript, production build, and diff checks passed.** Browser checks confirmed zero-shift owner-only rendering, successive revisions with at most one in-flight save, visible conflict recovery, and removal of legacy workspace caches.

## Deployed release evidence

Commit `77b194e4f9ea009901f2c12ff9e3c66f1bcad782` reached Ready in Vercel production as `dpl_BFQc2o8aUdV4fv5mVjam74G2Jqfs` on September 8. The canonical alias is `https://mafm-schedule.vercel.app`. Post-deployment checks returned HTTP 200 for the Google sign-in page, HTTP 401 for a signed-out workspace request, and HTTP 401 for unsigned cron access; the browser reported no runtime errors. The live workspace remained at version 173 with its September publication intact. A follow-up clarifies the availability period label on mobile.

The isolated mobile browser check successfully submitted October availability while retaining the employee's September submission, with one save in flight and no runtime errors. These mocked checks do not replace the owner's confirmed hosted workflows.

## Required hosted checks

The owner has confirmed the hosted checks below. Keep this table as the repeatable release checklist. The new version protection, employee filtering, and automatic period transition are covered by local regression tests; hosted authenticated regression checks should use the deployed release. Do not reset the populated September schedule to repeat UAT.

| Gate | What to verify | Evidence required to pass |
| --- | --- | --- |
| Exact deployment | Deploy the intended commit; confirm the canonical HTTPS domain serves it, the deployment is Ready, and old tabs reload the new client. | Commit/deployment identifier and successful page/API load on the canonical domain. |
| Production configuration | Verify Production-scoped `DATABASE_URL`, Google client ID/secret, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, `OWNER_ALERT_EMAIL`, and `CRON_SECRET`. Confirm OAuth origin/callback matches the canonical domain and intended employees are eligible under the Google consent configuration. | Configuration presence/scope and callback checks; record no secret values. |
| Database | Confirm all migrations are applied to the intended Neon database, including notification delivery tracking and workspace backup tables. Confirm the workspace version increases after a successful save. | Migration status and a harmless change that survives refresh and appears on a second session. |
| Default-manager reset | Use the typed reset control before loading real operational data. Verify the two default managers are the only active people; every former employee is denied until newly invited. Check zero shifts/history and fresh suggested dates. | Workspace and membership counts, successful owner sign-in, rejected old employee access, rejected stale-tab write. Store configuration and pre-reset backup remain. |
| Authentication and authorization | Test signed-out, uninvited, expired invitation, inactive user, inactive membership, employee, and manager identities. Test first and repeat Google sign-in, including a real phone. Call protected APIs directly, including manager-only reset, backup, publish, progression, invites, and reports. | Expected 401/403 for denied requests; correct identity and role for approved sessions; no schedule data on the signed-out page. |
| Employee privacy | Inspect both GET and successful PUT response bodies as an employee. Seed recognizable private markers in another employee's draft and manager records during UAT. Inspect the page's serialized props and local storage after switching accounts and after a failed load. | Private markers and coworker emails absent; draft shifts absent; own availability and published team calendar still work; no prior account's workspace is loaded from cache. |
| Concurrent editing | Test manager/manager, manager/employee, employee/employee, and two devices using the same identity. Overlap writes; also make a second local edit while the first save is delayed. | One writer wins a version race and the other receives 409 with a recovery banner; no silent rollback. Download/reload/reapply preserves both intended changes. Same-tab requests serialize and use successive revisions. |
| Network recovery | Interrupt a save and test a failed initial load. Reconnect while another session changes the schedule. | No false Saved status; unsaved data remains downloadable; no automatic replay of an uncertain/stale snapshot; explicit reload returns the actual current state. |
| Invitations and email | Invite new employees, accept each email with the matching Google identity, test wrong-account/expired/reused tokens, and correct/resend a pending invitation. Send an application test email. | Actual inbox receipt, canonical links, correct membership, logged provider ID, and sent status. Queued status is a failed production email gate. |
| Publication | Build and publish; test a stale publish request and retry the successful publication. Edit from another session while publication emails are being delivered. | Stale publish rejected before publication/email effects; one consolidated schedule email per active member; retries deduplicate; shifts and intervening edits remain intact. |
| Real scheduled cron | Verify Vercel recognizes `vercel.json` and invokes the daily route at 16:00 UTC. Verify an unsigned request is rejected. Verify the actual scheduled authorized invocation produces a current backup and delivers availability reminders beginning three Edmonton days before release, with catch-up through the availability deadline. Repeat the same logical reminder to verify deduplication. | Actual cron invocation log, HTTP/result status, current backup metadata, reminder inbox receipt and provider IDs, and no duplicate emails. The in-app simulated-date action alone does not prove the Vercel scheduler works. |
| Backup and restore | During disposable UAT, create a manual backup, make a known harmless change, then restore. Keep an old tab open throughout. Also verify the daily snapshot and pre-reset snapshot. | Checksum/size verification passes; the intended older schedule returns; restore changes the run ID/version; the old tab cannot save over it. A workspace restore does not recreate employee identities/memberships deleted by reset; those require reinvitation or database recovery. |
| Full employee/manager cycle | Complete invitation, availability (including no unavailable days), generation/editing, publish, employee review, coverage offer/approval/rejection, swap consent/approval/rejection, and reports on separate profiles and a real phone. | Shared persisted results, correct assignments/hours, readable mobile controls, and no unauthorized action or missing required notification. |
| Next period and real clock | Complete a second semi-monthly period, including reminder and publication emails. Return to Use real date again after any simulated-date test. | Correct dates/history, new notification deduplication keys, new emails delivered, and `dayProgression.enabled` false before operational use. |
| Operational handoff | Review UAT failures, verify owner alerts reach the intended inbox, confirm backup limitations and Neon recovery window, and identify the deployment rollback target and incident owner. | No unresolved critical/high-impact launch defect; exported UAT results and an agreed recovery procedure. |

## September and October operational dates

| Date (Edmonton) | Behavior |
| --- | --- |
| September 15–30 | Existing published schedule remains available; 36 filled shifts (34 employee assignments and two named manual covers) verified read-only. |
| September 23 | Daily cron opens the October 1–14 draft and fresh availability collection. September shifts, availability, coverage, and swaps remain available. |
| September 27 | October availability reminder becomes due; a missed invocation can catch up through September 28. Delivery claims prevent duplicate sends. |
| September 28 | October availability deadline. |
| September 30 | Planned October publication date; the manager must finish assignments, review, and publish. |
| October 1 | Employees use the published October schedule. No automatic assignment or publication occurs. |
| October 7 | If October 1–14 has been published, the cron opens October 15–31. |

The cron is configured for 16:00 UTC daily (10:00 Edmonton during September/October). Window opening is idempotent, stays on the real clock, and does not replace an unfinished draft. A protected snapshot is taken before rollover. Published schedules remain selectable while a later draft is prepared. Availability submissions are scoped to their period. Local browser verification uses simulated September 23 with mocked persistence to exercise the employee and manager views without changing production data.

## Disposable UAT run order

1. Confirm deployment/configuration/database and create a protected backup.
2. Perform the default-manager reset as a deliberate UAT setup step; invite disposable test employees.
3. Verify authentication/privacy/concurrency/network recovery before trusting normal workflow results.
4. Complete the full schedule journey, real email checks, real cron evidence, next period, and restore drill.
5. Export results and resolve failed gates. Remove UAT data using the deliberate reset control when ready to begin real setup, invite the real staff, review schedule dates, and confirm the real clock is active.

The daily snapshot is a single overwritten recovery point, not a historical archive. Choose a useful pre-change snapshot before a restore drill. Keep all email/reset/restore tests within the intended test store and agreed test accounts.
