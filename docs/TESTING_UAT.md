# Testing and UAT runbook

This is the operating manual for validating normal production behavior and edge cases. The actual saved checklist lives inside the production application under `Test Plan` so results are shared across browsers and retained in Neon.

## What a complete test run proves

A release is ready for manager demonstration only after all of these work together:

- canonical HTTPS deployment;
- first and repeat Google login;
- active membership and employee identity boundaries;
- invitation and acceptance;
- every availability style;
- draft generation and editing;
- publish review and consolidated schedule emails;
- employee schedule views;
- coverage and swaps through manager decision;
- reports, print, exports, issues, and notifications;
- refresh persistence and stale-tab protection;
- recurring schedule day progression and next-cycle emails;
- manual/daily backup and verified restore;
- clean first-login reset.

## Test accounts and browser setup

Use four independent browser profiles or private-session containers:

| Profile | Account | Expected access |
| --- | --- | --- |
| Manager | `m.kodithuwakku803@gmail.com` | Manager tools and own employee view |
| Employee A | `kodithuw@ualberta.ca` | Employee only |
| Employee B | `m.kodithuwakku.hockey@gmail.com` | Employee only |
| Employee C | `bobby.cazby@gmail.com` | Employee only |

Do not open multiple Google identities in ordinary tabs of the same browser profile. Google may replace the active session and make the test result ambiguous.

Before starting:

1. Confirm you can access every test inbox.
2. Label each browser window with the account name.
3. Open the production URL in each window.
4. Keep the manager window available for checking `Saved`, `Notifications`, and `UAT Issues`.
5. Record the test date, deployed commit, browser/device, and tester name in your external notes or exported result file.

## How to use the in-app checklist

1. Sign in as the manager.
2. Select `Test Plan`.
3. Start in `Guided Full Schedule Run`.
4. Open the first step and follow its `Account`, `Clicks`, and `Expected result` exactly.
5. Mark one result:
   - `Passed` only when the visible result and any required inbox/database persistence check match;
   - `Failed` when the application behaves incorrectly;
   - `Blocked` when an external dependency makes the result impossible to determine;
   - `Not run` when it has not been attempted.
6. For every failure, use `Report issue` immediately and include the step ID, account, approximate time, expected result, actual result, and screenshot if available.
7. Continue in order. Guided results automatically update matching advanced tests.
8. After the normal journey passes, continue through the `Advanced Production UAT` groups.
9. Export results as CSV or JSON at the end of the session.

The guided run contains 48 normal-business steps. The advanced catalog contains 117 tests covering release configuration, authentication, invitations, employee experience, availability, builder behavior, publication, requests, reports, persistence, backups, recurring cycles, authorization failures, provider failure behavior, and reset behavior.

## Guided normal production journey

Follow these phases in order. The in-app cards contain the most specific click text and expected result.

### Phase 1: start and authenticate

1. Sign in as manager from the production URL.
2. Wait for `Saved`, refresh, and prove the Neon workspace returns.
3. Sign in all three employees in separate profiles.
4. Confirm each employee sees their own name and no manager tools.

Pass condition: all approved first logins work without `OAuthAccountNotLinked` or `AccessDenied`, and identities cannot be switched.

### Phase 2: manager setup and email

1. Review period/deadline/release settings.
2. Make and revert one harmless employee-name edit.
3. Invite a spare Google account if one is available; otherwise mark only that optional step blocked.
4. Send a test email from `Settings` and confirm the inbox and log.

Pass condition: settings and directory changes persist, and the production email path records and delivers one message.

### Phase 3: collect availability

1. Employee A submits a full unavailable day.
2. Employee B submits shift-specific unavailability.
3. Employee C submits a custom time range.
4. Manager switches to `My employee view` and submits no unavailable days.
5. Employee A un-submits, corrects, and resubmits.
6. Manager verifies all four cards in the tracker.

Pass condition: all normal entry types persist and the manager sees four completed submissions with accurate details.

### Phase 4: build the draft

