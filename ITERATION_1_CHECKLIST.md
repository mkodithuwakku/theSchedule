# Iteration 1 Checklist: Manager Credential Meeting to Soft Launch

Target: use the one manager credential meeting to connect the real domain, Google sign-in, production database, and email delivery path. After the meeting, the app should only need a short UAT pass before a soft launch with a small employee group.

Confirmed email/auth model: the app will use Google OAuth for identity and Resend for application email delivery. Employees and managers sign in with Google, while invite and schedule notifications are sent from a branded sender such as `The Schedule <schedule@menarefrommars.com>`. "Gmail notifications" means employees receive app emails in their Gmail inboxes; the app will not send mail through the Gmail API or a manager-owned Gmail mailbox in Iteration 1.

## 1. Meeting Outcome

- [ ] Final domain or subdomain is chosen.
  - Example: `schedule.menarefrommars.com`
- [ ] Domain/DNS access is available while the manager is present.
- [ ] Hosting account and billing are ready.
- [ ] Hosted Postgres database is created and connected.
- [ ] Google OAuth credentials are created for the production URL.
- [ ] Email sending domain is verified or all DNS records are submitted for verification.
- [ ] `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` point to the final HTTPS URL.
- [ ] Manager account can sign in with Google on the hosted app.
- [ ] Test invite email can be sent to a non-manager employee Gmail address.
- [ ] Invite link opens on a phone and routes through Google sign-in.

## 2. Must Add Before The Meeting

- [ ] Add a deployment notes section for the chosen host.
  - Include where env vars live, where build logs live, where database settings live, and who owns the account.
- [ ] Add a private setup worksheet outside git for secrets and records.
  - Domain registrar/DNS provider:
  - Hosting provider:
  - Database provider:
  - Google Cloud project:
  - Email sender provider:
  - Production URL:
  - Sender email:
  - Owner alert email:
- [ ] Generate a production `NEXTAUTH_SECRET`.
- [ ] Prepare Resend as the confirmed email sender.
  - Sender: `The Schedule <schedule@menarefrommars.com>` or the final approved business sender.
  - Reply-to/support inbox: confirm where employee replies should go.
  - DNS: prepare the exact Resend domain verification records.
- [ ] Keep Gmail API/bot sending out of Iteration 1 scope.
  - Google credentials are only for OAuth sign-in.
  - Do not request Gmail send scopes.
  - Do not store mailbox send tokens.
- [ ] Confirm `.env.production.example` has every required variable.
- [ ] Add a clear production seed/reset note.
  - Confirm `SEED_MANAGER_EMAIL` is the real manager Gmail for launch.
  - Confirm seed data will not overwrite real employee data after launch.
- [ ] Add a simple rollback plan.
  - Disable invites.
  - Revert deployment.
  - Pause email sending key.
  - Export UAT issue list and notification log.

## 3. Must Improve Before Soft Launch

- [ ] Production data path: confirm which workflows still use JSON test state versus Prisma/database state.
- [ ] Do not soft launch real employee scheduling until the required launch workflow persists correctly on the hosted database.
- [ ] Invite acceptance: show clear user-facing states for:
  - Missing token.
  - Expired token.
  - Already accepted token.
  - Signed in with the wrong Gmail.
  - Successful acceptance.
- [ ] Manager-only protection: verify production invite sending is blocked for non-managers.
- [ ] Employee onboarding: after invite acceptance, employee should land somewhere useful, not just the generic home state.
- [ ] Notification reliability: failed sends must be visible to the manager or owner.
- [ ] Owner alert path: reported UAT issues and notification failures must reach `OWNER_ALERT_EMAIL`.
- [ ] Mobile polish pass:
  - Invite acceptance on phone.
  - Google sign-in redirect on phone.
  - Availability submission.
  - Employee dashboard.
  - Team calendar.
- [ ] Calendar polish pass:
  - Sunday-start weeks.
  - Names are not cut off.
  - Unassigned shifts are obvious.
  - Publish warnings are readable.
- [ ] Privacy/security pass:
  - No secrets committed to git.
  - `.env` stays ignored.
  - Employee emails are not exposed outside manager/employee workflows.
  - Production database access is restricted to trusted admins.

