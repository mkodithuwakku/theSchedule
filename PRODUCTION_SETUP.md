# Production-Like UAT Setup

This is the checklist for hosting The Schedule on a real HTTPS URL so invite links work from phones and other devices.

## What Is Now Wired

- Prisma/Postgres schema for users, stores, memberships, schedule periods, availability, shifts, invites, notifications, and audit logs.
- Google/Auth.js login with active user and store-membership checks.
- Pending invite emails are allowed through Google login so employees can accept a new invitation.
- Real invite records through `StoreInvitation`.
- Real invite acceptance route: `/api/invites/accept?token=...`.
- Resend email delivery support for invites, notifications, and owner alerts.
- The hosted schedule workspace is persisted in Neon through `StoreWorkspaceState`, rather than Vercel's temporary filesystem.
- `StoreWorkspaceBackup` keeps exactly one integrity-checked snapshot per store. The daily cron and manual backup control overwrite that row instead of accumulating files.
- The signed-in Google email is bound to one employee identity. Employees cannot switch identities or open manager tools.
- Manager-only checks protect employee invites, schedule resets, reports, manager state changes, and unrestricted notification sends at the API layer.
- Production environment templates in `.env.production.example`.

## Access Levels

| Signed-in status | Access |
| --- | --- |
| No Google session | Sign-in screen only |
| Google account without an active membership | Access denied; the exact email must be invited |
| Active employee membership | Own availability, shifts, coverage, swaps, and team schedule |
| Active manager membership | All manager tools plus the manager's own employee view |

Changing a person's access is a database operation on `StoreMembership.role` and `StoreMembership.active`. The client-side interface is not trusted as the source of permission.

## What You Need To Configure

1. Host the app on a public HTTPS URL.
   A hosted URL is required for phone testing. `localhost` and `127.0.0.1` only work on the computer running the dev server.

2. Add a hosted Postgres database.
   Set `DATABASE_URL` in the hosting provider.

3. Create the database schema.
   For the first UAT database, with no existing production data:

   ```bash
   npm run prisma:push
   npm run prisma:seed
   ```

   Later, once production data matters, use migrations with `npm run prisma:migrate` locally and `npm run prisma:deploy` in hosting.

   After pulling the Gmail authorization update, run `npm run prisma:push` once against Neon to add `StoreWorkspaceState` before deploying the new app code.

4. Configure Google OAuth.
   You need Google OAuth credentials, not the Gmail API, for sign-in:

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL`
   - `NEXT_PUBLIC_APP_URL`

   In Google Cloud, add:

   - Authorized JavaScript origin: `https://your-domain`
   - Authorized redirect URI: `https://your-domain/api/auth/callback/google`

   In the OAuth consent screen, add every employee as a test user while the Google app remains in Testing. If the app is published for external use, invited Google accounts can sign in without being manually listed as OAuth test users.

5. Configure email sending.
   The app uses Resend for application emails:

   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `OWNER_ALERT_EMAIL`
   - `CRON_SECRET` (a long random value used by Vercel to authorize the daily rollout job)

   The sending domain must be verified in Resend before real delivery is reliable.

   The existing Neon database was originally created with `prisma db push`, so baseline it once before applying the notification-delivery migration:

   ```bash
   npx prisma migrate resolve --applied 0_init
   npm run prisma:deploy
   ```

   Run both commands with the production `DATABASE_URL`. `0_init` records the tables already present without recreating them; `prisma:deploy` then applies pending notification and workspace-backup migrations.

   Vercel runs `/api/cron/schedule-rollout` daily at 16:00 UTC. The route overwrites the one `StoreWorkspaceBackup` row for each store while also calculating the date in `America/Edmonton`, sending availability requests exactly three calendar days before release, and using database deduplication records to skip retries that have already been processed.

6. Seed the store and manager.
   `SEED_MANAGER_EMAIL` should stay as `m.kodithuwakku803@gmail.com` unless the manager account changes.

   Verify the seeded manager email in Neon before inviting employees. A placeholder such as `manager@example.com` must not remain the only manager membership.

7. Send production invites from the hosted app.
   The manager adds an employee email in the Employees tab. The app creates a database invite and emails a link to `/api/invites/accept?token=...`.

8. Redeploy on Vercel after the schema update.
   Keep `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` equal to the canonical HTTPS domain, then confirm the Google redirect URI uses that same domain exactly.

## Production Verification

Use the manager `Test Plan` tab as the source of truth. It contains 111 manually tracked production flows, including signed-out/unauthorized paths, first and repeat Google login, invite token edge cases, every availability type, builder warnings, publish retries, coverage and swap approval/rejection paths, exports, concurrency, daily/manual backup, restore, provider failures, and reset verification. Results persist through Neon and can be exported to CSV or JSON.

### Daily schedule backup and recovery

- The Vercel cron ensures every store has a workspace, then overwrites one snapshot per store every day; storage does not grow by one file or row per run.
- Every successful schedule save overwrites the same protected row, covering midweek edits immediately. The daily cron supplies the idle-day refresh. Same-day manual and `pre_reset` snapshots are preserved until a manager explicitly backs up again or the next Edmonton day begins.
- Open `Settings` → `Schedule Backup` to verify the latest time, source version, size, and integrity identifier.
- Select `Back up now` after an important mid-day schedule change when you do not want to wait for the daily run.
- To recover, type `RESTORE LATEST BACKUP` exactly and confirm. The server verifies the saved checksum before replacing the workspace.
- Restoring changes the workspace run identifier, preventing an old open tab from writing pre-restore data over the recovered schedule.
- The destructive clean-run workflow automatically overwrites the protected copy immediately before it clears UAT state.

Start with the critical tests and use separate private browser profiles for manager and employee identities. Mark any dependency that cannot safely be simulated in production as Blocked and log a UAT issue for every Failed result.

### Starting a clean end-to-end run

Only an active manager can perform the full reset:

1. Open `Test Plan` → `Clean production UAT run`.
2. Read the destructive-scope warning.
3. Type `RESET CLEAN RUN` exactly.
4. Confirm the browser warning.
5. The reset clears workspace/checklist state, invitations, normalized schedules, notification deduplication and logs, audit logs, Auth.js Google account links, and active sessions.
6. The store configuration plus the four seeded users and memberships are restored. A new date-relative period opens availability immediately, closes it after five Edmonton calendar days, releases after seven days, and starts the schedule the following day.
7. Every browser is signed out. Sign in again to test first-login Google linking.

The reset is protected by server-side manager authorization and an exact confirmation phrase. Each run has a unique identifier, so an old tab from a previous run receives a conflict instead of restoring stale data.

## What To Ask Your Manager For

For the domain and payment, ask for:

- Approval for the exact domain or subdomain to use, for example `schedule.menarefrommars.com` or `theschedule.menarefrommars.com`.
- Who should own the domain account: the business/manager should own it, not your personal account.
- A payment method for the domain registrar and hosting provider.
- Access to DNS settings, or for your manager to add you as a technical user on the registrar/DNS account.
- Permission to create DNS records for hosting, Google OAuth domain verification, and Resend email verification.
- A sending email address, for example `schedule@menarefrommars.com`.
- A business/support email to display in Google OAuth consent and app support fields.
- Agreement that this is a UAT system before real employee data is relied on.

If your manager already owns the store domain, the cleanest setup is a subdomain. That avoids buying a new domain and keeps ownership with the business.

## Phone Testing Rule

Invite links will work on your phone only when they point to a public HTTPS URL. A local development link like `http://127.0.0.1:3000` will not work on your phone because it points back to the phone itself.
