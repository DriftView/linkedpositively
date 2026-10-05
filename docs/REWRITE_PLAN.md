# Rewrite plan and status

The Drupal 7 sites Link Positively and Peer Navigation were rebuilt as this single Next.js + PostgreSQL app (it started on MongoDB and was moved to PostgreSQL in October 2026). The rule was **every feature of the old sites is carried over**, with known defects fixed rather than copied. The specs in `docs/legacy/` describe the old behaviour; the Drupal source they cite is in git history at commit `597af5c`.

## Decisions

- Next.js 16 (App Router), React 19, TypeScript strict, pnpm.
- PostgreSQL + Drizzle ORM (postgres.js driver, drizzle-kit migrations in `drizzle/`). Local dev database: embedded Postgres (`pnpm db`). Auth: Better Auth (Drizzle adapter, uuid ids, admin + username plugins).
- Background jobs: Inngest (works on Vercel or any Node host). No Docker for the new app.
- UI: Tailwind v4, shadcn/ui (Radix, "nova" preset), Lucide, Motion, Sonner. Brand palette kept from the old site (plum, magenta, aubergine, sky, apricot).
- One app, two programs: `lp` and `peernav`. Peer Navigation used to log in through LP (CAS); here both share one account system.
- SMS and email default to log-only (`DELIVERY_MODE=log`).
- Every table keeps its Drupal ids in `legacySite`/`legacyTable`/`legacyId` (users: `legacy` jsonb) so the data migration is re-runnable.

## Specs (docs/legacy)

| File | Area |
|---|---|
| 01-data-model-and-access.md | Entities, fields, roles, permissions, menus, blocks |
| 02-checkin-and-tips.md | Weekly check-in, Thrive Tips, tailored tips (written from the module code) |
| 03-community-profile-search.md | Wall, comments, reactions, flags, mentions, profile, search, glossary, calendar |
| 04-gamification-sms-techstep-admin.md | Achievements, points, SMS, TechStep, cron, admin tools |
| 05-peer-navigation-ecoach.md | Peer Navigation |
| 06-reports-views-theme.md | Reports, Views, LP theme/UX |

## Build status

- [x] Scaffold, env validation, logger, database client, local dev database (`pnpm db`, embedded Postgres)
- [x] Drupal password verification (tested against real Drupal hashes)
- [x] SMS / email / private storage services (log mode by default)
- [x] Design tokens, fonts, logo
- [x] Auth (username or email login, Drupal hash upgrade, reset password), roles, permissions, proxy
- [x] App shells (participant, coaching, staff), shared models (profile, points, notifications, usage), services
- [x] LP: wall, comments, reactions, flags, mentions, notifications, in-app messages
- [x] LP: Thrive Tips (tailored, explore by tags, favourites, comments, view points)
- [x] LP: daily tracker (mood, meds), personal trackers, calendar, reminders
- [x] LP: weekly check-in + feedback
- [x] LP: profile, avatars, badges, levels, leaderboard, account settings
- [x] LP: resources/locations, journey, glossary, static pages, tech support, search
- [x] LP: SMS program + click tracking, surveys (Qualtrics)
- [x] Peer Navigation: coach dashboard, sessions, notes, files, messages, tracker, participant pages
- [x] Admin: users, roles, randomization, content management, moderation, audit log, 21 reports + CSV
- [x] Old URLs and SMS links redirect to the new pages
- [x] Security review (fixes applied), unit tests, browser tests
- [x] Legacy data moved out of the repo (`../link-positively-legacy-data`), Drupal code deleted

## Data migration

`scripts/migrate/` copies the Drupal data into PostgreSQL. Every write is an upsert keyed on the legacy ids (`legacy_site/legacy_table/legacy_id`; users on `legacy_site/legacy_id`; or a natural unique key such as `(user_id, day)`), and a row is only updated when a value differs, so running it again changes nothing and creates no duplicates.

**How to run it**

