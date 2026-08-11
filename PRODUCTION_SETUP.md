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

   The sending domain must be verified in Resend before real delivery is reliable.

6. Seed the store and manager.
   `SEED_MANAGER_EMAIL` should stay as `m.kodithuwakku803@gmail.com` unless the manager account changes.

   Verify the seeded manager email in Neon before inviting employees. A placeholder such as `manager@example.com` must not remain the only manager membership.

7. Send production invites from the hosted app.
   The manager adds an employee email in the Employees tab. The app creates a database invite and emails a link to `/api/invites/accept?token=...`.

8. Redeploy on Vercel after the schema update.
   Keep `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` equal to the canonical HTTPS domain, then confirm the Google redirect URI uses that same domain exactly.

## Production Verification

1. Open the domain in a private browser and confirm it shows only the Google sign-in screen.
2. Sign in with an uninvited account and confirm access is denied.
3. Sign in with an employee account and confirm there is no role or employee switcher.
4. Confirm the employee can change only their own availability and requests.
5. Sign in with the manager account and confirm manager tools plus `My employee view` are available.
6. Refresh on a second device and confirm schedule changes persist through Neon.

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
