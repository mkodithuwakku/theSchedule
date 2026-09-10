# API reference

All application routes are same-origin Next.js App Router handlers. Except for Auth.js callbacks, invite-link redirects, and the cron, callers should send and receive JSON. Protected routes resolve the Auth.js database session and active store membership on the server.

## Common behavior

| Status | Meaning |
| --- | --- |
| `200` | Action succeeded |
| `400` | Missing or invalid input |
| `401` | No valid application session, or invalid cron authorization |
| `403` | Signed in but the membership role cannot perform the action |
| `404` | Requested recovery object does not exist |
| `409` | State changed, stale UAT run, integrity failure, or invalid workflow transition |

The browser interface is the supported client. This reference is for maintenance, verification, and future integration; it is not a public third-party API contract.

## Route summary

| Method and path | Access | Purpose and side effects |
| --- | --- | --- |
| `GET/POST /api/auth/[...nextauth]` | Public/Auth.js | Google OAuth, callbacks, session, and sign-out handling |
| `GET /api/test-state` | Active member | Read the role-appropriate shared workspace |
| `PUT /api/test-state` | Active member | Save manager state or a server-filtered employee change |
| `DELETE /api/test-state` | Manager | Reset only the workspace to default state after making a protected backup |
| `POST /api/invites` | Manager | Create a 14-day employee invitation, send email, and log it |
| `PATCH /api/invites` | Manager | Correct the name or email on a pending invitation |
| `PUT /api/invites` | Manager | Replace a pending token, renew its 14-day expiry, resend, and log delivery |
| `GET /api/invites/accept?token=…` | Invited Google identity | Redirect through sign-in if needed, then activate matching membership |
| `POST /api/schedule/publish` | Manager | Publish active shifts, audit, email members, and return final workspace |
| `POST /api/notifications/test-email` | Active member with restrictions | Send/log workflow email; arbitrary recipient and most types are manager-only |
| `GET /api/reports/hours` | Manager | Download hours CSV |
| `GET /api/backups/workspace` | Manager | Read backup metadata, not raw backup data |
| `POST /api/backups/workspace` | Manager | Overwrite the protected backup with the current workspace |
| `PUT /api/backups/workspace` | Manager | Verify and restore the protected backup |
| `POST /api/uat/day-progression` | Manager | Start a new cycle, advance date, jump to reminder, or stop simulation |
| `POST /api/uat/reset` | Manager | Destructively restore a first-login UAT baseline |
| `GET /api/cron/schedule-rollout` | Bearer secret | Open due schedule windows, ensure backups, and process reminders |

## Workspace state

### `GET /api/test-state`

Returns the normalized workspace, database `workspaceVersion`, and headers `X-Test-State-Persisted: true` and `Cache-Control: private, no-store`. Employee GET and PUT responses include only own availability/drafts/preferences, published team shifts without internal notes, relevant coverage/swaps, and own notifications. Coworker emails, draft shifts, audit logs, UAT issues/results, and invite acceptances are excluded.

### `PUT /api/test-state`

The request body is the proposed workspace. Its `uatRunId` and integer `workspaceVersion` must match the current database workspace. A missing or stale version or changed run returns `409`. The comparison and version increment are atomic; a successful response includes the new revision.

For a manager, the normalized proposal is persisted. For an employee, the server reconstructs a safe workspace containing only permitted changes to that employee's availability, theme preference, coverage/swap participation, issues, and related log entries.

### `DELETE /api/test-state`

Manager-only development/workspace reset; returns 403 in Production. It first writes a `pre_reset` protected backup and then replaces the workspace with an empty workspace containing the default managers and new run ID. The full first-login reset is `/api/uat/reset` and clears much more data.

## Invitations

### `POST /api/invites`

Example request shape:

```json
{
  "email": "employee@example.com",
  "name": "Employee Name",
  "storeId": "store_wem"
}
```

The route normalizes the email, verifies manager access to the store, upserts an active employee user, creates a random invitation token expiring in 14 days, sends the invitation, and creates a `NotificationLog` row. The emailed action opens the normal application sign-in page with a same-origin acceptance callback, which is more reliable from mobile email clients; after Google sign-in, the callback continues to the acceptance route. The response contains invitation metadata and provider status. Do not expose the returned `inviteUrl` in logs or public documentation because it is an access token.

### `PATCH /api/invites`

Managers can update a pending invitation by sending `currentEmail`, corrected `email`, `name`, and `storeId`. Accepted invitations cannot be edited through this route. The route rejects an email already invited or active in the same store, updates the pending invitation and safe pre-acceptance user record together, and writes an audit row. It does not send an email; use the resend action after correcting an address.

### `PUT /api/invites`

