# Application user guide

This guide describes normal actions a manager or employee performs in The Schedule. For test result tracking, clean resets, and deliberate failure cases, use the [Testing and UAT runbook](./TESTING_UAT.md).

## Sign in and choose the correct session

1. Open [mafm-schedule.vercel.app](https://mafm-schedule.vercel.app).
2. Select `Continue with Google`.
3. Choose the exact Google account that was invited or seeded.
4. Confirm the signed-in name and access level in the application header.
5. Wait for the save indicator to settle before making another critical cross-account change.

An unapproved account sees an access message and no schedule data. If Google is already signed into the wrong account, sign out of the application and use a separate browser profile or private window.

Approved users receive a rolling ten-year browser session. They normally remain signed in on the same browser unless they sign out, clear browser data, a manager deactivates their access, or a clean UAT reset removes active sessions.

## Manager navigation

Managers have these primary areas:

| Area | Use it for |
| --- | --- |
| `Dashboard` | Current schedule status, readiness, alerts, and shortcuts |
| `Employees` | Directory, profile edits, and invitations |
| `Availability` | Submission tracker and staff availability detail |
| `Builder` | Generate, assign, edit, review, and publish the schedule |
| `Requests` | Coverage and swap decisions |
| `Reports` | Initial versus final hours, CSV, and print |
| `Test Plan` | Guided run, advanced checklist, progression, backup test, and clean reset |
| `UAT Issues` | Review, resolve, reopen, and export reported issues |
| `Notifications` | Preview messages and review send status |
| `Settings` | Dates, hours/templates, email test, and schedule recovery |

The header switch changes between `Manager tools` and `My employee view`. The employee view is always the manager's own staff identity; it does not impersonate another person.

## Employee navigation

Employees have these areas:

| Area | Use it for |
| --- | --- |
| `Dashboard` | Deadlines, next shifts, prompts, and quick actions |
| `My shifts` | Personal published schedule and shift actions |
| `Availability` | Unavailable entries or a no-unavailable-days submission |
| `Team schedule` | Published schedule for the full team |
| `Coverage` | Open requests, offers, and swap activity |

Mobile layouts show quick actions for common tasks. Employees never see manager navigation or an identity selector.

## Manager: prepare a schedule period

### Review dates and store settings

1. Sign in as the manager.
2. Select `Settings`.
3. Review the schedule period, availability window/deadline, release date, store hours, and shift templates.
4. If a date or setting must change, edit it and wait for `Saved`.
5. Refresh once and verify that the intended setting remains.

Do this before employees submit availability. Changing period dates during an active collection window can make employee entries confusing.

### Review or edit an employee

1. Select `Employees`.
2. Locate the employee.
3. Select `Edit`.
4. Update only the intended fields.
5. Select `Save` and confirm the directory shows the change.

The employee's signed-in Google email is their identity. Avoid changing it unless the person will actually use the replacement address.

### Invite a new employee

1. Select `Employees`.
2. Enter the person's first name, last name, and exact Google email.
3. Select `Invite`.
4. Confirm the employee appears in the directory with an invitation state.
5. Open `Notifications` and confirm an invitation attempt is recorded.
6. Ask the employee to open the newest invitation email.

The link expires after 14 days and may only be accepted once. The employee must choose the same Google email that received the invitation.

### Accept an invitation as the employee

1. Open the invitation email in a private window or the employee's own browser profile.
2. Select the invitation link.
3. If prompted, select `Continue with Google`.
4. Choose the exact invited email.
5. Wait for the employee dashboard and accepted-invitation message.

Choosing a different Google account produces an email-mismatch result and does not activate that account.

## Employee: submit availability

Availability is a two-stage action: first add entries to the draft, then submit the draft.

### Submit a full unavailable day

1. Select `Availability`.
2. Choose a date inside the active schedule period.
3. Choose `Full day`.
4. Optionally enter a short note.
5. Select `1. Add unavailable day`.
6. Review the draft entry.
7. Select `2. Submit draft`.
8. Confirm the status says `Submitted`.

### Submit shift-specific unavailability

1. Select `Availability`.
2. Choose the date.
3. Choose `Shift-specific`.
4. Select the applicable shift template.
5. Select `1. Add unavailable day`.
6. Select `2. Submit draft`.

Only the selected template is unavailable; other non-overlapping work may still be assignable.

### Submit a custom unavailable time

1. Select `Availability`.
2. Choose the date.
3. Choose `Custom time range`.
4. Enter a start time earlier than the end time.
5. Select `1. Add unavailable day`.
6. Select `2. Submit draft`.

The builder treats a shift as conflicting when its time overlaps the submitted range.

### Submit no unavailable days

1. Select `Availability`.
2. Leave the draft empty.
3. Select `2. Submit no days`.
4. Confirm the status says `Submitted` and indicates full availability.

### Correct a submission

1. Return to `Availability` before the deadline.
2. Select `Unsubmit`.
3. Remove or change the draft entries.
4. Add the corrected entries.
5. Select `2. Submit draft`, or `2. Submit no days` when appropriate.

After the availability deadline, the employee should contact the manager rather than relying on an out-of-window edit.

## Manager: track availability

1. Select `Availability`.
2. Review the count of missing submissions.
3. Open each staff card to see unavailable dates/times or full availability.
4. Confirm the manager's own submission appears because managers can work floor shifts.
5. Follow up with any highlighted person before generating the schedule.

The dashboard and navigation badge should also show missing submissions. If the deadline is approaching, the daily reminder path sends one email per active member three Edmonton calendar days before release.

## Manager: create the draft schedule

### Generate and auto-complete

1. Select `Builder`.
2. Review the readiness panel and missing availability warnings.
3. Select `Auto complete`.
4. Wait for the calendar to populate.
5. Review every week from Sunday through Saturday.

Auto-complete uses store templates and availability rules. A generated draft still requires manager review.

### Assign or reassign a shift

1. Select a shift card in the calendar.
2. Review the date, time, current employee, and availability warnings.
3. Choose an available employee.
4. Confirm the name changes on the calendar.
5. Wait for `Saved`.

When no available employee exists, the UI may require a deliberate override with an audit explanation. Never ignore a conflict without confirming it with the affected employee.

### Add a shift

1. Choose the correct calendar date.
2. Select `Add shift`.
3. Enter valid start and end times.
4. Choose an available employee or leave it unassigned while planning.
5. Save and confirm the new card is on the intended date.

### Edit or remove a shift

1. Select the shift card.
2. Change its time or employee and save, or select the remove action.
3. Confirm only the chosen shift changed.
4. Wait for `Saved` and refresh if the change is important.

### Find unfinished work

1. Select the `Unassigned` filter.
2. Resolve every visible unassigned shift.
3. Turn the filter off.
4. Review the whole calendar for readable names, correct dates, reasonable hours, and availability conflicts.

## Manager: review and publish

1. In `Builder`, select `Publish`.
2. Read the full confirmation screen.
3. Review every warning.
4. Confirm the notification recipient list includes every active staff member.
5. Review the per-employee hours snapshot.
6. If anything is wrong, cancel, correct the draft, and reopen the review.
7. Select the final publish confirmation once.
8. Wait for the published status and delivery summary.
9. Open `Notifications` and verify one publication entry per active member.
10. Ask employees to refresh and confirm their inboxes and schedules.

Publication sends one consolidated email per active member containing that person's assigned shifts and the application link. Repeating the same provider operation should be deduplicated, but the manager should still avoid double-clicking while the first request is pending.

## Employee: review a published schedule

1. Refresh the application after the manager publishes.
2. Select `My shifts` and compare the listed shifts with the email.
3. Select `Team schedule` and inspect the Sunday-start calendar.
4. Confirm dates, times, names, and the employee's own shifts.
5. On a phone, confirm the same information is readable without clipped names.

Only a published period should be treated as the official schedule.

## Coverage workflow

### Assigned employee requests coverage

1. Open `My shifts`.
2. Select the published shift that needs coverage.
3. Choose the coverage request action.
4. Enter a reason if appropriate.
5. Submit and confirm the request is open.

### Another employee offers coverage

1. Open `Coverage` in a different employee account.
2. Locate the open request.
3. Review the shift time and any availability conflict.
4. Select the offer action.
5. Confirm the request now waits for manager review.

### Manager decides

1. Switch to the manager and select `Requests`.
2. Open the offered coverage request.
3. Verify the offering employee is available and the resulting hours are acceptable.
4. Select `Approve` or `Reject`.
5. Confirm approval changes the shift assignment; rejection leaves it unchanged.
6. Verify the related notification entries.

## Swap workflow

### Employee proposes a swap

1. Open `My shifts` or `Coverage`.
2. Select one of the employee's published shifts.
3. Choose the swap action.
4. Select another employee and one of that employee's eligible shifts.
5. Enter a reason and submit.

### Target employee answers

1. Open the target employee's `Coverage` area.
2. Review both shifts and any conflicts.
3. Accept or decline.
4. Confirm an acceptance moves the request to manager review; a decline ends it without changing assignments.

### Manager decides

1. Select `Requests`.
2. Open the accepted swap.
3. Verify both employees, shifts, availability, and hours.
4. Approve or reject.
5. Confirm approval exchanges the assignments and rejection preserves them.

## Reports and printing

1. As manager, select `Reports`.
2. Compare initial published hours with final worked hours.
3. Review changes caused by approved coverage and swaps.
4. Select the CSV export and open the downloaded file.
5. Use the print action and inspect print preview before saving or printing.

Initial hours preserve the publication baseline. Final hours reflect approved changes.

## Notifications and issue reporting

### Review notification delivery

1. As manager, select `Notifications`.
2. Filter or scan by action and recipient.
3. Interpret status:
   - `sent`: Resend accepted the message;
   - `queued`: no live provider was configured for that execution;
   - `failed`: the provider call failed and needs investigation.
4. Check the actual inbox for live-email tests; a `sent` provider status does not guarantee inbox placement.

### Report and manage a UAT issue

1. Select `Report issue` from the test banner or mobile employee dashboard.
2. Describe what you did, what happened, and what you expected.
3. Submit the issue.
4. As manager, open `UAT Issues`.
5. Resolve the issue after a verified fix, or reopen it if the behavior returns.
6. Export CSV or JSON when sharing results.

## Back up and restore the schedule

### Make an intentional recovery point

1. As manager, select `Settings`.
2. Find `Schedule Backup`.
3. Select `Back up now`.
4. Confirm the time, source version, byte size, and integrity identifier update.

Ordinary saves and the daily cron protect the same single row automatically. `Back up now` is useful immediately after an important midweek change.

### Restore the latest backup

1. Tell active users to stop editing and close old schedule tabs.
2. In `Settings` → `Schedule Backup`, review the backup time and reason.
3. Type `RESTORE LATEST BACKUP` exactly.
4. Confirm the restore.
5. Refresh all browsers.
6. Inspect the period, shifts, availability, and requests against the expected recovery point.
7. Make a new manual backup after the recovered schedule is confirmed.

Restore verifies checksum and size before changing the workspace. It also creates a new run ID, so an old tab receives a conflict instead of silently overwriting recovered data.

## Sign out safely

1. Wait for `Saved`.
2. Select `Sign out`.
3. If the device is shared, also sign out of the Google browser profile or close the private window.
4. Use Back and refresh once to confirm protected schedule data is not displayed.