1. Load the dumps (`../link-positively-legacy-data/db/*.sql`) into MySQL 5.7, e.g. a Docker container on 127.0.0.1:33067 with databases `lp`, `ecoach_a` (and `ecoach_b`).
2. Create an empty **UTF8** database (`create database … encoding 'UTF8' template template0 lc_collate 'C' lc_ctype 'C'`) and apply the schema: `DATABASE_URL=… pnpm db:migrate`.
3. `DATABASE_URL=… pnpm migrate:legacy`. It loads the app's storage service, so `BETTER_AUTH_SECRET` must be set (`.env` has it empty). Options: `--only=users,community` (steps in order: users, content, tips, resources, community, checkin, tracker, gamification, sms, surveys, support, peer-nav, usage; later steps need the earlier ones), `--skip=…`, `--skip-files`, `--dry-run`, `--no-verify`. Env: `LEGACY_MYSQL_URL` (default `mysql://root:legacy@127.0.0.1:33067`), `LEGACY_PN_DB` (default `ecoach_a`), `LEGACY_FILES_ROOT` (default `../../link-positively-legacy-data`).
4. The verification report runs at the end (or alone with `pnpm migrate:verify`): source vs migrated rows, orphans, duplicate and sum checks (points per user, comments per post, check-in days per user), password-hash format, and every legacy table with data that is not migrated. It prints to the console and writes `.data/migration-report.md`, and fails unless the target database is UTF8.

Files go through `server/services/storage.ts` (Cloudinary, or `.data/uploads` locally). Keys are random, so a row that already holds a key keeps it and nothing is uploaded twice; `--skip-files` leaves existing keys alone. Logs carry counts and ids only.

**Decisions**

- Peer Navigation source: `ecoach_a`. Both snapshots were taken the same day and every data table is identical (`CHECKSUM TABLE`). `ecoach_a` is the later one (newer admin last-access time, watchdog entries up to 2026-07-26, leftovers of the disabled usage-report module: an empty `ecoach_usage_session` and 3 role permissions). `ecoach_b` differs only in caches, sessions, watchdog, `system` and cache timestamps in `variable`.
- One person = one user. A PN account is merged into an LP account when `cas_user.cas_name` = the LP username (case-insensitive), else when the usernames match (with or without the same email), else when the emails match. Merged users keep `legacy = { site: "lp", id, lpUid, pnUid, match }`; LP wins for username, email, password hash, timezone and blocked status. Unmatched PN accounts become Peer Navigation-only users (`legacy.site = "peernav"`).
- Roles: LP via `LEGACY_ROLE_MAP`; on PN, `participant`/`tech-participant` mean the coached person → `ecoach_user`. `level-*` roles are dropped (levels come from points); `participant` + `control` together → `participant`. Blocked accounts (status 0) → banned.
- Passwords: the Drupal `$S$` hash goes into `account.password` (provider `credential`) and is upgraded at the first sign-in; an upgraded hash is never overwritten.
- HTML is sanitized with the app's sanitizers (`cleanUserHtml` for posts and comments, `sanitizeStaffHtml` for content), which drop `javascript:`/`data:` URLs. Tips embedded their pictures as base64 `data:` images: these are stored as files and listed in `tips.extra.legacyImages`.
- Dates: unix times → timestamptz; daily check-in and tracker days are taken in the user's timezone (Drupal ran each request in the user's timezone); wall-clock dates (intervention start) become local midnight in the user's timezone.
- Pages, level copy and survey settings are insert-only (staff edit them, and the app ships reviewed copy); everything else converges to the legacy data. Check-in prompts replace the seeded SAMPLE prompts.
- Rows owned by deleted Drupal accounts (most of the study's per-user history: points, check-ins, SMS logs, logins…) have no user to attach to; they are reported as orphans and not migrated. Shared content by deleted authors is kept and shown as "Former member". Tip views of deleted tips keep a stable placeholder tip id; member goals of deleted catalog goals keep `goalId` null and the copied names.

## Still to do

- **Data migration**: run it against production and decide on the gaps in the migration report (orphaned history of deleted accounts, tip images, usage counters).
- **Content review by the study team**: the real weekly check-in prompt wording (seeded prompts say "SAMPLE"), which badge image goes with each badge name, which worksheets belong to Peer Navigation sessions 3–6, and the help pages' copy (flagged "needs review").
- **Production setup**: managed PostgreSQL, Twilio (incoming webhook `/api/sms/inbound`), SMTP, Cloudinary, Inngest, and new credentials for everything stored on the old server. The Qualtrics sync is untested until a token exists.
- **Decisions from the security review**: whether former peer navigators keep read-only access to old threads, content checks for Peer Navigation file uploads, the trusted proxy IP for rate limiting, and a dedicated `community.view` permission.