Managers can resend a pending invitation by sending its `email`, employee `name`, and `storeId`. The route replaces the token so older links stop working, renews the expiry for 14 days, sends the standard invitation email, and records both notification delivery and an audit row. Accepted invitations cannot be resent.

### `GET /api/invites/accept`

The `token` query parameter is required. A signed-out visitor is redirected to Google and back to the same acceptance URL. The signed-in normalized email must match the invitation email. Success activates the user and membership, marks the invitation accepted, writes an audit log, and redirects to `/?invite=accepted`.

Result redirects include `invite=missing`, `invite=invalid`, and `invite=email-mismatch`.

## Publication

### `POST /api/schedule/publish`

Request shape:

```json
{
  "period": { "id": "active-period", "status": "draft" },
  "shifts": []
}
```

The real payload contains the full current period and at least one full shift. The route rejects a period that differs from the current workspace, shifts belonging to another period, unfilled shifts, duplicate same-day assignments for one employee, assignments that conflict with submitted availability, and invalid time ranges. Manual-cover names count as filled shifts. On success it:

1. marks the period published;
2. preserves original employee and time values for reporting;
3. saves a workspace and relational audit entry;
4. sends one consolidated email plan per active member using deduplication claims;
5. adds final delivery statuses to workspace notifications;
6. returns the final state and per-user delivery result.

## Notifications

### `POST /api/notifications/test-email`

Managers may select recipients and notification types. Employees may only produce allowed notification types resulting from their own application actions, and cannot choose an arbitrary recipient. Owner alerts from employees are limited to UAT issue and software outage types.

The response includes the workspace notification, resolved recipient, and provider result. Provider status is `sent`, `queued`, or `failed`.

Shift assignment, unassignment, removal, and update emails require the persisted current period to be published. An optional `schedulePeriodId` must match that period for these emails. Otherwise the route returns HTTP 200 with `suppressed: true` and a notification with status `suppressed`, without calling the email provider or saving a notification. Older clients without a period ID are checked against the current persisted period. Other notification workflows retain their existing behavior. Draft edits do not create client notifications; publication uses the consolidated publication endpoint.

## Backups

### `GET /api/backups/workspace`

Returns metadata such as existence, backup time, source version/run, reason, checksum, byte size, last restore time, and restore count. It does not return the saved schedule document.

### `POST /api/backups/workspace`

Overwrites the store's single backup row with reason `manual`.

### `PUT /api/backups/workspace`

Request:

```json
{
  "confirmation": "RESTORE LATEST BACKUP"
}
```

The route verifies the exact phrase, checksum, and byte size. Missing backup returns `404`; failed integrity returns `409`. Success replaces the workspace, creates a new `uatRunId`, and updates restore metadata.

## Day progression

### `POST /api/uat/day-progression`

Request body contains one action:

```json
{ "action": "start_next_cycle" }
```

Supported values:

| Action | Result |
| --- | --- |
| `start_next_cycle` | Make manual backup, archive published schedule, open the next semi-monthly draft, enable simulated date |
| `advance_day` | Advance one Edmonton calendar day and process any reminder due that day |
| `jump_to_reminder` | Jump to release minus three days and process the reminder path |
| `stop_simulation` | Return rules to the real Edmonton date while keeping period/history |

The response includes updated state, a user-facing message, and delivery counts when applicable. Invalid transitions return `409`.

Publishing and day-progression POST requests must also include the `uatRunId` and `workspaceVersion` returned by the latest workspace response. Stale requests return 409 before making schedule changes or sending publication emails.

## Full UAT reset

### `POST /api/uat/reset`

Request:

```json
{
  "confirmation": "RESET CLEAN RUN"
}
```

This manager-only action backs up the workspace, clears scheduling/UAT/invitation/notification/audit artifacts, and removes affected Auth.js account links and sessions. Both `m.kodithuwakku803@gmail.com` and `a.t.morris03@gmail.com` retain active manager memberships. Every employee membership is removed; orphaned users are deleted while users with another store membership are preserved. The empty workspace contains no shifts or history and suggests future semi-monthly dates based on the reset date in Edmonton. No normalized schedule period is created. Other employees need a new invitation. A new run ID and incremented version invalidate stale writes.

## Scheduled rollout

### `GET /api/cron/schedule-rollout`

Required header:

```text
Authorization: Bearer <CRON_SECRET>
```

The route first opens any due next schedule draft using the real store date, after protecting the current workspace with a backup. It retains published shifts and requests and skips simulated clocks or unfinished drafts. It then runs backup and reminder processing together. The `windows` result lists each store, whether a window opened, and its active period ID. Reminders are due from release minus three days through the availability deadline, with delivery-claim deduplication. Its response reports stores processed, snapshots written, attempted/sent/queued/failed deliveries, and duplicates skipped. A direct browser visit without the header must return `401` and perform no work.