## 4. Must Test Before The Meeting

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Local app still opens after build/dev restart.
- [ ] Fresh pre-release scenario works.
- [ ] Employee can accept mocked invite.
- [ ] Employee can submit unavailable days.
- [ ] Employee can submit no unavailable days.
- [ ] Manager sees missing availability prompts.
- [ ] Manager can generate a draft.
- [ ] Manager can assign shifts.
- [ ] Manager sees publish warnings and notification preview.
- [ ] Manager can publish.
- [ ] Employee sees their shifts after publish.
- [ ] Employee can request coverage.
- [ ] Another employee can offer coverage.
- [ ] Manager can approve/reject coverage.
- [ ] Employee can request a swap.
- [ ] Target employee can respond to swap.
- [ ] Manager can approve/reject swap.
- [ ] UAT issue logging works.
- [ ] UAT issue export works.
- [ ] Notification log records queued/sent/failed status.

## 5. Must Confirm With Manager During The Meeting

- [ ] Business owns the domain/account, not a personal student account.
- [ ] Manager approves the exact production URL.
- [ ] Manager approves the sender email address.
  - Recommended: `schedule@menarefrommars.com`
- [ ] Manager confirms where replies to schedule emails should go.
- [ ] Manager approves the public app/support email used in Google OAuth consent.
- [ ] Manager confirms the launch manager Gmail.
- [ ] Manager confirms the initial employee Gmail list for soft launch.
- [ ] Manager confirms this is a UAT/soft-launch tool, not yet the official payroll or HR system of record.
- [ ] Manager agrees which schedule period will be used for first real testing.
- [ ] Manager agrees who handles employee questions during soft launch.
- [ ] Manager agrees what happens if the app fails during the first week.

## 6. Credential Meeting Runbook

- [ ] Open the deployment provider.
- [ ] Create or select the app/project.
- [ ] Connect the GitHub repository if not already connected.
- [ ] Add production environment variables:
  - `DATABASE_URL`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL`
  - `NEXT_PUBLIC_APP_URL`
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
  - `OWNER_ALERT_EMAIL`
  - `SEED_MANAGER_EMAIL`
- [ ] Create/connect the hosted Postgres database.
- [ ] Run database setup for first UAT database:
  - `npm run prisma:push`
  - `npm run prisma:seed`
- [ ] Add the production domain/subdomain to the hosting provider.
- [ ] Add DNS records for hosting.
- [ ] Create Google OAuth credentials.
- [ ] Add authorized JavaScript origin:
  - `https://YOUR_DOMAIN`
- [ ] Add authorized redirect URI:
  - `https://YOUR_DOMAIN/api/auth/callback/google`
- [ ] Add Google OAuth client ID/secret to hosting env vars.
- [ ] Configure Resend email sender.
- [ ] Add DNS records for Resend domain verification.
- [ ] Wait for DNS/email verification when possible.
- [ ] Deploy/redeploy after env vars are saved.
- [ ] Open hosted app in a private/incognito browser.
- [ ] Sign in as manager.
- [ ] Send one test invite.
- [ ] Confirm email is delivered or clearly logged as pending/failed.

## 7. Soft Launch Gate

Soft launch is allowed only when all of these are true:

- [ ] Hosted app is on the final HTTPS domain.
- [ ] Manager Google sign-in works.
- [ ] Manager-only invite route is protected in production.
- [ ] At least one real employee invite email is delivered.
- [ ] Invite acceptance works from a phone.
- [ ] Accepted employee can sign in with the invited Gmail.
- [ ] Employee can complete availability submission on mobile.
- [ ] Manager can complete the full schedule draft and publish flow.
- [ ] Published schedule is visible to employees.
- [ ] Coverage and swap flows have passed one hosted test each.
- [ ] Notification failures are logged and owner-alerted.
- [ ] UAT issue reporting/export works.
- [ ] No secrets are committed.
- [ ] README/production setup docs match the actual provider/domain choices.

## 8. Post-Meeting Follow-Up

- [ ] Record which accounts own domain, hosting, database, Google Cloud, and email sender.
- [ ] Save non-secret DNS and deployment notes in repo docs.
- [ ] Keep secrets only in the provider dashboards or a secure password manager.
- [ ] Run one complete hosted UAT cycle with test employees.
- [ ] Fix any P0/P1 issues before inviting real staff.
- [ ] Prepare a short employee message:
  - What The Schedule is.
  - Which Gmail to use.
  - What they need to submit.
  - Who to contact if something looks wrong.
- [ ] Start soft launch with the smallest useful employee group.