1. Auto-complete the draft.
2. Inspect every Sunday-start calendar week and all names/times.
3. Confirm the manager can receive a floor shift.
4. Reassign one shift and return it if needed.
5. Add, edit, and remove one temporary shift.
6. Clear one assignment, verify `Unassigned`, and repair it.
7. Wait for `Saved`, refresh, and compare the finished draft.

Pass condition: the complete draft remains intact, readable, and availability-aware after refresh.

### Phase 5: publish

1. Open `Publish` and inspect warnings, recipients, and hours.
2. Cancel once and prove the draft remains unpublished.
3. Reopen the review and confirm publication once.
4. Check `Notifications` and all four inboxes.

Pass condition: the period becomes published exactly once and every active member receives one consolidated schedule message or an explicitly understood provider result.

### Phase 6: employee review

1. Refresh all employees.
2. Compare `My shifts`, `Team schedule`, and the email contents.
3. Check at least one phone-sized view.
4. Toggle theme in one employee account and prove it does not change other identities.

Pass condition: each person sees the correct personal shifts and common team calendar without access or layout leaks.

### Phase 7: coverage

1. Employee A requests coverage for one assigned published shift.
2. Employee B offers coverage.
3. Manager reviews and approves.
4. Confirm the shift moves to Employee B and related views/logs update.
5. Use a second request to test rejection without assignment change.

Pass condition: only manager approval changes the official assignment.

### Phase 8: swap

1. Employee A requests a swap with Employee C.
2. Employee C accepts.
3. Manager approves.
4. Confirm both assignments exchange.
5. Test the target-decline or manager-reject alternative on a separate request.

Pass condition: two-stage consent works and rejected/declined requests never change the schedule.

### Phase 9: reports, issues, notifications, backup, and sign-out

1. Compare initial and final hours after request decisions.
2. Download CSV and inspect print preview.
3. Report a UAT issue, resolve it, and reopen it.
4. Export issue/test results.
5. Create a manual schedule backup and inspect its metadata.
6. Sign out, use Back, and refresh.

Pass condition: operational records are usable and sign-out does not reveal protected data.

## Day progression and recurring email test

Run this only after the first schedule is successfully published. It uses a shared simulated date and may send real production emails.

### Start the next schedule cycle

1. In the manager window, open `Test Plan`.
2. Expand `Day Progression & Next Schedule Test`.
3. Record the active published period and current backup time.
4. Select `Start next schedule cycle`.
5. Confirm the prior schedule appears in schedule history.
6. Confirm a consecutive new period is `Draft` and the shared simulated date is enabled.
7. Open `Settings` and confirm the protected backup was refreshed before transition.

Expected result: the published schedule is preserved in both bounded history and the backup; the new cycle starts without deleting it.

### Walk ordinary days

1. Record the simulated date.
2. Select `Advance 1 day`.
3. Confirm the date advances exactly one Edmonton calendar day.
4. Refresh one employee browser.
5. Confirm that employee sees the same schedule period and availability-window state.
6. Repeat for at least one day when no email is due.
7. Check `Notifications` and verify no reminder was created on a non-due day.

Expected result: date-dependent prompts change consistently across accounts and ordinary days do not send reminder emails.

### Trigger the reminder day

1. In the manager progression panel, select `Jump to reminder email day`.
2. Confirm the displayed date equals three Edmonton calendar days before release.
3. Review the returned attempted/sent/queued/failed/duplicate counts.
4. Open `Notifications` and all four inboxes.
5. Confirm one availability request per active member.
6. Select the jump/advance action again without changing the period.
7. Confirm the second execution reports duplicates skipped and does not create another email per person.

Expected result: the same deduplicated reminder path as Vercel Cron runs once for the period and retry is safe.

### Build and publish the next schedule

1. Submit availability from all four identities for the new period.
2. Manager checks `Availability` for four completed submissions.
3. Open `Builder`, auto-complete, review, and repair the draft.
4. Publish through the normal confirmation screen.
5. Confirm a new consolidated publication email for the new period reaches every active member.
6. Compare this period's notification keys/results with the first period; they must be distinct rather than treated as duplicates.

Expected result: a second real schedule cycle completes with new availability and new publication email deliveries.

### Prove a third cycle can begin

