# Production operations

This runbook is for deploying and operating The Schedule on Vercel with Neon Postgres, Google OAuth, and Resend. It intentionally lists environment variable names but never their values.

## Production service map

| Service | Responsibility | Failure symptom |
| --- | --- | --- |
| Vercel | Build, Next.js runtime, HTTPS domain, and daily cron | Deployment error, `5xx`, missing scheduled invocation |
| Neon | Auth sessions, memberships, workspace, backup, notification claims/logs, audit data | Login/database errors, save failures, missing shared state |
| Google OAuth | Verified identity and consent | `redirect_uri_mismatch`, `invalid_client`, access denied |
| Resend | Transactional application email | queued/failed status, missing provider ID, no inbox delivery |

Canonical UAT URL: [mafm-schedule.vercel.app](https://mafm-schedule.vercel.app).

## Environment variables

Configure secrets in the hosting environment, never in Git. Use `.env.example` and `.env.production.example` only as name templates.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Neon Postgres connection used by Prisma |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client identifier |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `NEXTAUTH_SECRET` | Yes | Auth.js session/token protection secret |
| `NEXTAUTH_URL` | Yes | Canonical HTTPS application URL |
| `NEXT_PUBLIC_APP_URL` | Yes | Public base URL used in invitation and application links |
| `RESEND_API_KEY` | For real email | Resend API authentication; absent means queued development semantics |
| `EMAIL_FROM` | For real email | Verified sender, for example `The Schedule <schedule@business-domain>` |
| `OWNER_ALERT_EMAIL` | Recommended | Destination for UAT/software/delivery alerts |
| `CRON_SECRET` | Yes | Long random bearer secret for the daily route |
| `SEED_MANAGER_EMAIL` | During seed | Manager identity; defaults to the current seeded manager when omitted |

`NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` should be identical to the canonical HTTPS origin. Do not add a trailing path. A change requires updating Google OAuth settings and redeploying.

## Initial service configuration

### Neon

1. Create or select the production Neon project and branch.
2. Store the pooled production connection string as `DATABASE_URL` in Vercel Production. Neon recommends its PgBouncer `-pooler` endpoint for serverless web requests.
3. Keep database ownership with the business or an approved shared organization account.
4. Apply the schema before deploying application code that reads a new table or column.
5. Verify the seeded manager has an active manager membership.

Use a direct Neon connection for schema migrations and administrative tools, as recommended in [Neon's connection-pooling guide](https://neon.com/docs/connect/connection-pooling). Because the current Prisma schema reads `DATABASE_URL`, load the direct URL into that variable only for the migration process through an approved secret-management method; keep the pooled URL in the Vercel application environment.

### Google OAuth

Configure a Web application client with:

- authorized origin `https://mafm-schedule.vercel.app` or the final custom canonical domain;
- authorized redirect URI `https://mafm-schedule.vercel.app/api/auth/callback/google` or the exact custom-domain equivalent.

While the consent app is in Google Testing status, add every intended Google account as a test user. The application itself still requires an active membership or valid pending invitation.

### Resend

1. Verify the business sending domain.
2. Create a production API key with only the needed sending access.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Set the owner alert recipient.
5. Redeploy after environment changes.
6. Use `Settings` → email test, then confirm both provider status and actual inbox arrival.

### Vercel

The project must be linked to the correct Git repository and production branch `main`. `vercel.json` schedules:

```json
{
  "path": "/api/cron/schedule-rollout",
  "schedule": "0 16 * * *"
}
```

[Vercel Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) sends the production authorization header using `CRON_SECRET`. A browser request without that bearer token must return `401`.

## Database migrations

### Routine migration workflow

1. Change `prisma/schema.prisma` locally.
2. Create a migration against a safe development database:

   ```bash
   npm run prisma:migrate
   ```

3. Inspect the generated SQL in `prisma/migrations/`.
4. Run tests, typecheck, lint, and build.
5. Back up production and verify the target database/branch.
6. Load a direct Neon connection for the migration process, then apply committed migrations to production:

   ```bash
   npm run prisma:deploy
   ```

7. Verify migration status before deploying application code.

Do not use `prisma db push` as the normal production upgrade path once real data matters. It is acceptable only for a deliberately disposable first UAT database.

### Existing database baseline

The original Neon schema was created with `prisma db push`. If a matching database has never recorded the baseline migration, run this once with the correct production `DATABASE_URL`:

```bash
npx prisma migrate resolve --applied 0_init
npm run prisma:deploy
```

Do not resolve `0_init` on an empty database: an empty database needs the migration to actually create its tables. Check the database and `_prisma_migrations` first.

Current committed migrations are:

- `0_init` — baseline normalized application schema;
- `20260817140000_add_notification_delivery_tracking` — delivery deduplication/provider fields;
- `20260817190000_add_workspace_backup` — single protected workspace snapshot.

### Migration verification

Use Prisma migration status with the production connection loaded through an approved secret-management method. Then verify that these critical relations exist:

- `StoreWorkspaceState`;
- `StoreWorkspaceBackup`;
- `NotificationLog` fields for deduplication and provider outcome;
- Auth.js `Account` and `Session` tables;
- active `User`, `Store`, and `StoreMembership` rows.

Never paste the connection URL into a terminal command that will be saved in shell history or documentation.

## Release procedure

### Before commit

1. Review `git status` and preserve unrelated work.
2. Run:

   ```bash
   npm test
   npm run lint
   npm run typecheck
   npm run build
   ```

3. If schema changed, inspect and apply the migration in the correct order.
4. Update documentation and UAT steps affected by the change.
5. Review the diff for secrets, access tokens, invitation URLs, or production data.

### Commit and push

1. Commit the complete, verified change to the intended branch.
2. Push `main` to the configured origin.
3. Record the full commit SHA for deployment comparison.
4. Do not assume a successful Git push means production is ready.

### Vercel verification

1. Confirm Vercel created a production deployment for the exact pushed commit. With Git integration, a push to the configured production branch creates the production deployment.
2. Wait for status `Ready`.
3. Open the deployment build log and scan for Prisma, TypeScript, route, or environment warnings.
4. Open the canonical URL in a signed-out private window.
5. Confirm HTTPS loads and no schedule data is visible.
6. Start Google sign-in and verify the expected app/domain; cancel if this is only a smoke check.
7. Confirm a direct visit to `/api/cron/schedule-rollout` returns `401`.
8. Review recent runtime logs for new `5xx` errors.
9. Run the release-critical items in `Test Plan`.

Documentation-only changes still trigger a deployment when pushed, but they do not change runtime behavior. A full four-account UAT rerun can be scoped according to the risk of the code change.

## Daily operation

### Manager start-of-day check

1. Open the application and confirm the correct period/status.
2. Wait for `Saved` and refresh once.
3. Review dashboard alerts, missing availability, and pending requests.
4. Open `Notifications` for failed delivery entries.
5. Open `Settings` → `Schedule Backup` and confirm a recent backup exists.

### After an important schedule change

1. Wait for `Saved`.
2. Refresh and verify the shift/request result.
3. Select `Settings` → `Back up now` for an intentional recovery point.
4. Confirm affected employees see the update.

### End-of-day check

1. Resolve or document pending coverage/swap decisions.
2. Confirm no failed application notification lacks follow-up.
3. Confirm the protected backup metadata is current enough for the day's changes.
4. Sign out on shared devices.

## Backup policy

### What is protected

The protected snapshot contains the current normalized scheduling workspace: active period, people, availability, shifts, coverage, swaps, notifications, audit entries, UAT results/issues, simulated date, and recent schedule history.

Auth.js sessions/accounts, normalized relational records outside the workspace, environment variables, and external inbox contents are not all restored by the workspace backup. Neon platform backup/recovery remains the broader database-level safety net.

### Retention and storage growth

`StoreWorkspaceBackup.storeId` is the primary key. There is exactly one row per store. Daily, manual, autosave, pre-reset, and cycle-start protection overwrite this same row; they do not create one row or file per day.

This meets the requirement to keep a fresh daily schedule recovery point without unbounded storage growth. It does not provide multiple historical restore points.

### Overwrite rules

- On an ordinary successful workspace save, the backup is refreshed immediately.
- A same-day `manual` or `pre_reset` snapshot is preserved from automatic save overwrites for the rest of the Edmonton calendar day.
- Selecting `Back up now` explicitly replaces the current snapshot.
- The cron ensures an idle store receives a daily snapshot.
- Starting the next schedule cycle creates a manual snapshot before archiving/opening the next period.
- Clean reset creates a `pre_reset` snapshot before deletion.

### Daily verification

In `Settings` → `Schedule Backup`, verify:

- backup exists;
- backup time is recent;
- reason is understandable (`daily`, `manual`, or `pre_reset`);
- source version and run ID are present;
- byte size is non-zero;
- integrity identifier is present;
- unexpected restore count changes have an explanation.

The cron result also reports stores processed and snapshots written. Investigate a day with neither a current snapshot nor a successful cron event.

## Restore procedure

Treat restore as a controlled incident action.

1. Announce that editing is paused.
2. Collect the current incident time, affected period, and last known good action.
3. Open `Settings` → `Schedule Backup` and inspect metadata.
4. Decide whether that single snapshot is actually older than the bad change and therefore useful.
5. Export or screenshot the broken state if it is needed for diagnosis.
6. Type `RESTORE LATEST BACKUP` exactly and confirm.
7. The server verifies checksum and byte size before writing.
8. Refresh every browser; close tabs that were open before restore.
9. Verify period, shifts, assignments, availability, requests, notifications, and history.
10. Confirm an old tab receives a stale-run conflict if it tries to save.
11. Create a new manual backup after the recovered state is approved.
12. Resume editing and record the restore in incident notes.

If the route reports no backup (`404`) or failed integrity (`409`), stop. Do not try to bypass verification. Escalate to Neon database recovery or a controlled data repair.

For broader database loss, Neon's [instant restore](https://neon.com/docs/introduction/branch-restore) can restore a root branch to a point inside the plan's history window. This is a full data-and-schema overwrite for every database on that branch, not a merge. Use Time Travel Assist to verify the target, pause application writes, and obtain business approval before performing it; Neon creates a backup branch of the pre-restore state.

## Clean UAT reset versus restore

| Action | Use when | Result |
| --- | --- | --- |
| Restore latest backup | Current workspace was accidentally damaged | Replaces workspace with the one protected snapshot; keeps identity database/session structures except run invalidation behavior |
| Clean production UAT run | A new first-login test must begin from zero | Clears UAT and schedule artifacts, invitations, notification/audit data, OAuth links and sessions; restores four seeded identities/memberships |
| Start next schedule cycle | The current schedule was published and testing should continue normally | Archives current publication, opens consecutive draft, enables simulated date |

Never use clean reset to recover an accidental midweek edit. Never use next-cycle progression merely to erase an unfinished draft.

## Email operations

### Meaning of statuses

| Status | Meaning | Operator action |
| --- | --- | --- |
| `sent` | Resend accepted the send | Check inbox/spam when delivery matters |
| `queued` | No live Resend client was configured | Configure production email before calling the test passed |
| `failed` | Provider call failed | Review failure reason, owner alert, configuration, and Resend logs |

Publication and reminder operations use deterministic claims. Repeating the same logical delivery should report a duplicate and not send another email. A new schedule period receives a new key and must send normally.

### Missing email triage

1. Confirm the action exists in `Notifications`.
2. Check its recipient, subject, type, and status.
3. If `queued`, verify `RESEND_API_KEY` is configured in Vercel Production and redeploy.
4. If `failed`, inspect the stored failure reason and Vercel runtime logs.
5. Confirm `EMAIL_FROM` uses a verified Resend domain.
6. Confirm the recipient email matches the active membership/workspace identity.
7. Check Resend logs, suppression/bounce status, spam, and mailbox rules.
8. For reminders, verify the Edmonton date is exactly release minus three days and inspect duplicate counts.
9. For publication, verify the period is published and the recipient is active.
10. Do not delete notification claims merely to resend; diagnose and use a controlled new test period or repair process.

## Authentication operations

### `OAuthAccountNotLinked` on first login

1. Confirm the deployed code includes verified-email account linking in `src/lib/auth.ts`.
2. Confirm the Google email exactly matches a seeded/invited `User` after lowercase normalization.
3. Confirm the user and membership are active.
4. Confirm the login is using Google and Google marks the email verified.
5. Check Auth.js/Vercel logs and the `Account` table for an unexpected conflicting provider identity.
6. Do not create duplicate users as a shortcut.

### `AccessDenied`

1. Confirm a valid pending invitation or active membership exists.
2. Confirm the invitation is unaccepted and unexpired.
3. Confirm the user is active.
4. Confirm the browser chose the intended Google account.

### Redirect mismatch or loop

1. Compare `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`, the browser origin, and Google authorized origin character-for-character.
2. Verify the callback ends with `/api/auth/callback/google`.
3. Check preview versus production environment scoping.
4. Redeploy after changing Vercel environment variables.
5. Retest in a clean private window.

## Save and state incidents

### Save stays pending or reports an error

1. Stop editing in other tabs.
2. Copy the visible error and time.
3. Check the browser network request to `/api/test-state`.
4. For `401`, sign in again.
5. For `403`, confirm the account's role and identity.
6. For `409`, refresh because the period/run changed or the tab is stale.
7. For `5xx`, inspect Vercel runtime and Neon availability.
8. Compare the latest backup time before attempting repair.

### Two browsers show different data

1. Wait for both save indicators.
2. Stop changes in both browsers.
3. Refresh both from Neon.
4. Determine which state persisted.
5. If a critical correct state was lost, evaluate the single protected backup.
6. Record a UAT issue with both accounts, timestamps, and actions.

Whole-workspace persistence is the known concurrency limitation. Normalize operations into transactional rows before relying on uncontrolled simultaneous editing at larger scale.

## Cron incidents

If the daily job does not appear to run:

1. Confirm the latest production deployment contains `vercel.json`.
2. Confirm the Vercel project recognizes the cron configuration.
3. Confirm `CRON_SECRET` exists in Production.
4. Review the cron invocation and function logs around `16:00 UTC`.
5. Confirm the route returns `401` without authorization.
6. Inspect the latest backup time and reminder due date.
7. Use the in-app `Back up now` to protect the schedule while cron is being repaired.
8. Use the manager day-progression test only when deliberately testing email behavior; it is not a replacement for fixing production cron.

## Rollback

Application rollback and database rollback are separate decisions.

### Application-only rollback

Use [Vercel rollback](https://vercel.com/docs/cli/rollback) or the dashboard to restore the last known-good production deployment when the database schema remains backward compatible. Then verify the canonical domain, authentication, workspace read/write, and email/cron routes.

### Database-related rollback

Do not automatically reverse a production migration. First determine whether the old application can run against the new schema. Prefer a forward repair migration. For destructive or incompatible changes, use the reviewed migration plan and Neon recovery capability; preserve incident evidence and stop writes first.

### Post-rollback validation

1. Confirm the domain points to the intended deployment and commit.
2. Open signed-out and manager sessions.
3. Read and write a harmless workspace value.
4. Inspect the current schedule and protected backup.
5. Check recent runtime errors.
6. Re-run affected critical UAT steps.

## Incident priorities

| Priority | Example | Immediate response |
| --- | --- | --- |
| Critical | Schedule inaccessible, widespread login failure, current schedule lost/corrupted | Stop edits, preserve evidence, inspect deployment/Neon, evaluate restore/rollback |
| High | Publish/reminder email fails for multiple staff, unauthorized access behavior | Stop affected workflow, inspect logs/claims/access, notify manager |
| Medium | One request/report/export is wrong but schedule remains safe | Log UAT issue, capture repro, use manual workaround if approved |
| Low | Cosmetic/layout/text defect | Log evidence and continue unrelated testing |

For every incident, record the production URL, commit/deployment, Edmonton time, account, action, expected result, actual result, screenshots, relevant request/status, and recovery action.

## Production readiness checklist

- [ ] Intended `main` commit pushed and deployed.
- [ ] Vercel deployment is `Ready` for the exact commit.
- [ ] Production environment variables exist in the correct scope.
- [ ] Prisma migrations are applied to the intended Neon database.
- [ ] Signed-out page reveals no schedule data.
- [ ] Manager first/repeat Google sign-in passes.
- [ ] Employee first/repeat Google sign-in passes.
- [ ] Unapproved Google account is denied.
- [ ] Neon workspace change survives refresh.
- [ ] Test email arrives and is logged as sent.
- [ ] Publication sends one consolidated email per active member.
- [ ] Reminder day sends once and retry is deduplicated.
- [ ] Direct unauthenticated cron request returns `401`.
- [ ] Current backup metadata is valid.
- [ ] Restore drill and stale-tab guard pass.
- [ ] Guided normal schedule journey passes.
- [ ] No unresolved critical UAT issue remains.
