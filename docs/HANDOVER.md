# Link Positively — Engineering Handover

**Prepared:** 28 October 2026  
**Repository:** `linkedpositively`  
**Application:** Link Positively + Peer Navigation, rebuilt as one web app

## Project at a glance

This is a feature-rich study and participant support app. It combines the Link Positively participant experience, Peer Navigation participant and coach workflows, and staff administration. The former Drupal 7 sites have been rewritten as a single application; the legacy behaviour and migration decisions are documented in `docs/legacy/` and `docs/REWRITE_PLAN.md`.

The codebase uses Next.js 16 App Router, React 19, strict TypeScript, PostgreSQL, Drizzle ORM, Better Auth, Inngest, Tailwind CSS v4, and shadcn/ui. Package management is pnpm (`pnpm@12.8.1`). Read `AGENTS.md` and `docs/CONVENTIONS.md` before changing code. This project has Next.js 16 conventions; consult the installed documentation in `node_modules/next/dist/docs/` when uncertain.

## Current state and handover priorities

The rewrite is broadly implemented: participant features, Peer Navigation, staff/admin tools, old URL redirects, and migration scripts are present. Treat the following as outstanding operational/product work rather than assuming production is ready:

1. **Production data migration and reconciliation** have not been completed. Follow “Data migration” in `docs/REWRITE_PLAN.md`; review the generated migration report and disposition every gap.
2. **Production infrastructure and integrations** need setup: managed PostgreSQL, Inngest, Twilio webhook, SMTP, Cloudinary, and fresh credentials. The Qualtrics sync needs a real token and validation.
3. **Study-team content review** remains: check-in wording, badge artwork mapping, Peer Navigation session 3–6 worksheets, help page copy, and five draft AI knowledge articles. AI fallback/contact defaults also need product confirmation (`docs/AI_COACH.md`).
4. **Security review decisions** remain documented at the end of `docs/REWRITE_PLAN.md`: former navigator read-only thread access, Peer Navigation upload content checks, trusted proxy IP for rate limits, and a dedicated `community.view` permission.

Do not assume old credentials or existing local `.env` values are safe or current. The local `.env` is ignored by Git and contains populated secrets, including third-party/API and database credentials. Never commit, copy into handover messages, or expose its values. Rotate any credentials that may have been stored on the old server before production use. The repo README also calls out this rotation requirement.

## Local development

Prerequisites: Node.js 20.9+, pnpm, and Windows/macOS/Linux. Docker is not needed for the app’s local PostgreSQL workflow.

```sh
pnpm install
# Create .env.local from the team's secure environment template/secret manager.
# Required at minimum: DATABASE_URL, BETTER_AUTH_SECRET (32+ chars),
# BETTER_AUTH_URL, NEXT_PUBLIC_APP_URL.
pnpm db                 # embedded PostgreSQL on 127.0.0.1:54329; keep running
pnpm db:migrate         # apply committed Drizzle migrations
pnpm seed               # local test accounts; shared password: password123
pnpm dev                # http://localhost:3000
```

The documented test users are `admin`, `research`, `coordinator`, `coach`, `participant`, `both`, `pnonly`, and `control`. Optional per-area content seeders are in `scripts/seed-*.mts`. They are for local/test data only; never seed sample content into production without reviewing the script and intended effect.

For local background-job development, run `pnpm jobs` in a second terminal; the Inngest dev dashboard is at `http://localhost:8288`. SMS and email default to `DELIVERY_MODE=log`; keep this mode locally so no real participant communications are sent.

The README mentions `.env.example`, but no `.env.example` is currently present in the repository. `src/env.ts` is the authoritative list of variables and validation rules. Obtain a clean template or values from the team’s approved secret manager; do not use the checked-out `.env` as a handoff mechanism.

## Main application areas

