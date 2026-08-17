# The Schedule documentation

This directory is the source of truth for understanding, operating, testing, and maintaining The Schedule. It describes the application as it exists today: a single-store UAT deployment for Men Are From Mars with Google sign-in, Neon persistence, Resend email, and Vercel hosting.

## Start here

| If you need to… | Read |
| --- | --- |
| Understand the system and its data flow | [Architecture](./ARCHITECTURE.md) |
| Use every manager and employee feature | [Application user guide](./USER_GUIDE.md) |
| Run the complete production-like test journey | [Testing and UAT runbook](./TESTING_UAT.md) |
| Deploy, monitor, back up, restore, or troubleshoot production | [Production operations](./OPERATIONS.md) |
| Integrate with or inspect a server route | [API reference](./API_REFERENCE.md) |
| Set up the existing hosted UAT services | [Legacy production setup checklist](../PRODUCTION_SETUP.md) |
| Hand work to a future Codex session | [Codex project context](../CODEX_CONTEXT.md) |

## Product at a glance

The Schedule replaces a store's spreadsheet and paper workflow with two access levels:

- Managers collect availability, maintain employees, generate and edit the schedule, publish it, resolve coverage and swaps, review reports, manage backups, and run UAT.
- Employees submit their own availability, view published shifts and the team schedule, request or offer coverage, request or answer swaps, and report issues.

The manager is also schedulable floor staff. `Manager` and `employee` are access levels, not store job titles.

The canonical UAT application is [mafm-schedule.vercel.app](https://mafm-schedule.vercel.app).

## Current scope

The active build intentionally supports one store. The Prisma model is store-aware, but the primary scheduling workspace is currently one JSON document per store. The application is suitable for controlled UAT; before broad production use, the whole-workspace saves should be replaced with transactional, normalized schedule operations.

## Documentation rules

- Never add passwords, OAuth client secrets, database URLs, Resend keys, or `CRON_SECRET` values to documentation.
- Update the relevant guide in the same commit as a behavior, route, environment variable, backup, or deployment change.
- Treat the in-app `Test Plan` as the live manual checklist. This documentation explains how and when to use it.
- Keep instructions tied to visible labels in the application so a non-developer can follow them.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/components/the-schedule-app.tsx` | Main manager and employee interface |
| `src/lib/demo-data.ts` | Seeded scheduling data and core scheduling helpers |
| `src/lib/test-state-shared.ts` | Shared persisted workspace contract |
| `src/lib/workspace-state.ts` | Neon workspace reads, writes, and employee write filtering |
| `src/lib/auth.ts` | Google/Auth.js configuration and approved-account login rule |
| `src/lib/access.ts` | Active user and store-membership resolution |
| `src/lib/schedule-notifications.ts` | Reminder and publication delivery orchestration |
| `src/lib/schedule-progression.ts` | Simulated dates and recurring schedule-cycle transitions |
| `src/lib/workspace-backup.ts` | One-row snapshot, checksum verification, and restore |
| `src/lib/guided-uat.ts` | Guided normal-business test journey |
| `src/lib/uat-checklist.ts` | Advanced production test catalog |
| `prisma/schema.prisma` | Database schema |
| `prisma/migrations/` | Versioned database migrations |
| `vercel.json` | Daily rollout/backup cron schedule |

## Current release facts

- Framework: Next.js 15 App Router, React 19, and TypeScript.
- Database: Neon Serverless Postgres through Prisma 6.
- Authentication: Google OAuth through Auth.js with database sessions.
- Email: Resend; without a configured key, delivery is recorded as queued for safe local development.
- Hosting: Vercel.
- Store timezone: `America/Edmonton`.
- Daily Vercel job: `16:00 UTC` (`10:00 MDT` or `09:00 MST`, depending on daylight saving time).
- Guided normal journey: 48 saved steps.
- Advanced UAT catalog: 117 saved tests.
- Schedule history retained in the UAT workspace: six published periods.
- Protected backup retention: exactly one overwritten workspace backup row per store.
