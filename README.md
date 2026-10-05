# Link Positively (web app)

Both study programs in one app: Link Positively (wall, Thrive Tips, check-ins, trackers, profiles, resources)
and Peer Navigation (coach workspace and participant coaching area), plus the staff workspace (users,
randomization, content, moderation, SMS program, surveys, reports).

Stack: Next.js 16 (App Router), React 19, TypeScript, PostgreSQL + Drizzle ORM, Better Auth, Inngest (background
jobs), Tailwind v4 + shadcn/ui.

## Run it locally

Needs Node 20.9+ and pnpm. No Docker.

```sh
pnpm install
cp .env.example .env.local      # then set BETTER_AUTH_SECRET (the file says how)
pnpm db                          # local PostgreSQL (embedded, no Docker) on :54329, data in .data/pg — leave it running
pnpm db:migrate                  # create/update the tables (run again after pulling new migrations)
pnpm seed                        # test accounts; password for all: password123
pnpm dev                         # http://localhost:3000
```

Sample content for each area (optional):

```sh
for s in profile community tips checkin tracker content peer-nav admin reports; do
  npx tsx --env-file-if-exists=.env --env-file-if-exists=.env.local --conditions=react-server scripts/seed-$s.mts
done
```

Test accounts: `admin`, `research`, `coordinator`, `coach` (peer navigator), `participant`, `both`
(participant + Peer Navigation), `pnonly` (Peer Navigation only), `control` (control arm).

Background jobs (SMS program, reminders, points, auto-block, Qualtrics sync) run through Inngest. Locally:
`pnpm jobs` starts the Inngest dev server (dashboard at http://localhost:8288).

**Texts and emails are never sent locally.** With `DELIVERY_MODE=log` (the default) they are written to the
server log. Only set `DELIVERY_MODE=live` in production.

Old data: `pnpm migrate:legacy` copies the Drupal MySQL data into PostgreSQL (see docs/REWRITE_PLAN.md, "Data migration").

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test          # unit tests (Vitest)
pnpm test:e2e      # browser tests (Playwright) against the running dev server with seeded data
pnpm build
```

## Deploying

Any Node host (or Vercel) plus a PostgreSQL 15+ database (run `pnpm db:migrate` against it on each deploy). Set the variables from
`.env.example`: at minimum `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`;
Twilio, SMTP and Cloudinary for delivery and file storage; Inngest keys for jobs. Point the Twilio number's incoming
message webhook at `POST /api/sms/inbound`.

Before going live, rotate every credential that was stored on the old server (Twilio, CAS, database, Google
key): the old settings and database are in the legacy backups.

## Where things are

See [docs/CONVENTIONS.md](docs/CONVENTIONS.md). In short: routes in `src/app`, one folder per area in
`src/features`, models in `src/server/models`, auth and permissions in `src/server/auth`.