1. Return to the progression panel.
2. Select `Start following cycle`.
3. Confirm the second published period moves to history and the third consecutive draft opens.
4. Inspect history and confirm it is ordered and expandable.
5. Select `Use real date again` when progression testing is finished.
6. Confirm the current period/history remain while date rules return to the real Edmonton day.

Expected result: recurring cycles can continue and stopping the simulation does not delete schedule data.

## Backup and restore test

Use a harmless, easily recognized manager change. Do not run this while employees are actively editing.

1. Wait for `Saved` and note a current shift assignment.
2. Open `Settings` → `Schedule Backup`.
3. Select `Back up now` and record backup time, version, reason, size, and integrity identifier.
4. Change the chosen shift assignment and wait for `Saved`.
5. Confirm the same-day manual recovery point is still shown rather than immediately overwritten by autosave.
6. Type `RESTORE LATEST BACKUP` exactly and confirm.
7. Refresh the page.
8. Confirm the original assignment returns.
9. Refresh an employee window and confirm it sees recovered state.
10. Attempt a save from an old tab that was open before restore; it should receive a stale-run conflict and require refresh.
11. Create a new manual backup after confirming recovery.

Pass condition: integrity verification succeeds, the expected snapshot returns, and no old tab can overwrite it.

## Clean first-login reset

Use this only when the entire test slate must be wiped. It is destructive and signs out all test accounts.

Before reset:

1. Export UAT results and issues.
2. Record any evidence still needed for failures.
3. Stop all employee editing.
4. Confirm you can sign back into the four seeded accounts.

Reset:

1. As manager, open `Test Plan` → `Clean production UAT run`.
2. Read the complete deletion warning.
3. Type `RESET CLEAN RUN` exactly.
4. Confirm the browser warning.
5. Wait for the reset response and sign-out.
6. Refresh all employee windows and confirm they are also signed out.
7. Sign in again as manager and then each employee.
8. Confirm first-login linking works and no old checklist, schedule, request, invitation, session, or notification state returns.
9. Confirm the four seeded people and a date-relative availability period exist.
10. Try refreshing an old pre-reset tab; it must not restore stale data.

The reset preserves store configuration and recreates the seeded access baseline. It clears workspace/checklist data, invitations, normalized schedule data, notification claims/logs, audit data, OAuth accounts, and sessions. A protected `pre_reset` backup is made first, but do not use reset as a routine way to start a new schedule cycle.

## Advanced testing order

After the guided run, use this risk order inside `Advanced Production UAT`:

1. Critical release, authentication, and authorization tests.
2. Invitation token failure and identity mismatch tests.
3. Availability validation and deadline boundaries.
4. Builder conflict, empty/partial draft, and publish retry tests.
5. Coverage and swap rejection/cancellation alternatives.
6. Refresh, multi-browser, stale-write, and concurrency tests.
7. Email queued/failed/deduplicated behavior.
8. Backup failure/integrity and reset protections.
9. Mobile layout, theme isolation, exports, and print.

Never deliberately alter a production secret, corrupt a real backup, expire a live token, or simulate a provider outage without a safe prepared environment. Mark unsafe production experiments `Blocked` and reproduce them locally or in a separate preview database.

## Automated validation

Run from the repository root:

```bash
npm install
npm test
npm run lint
npm run typecheck
npm run build
```

The current automated suite covers authentication configuration, schedule progression, reminder planning/deduplication, UAT checklist integrity, workspace backup behavior, and employee state-write authorization. It does not replace the four-account browser journey or live inbox verification.

## Release decision

The manager demo is ready only when:

- every critical guided step is `Passed`;
- no critical advanced test is `Failed`;
- every blocked critical item has an owner and safe follow-up plan;
- first-login manager and employee flows work after a clean reset;
- the deployed commit matches the intended `main` commit;
- Neon migrations are applied;
- the canonical deployment is ready and returns the sign-in screen;
- test email, publication email, and progression reminder email have been verified in real inboxes;
- a current verified backup exists and one restore drill has passed;
- all failures have UAT issues with enough evidence to reproduce.

Passing automated checks alone means the code is internally consistent. It does not prove Google, Resend, Vercel Cron, inbox placement, or multi-user production behavior.