| Area | Routes / code |
|---|---|
| Authentication and account settings | `src/app/(auth)/`, `src/app/(account)/`, `src/server/auth/` |
| Link Positively participant app | `src/app/(participant)/`, `src/features/` |
| Peer Navigation participant experience | `src/app/(coaching)/` |
| Staff, coaching, and admin | `src/app/(staff)/` |
| API endpoints | `src/app/api/` |
| Database schema and access | `src/server/db/schema/`, `src/server/db/client.ts` |
| Background work | `src/features/*/jobs.ts`, registered in `src/app/api/inngest/route.ts` |
| Private storage, email, SMS | `src/server/services/` |
| Legacy Drupal specifications | `docs/legacy/` |
| Rewrite status and data migration | `docs/REWRITE_PLAN.md`, `scripts/migrate/` |

Route files should stay thin: authorization, feature queries, and rendering. Put domain logic in its `src/features/<area>/` module. Follow `docs/CONVENTIONS.md` for permission checks, data transfer objects, ownership checks, privacy, idempotency, sanitization, and date/time handling.

## Database and data migration

PostgreSQL schema is defined under `src/server/db/schema/`; committed migrations are in `drizzle/`. For schema changes, update the schema, run `pnpm db:generate`, inspect the generated SQL, apply with `pnpm db:migrate`, and commit schema and migration together. Never edit an already-applied migration. The local embedded database persists under `.data/pg`; it is ignored by Git.

Drupal migration tooling is under `scripts/migrate/`. It expects legacy SQL dumps outside this repository at `../link-positively-legacy-data` and a MySQL source (see `docs/REWRITE_PLAN.md` for database names, connection defaults, options, and mapping rules). Migration writes are designed to be repeatable using legacy IDs and natural keys. Run `pnpm migrate:verify` after migration; inspect `.data/migration-report.md`, especially orphaned users/history, row counts, and source tables with unconverted data. Do not run against production until source/target, backup, and credentials have been confirmed with the project owner.

## Configuration and external services

`src/env.ts` lists and validates environment configuration. Core required values are `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `NEXT_PUBLIC_APP_URL`. Optional integrations include Twilio, SMTP, Cloudinary, Inngest, Qualtrics, Google Maps, Anthropic, ElevenLabs, and Anam. Review feature-specific code/docs before enabling an integration. In particular:

- Keep `DELIVERY_MODE=log` in development and staging unless sending is explicitly intended and safe.
- Production SMS inbound webhook is `POST /api/sms/inbound`.
- Inngest serves the app’s registered jobs at `/api/inngest`.
- Without Cloudinary credentials, file storage falls back to local `.data/uploads`; production should use configured private storage.
- AI Coach has fallback behaviour without model credentials; read `docs/AI_COACH.md` before enabling it for participants.

## Checks and useful commands

```sh
pnpm typecheck
pnpm lint
pnpm test          # Vitest unit tests
pnpm test:e2e      # Playwright; seeded data and running app required
pnpm build
pnpm db:studio     # Drizzle Studio
```

Do not report checks as passing unless they were run. E2E tests may use saved local auth state under ignored `e2e/.auth/`; never commit it. Existing test coverage and conventions are described in `docs/CONVENTIONS.md`.

## First-week engineer checklist

- [ ] Confirm repository remote, branch/release process, owners, deployment target, and access to approved secrets and infrastructure.
- [ ] Read `AGENTS.md`, `README.md`, `docs/CONVENTIONS.md`, `docs/REWRITE_PLAN.md`, and relevant legacy/feature docs.
- [ ] Set up a fresh local environment without reusing or distributing the checked-out `.env` secrets.
- [ ] Start the app and verify seeded participant/staff flows locally with delivery in log mode.
- [ ] Review production migration status/report and confirm backup/restore and rollback procedures with the owner.
- [ ] Agree on owners and dates for content review, security decisions, integrations, and launch readiness.

## Contacts and ownership

The repository does not identify a current technical owner, deployment owner, production URL, incident contact, or secret-manager location. Record these with the project sponsor during handover; do not infer them from local credentials or configuration.
