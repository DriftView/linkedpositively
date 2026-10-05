# Conventions

How code in this app is written. Read this before adding a feature. The old Drupal behaviour for each area is described in `docs/legacy/*.md` (the Drupal source they cite is in git history at commit `597af5c`); the build status is in `docs/REWRITE_PLAN.md`.

## Stack

Next.js 16 App Router (read `node_modules/next/dist/docs/` when unsure — APIs changed: `proxy.ts` replaces middleware, `params`/`searchParams`/`cookies()` are async, `revalidateTag(tag, profile)` needs two args, `updateTag`/`refresh` exist), React 19, TypeScript strict, PostgreSQL via Drizzle ORM (postgres.js), Better Auth, Inngest, Tailwind v4, shadcn/ui (Radix, in `src/components/ui`), Lucide icons, Motion, Sonner, Zod 4, next-safe-action 8, date-fns 4 + @date-fns/tz, Tiptap 3, TanStack Table/Query, Recharts, @dnd-kit, papaparse.

## Layout

```
src/
  app/
    (auth)/          login, forgot/reset password (signed out)
    (participant)/   Link Positively app (ParticipantShell) — "/", /tips, /tracker, /profile, …
    (coaching)/      Peer Navigation participant side (ParticipantShell) — /coaching/…
    (staff)/         staff + peer navigators (StaffShell) — /admin/…, /coach/…
    api/             route handlers (auth, inngest, files, avatars, exports…)
  components/
    ui/              shadcn primitives — don't edit, compose
    app/             shared app components (shells, PageHeader, UserAvatar…)
  features/<area>/   everything for one area: queries.ts, actions.ts, components/, jobs.ts, schemas.ts, *.test.ts
  server/
    auth/            auth.ts, roles.ts (roles + permissions), session.ts (getViewer/requirePermission/can)
    db/              client.ts (db, withTransaction), ids.ts (isUuid), schema/ (Drizzle tables by domain)
    services/        sms, mail, storage, sanitize, usage
    actions/         safe-action clients
  lib/               client-safe helpers (dates, initials, utils)
```

Route files stay thin: they check access, call `features/<area>/queries.ts`, and render feature components.

## Data

PostgreSQL through Drizzle ORM (postgres.js driver). Schema: `src/server/db/schema/<domain>.ts`, re-exported from `src/server/db/schema/index.ts`. Client: `src/server/db/client.ts`.

```ts
import { and, desc, eq } from "drizzle-orm";
import { db, withTransaction } from "@/server/db/client";
import { posts, type Post } from "@/server/db/schema";
import { isUuid } from "@/server/db/ids";
```

- **Schema changes**: edit the schema file, run `pnpm db:generate`, check the SQL in `drizzle/`, run `pnpm db:migrate`, commit both. Never edit an applied migration. Local DB: `pnpm db` (embedded Postgres on :54329, data in `.data/pg`), `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:54329/linkpositively`. `pnpm db:studio` browses it.
- **Naming**: tables are snake_case plural (`posts`, `tip_favorites`; a few keep their old collection name: `audit_log`, `level_copy`, `sms_inbound`; Peer Navigation tables are `peer_nav_*`). Exported TS names are camelCase (`posts`, `tipFavorites`, `pnSessions`). Columns are declared without names and `casing: "snake_case"` (client + drizzle-kit) maps `createdAt` ↔ `created_at`, so TS field names match the old Mongoose field names. Types: `Post = typeof posts.$inferSelect`, `NewPost = typeof posts.$inferInsert` are exported next to each table.
- **Ids**: every table has `id uuid primary key default gen_random_uuid()` (Better Auth too: `generateId: "uuid"`). Mongo `_id` → `id`, already a string. Validate ids from URLs/forms with `isUuid(value)` (replaces `isValidObjectId`; Postgres throws on a malformed uuid) or `uuidSchema` in Zod; `newId()` when you need an id before inserting. All from `@/server/db/ids` (client-safe).
- **References** are real foreign keys. Owned data cascades when its user is deleted (favourites, reactions, check-ins, trackers, notifications, points…); optional staff/actor references (`updatedBy`, `resolvedBy`, `handledBy`, `actorId`…) and authorship of shared content (`posts.authorId`, `comments.authorId`, which the UI shows as "Former member") are `on delete set null`, so they are nullable. `message_threads.coach_id` is `restrict`. Polymorphic targets (`comments.targetId`, `reactions.targetId`, `contentReports.targetId`, `mentions.entityId`) have no FK: delete them together with the target, in one transaction.
- **Legacy ids**: tables that used `withLegacy` have `legacySite` ("lp" | "peernav"), `legacyTable`, `legacyId` columns (`legacyColumns()` in `schema/_shared.ts`) with a unique index on the three where `legacy_id is not null`, and a CHECK that site and table are set whenever `legacyId` is. Look up `where(and(eq(t.legacySite, "lp"), eq(t.legacyId, nid)))`; upsert in migrations with `onConflictDoUpdate({ ...legacyConflict(t), set })`. Users keep the `legacy` jsonb Better Auth field (`{ site, table?, id }`), plus read-only generated columns `users.legacySite` / `users.legacyId` with a unique index `(legacy_site, legacy_id)`: query and upsert users by those; never write them.
- **Embedded data**: single subdocuments that are always read with their row are `jsonb().$type<…>()` (`posts.photo`, `tips.rule`, `checkinPrompts.likertOptions`, `weeklyCheckins.days`, `surveys.fieldMap`, `trackers.reminder`). A subdocument field that is queried is a real column (`posts.tipCommentId`, `resources.geocodeStatus`) or a generated column (`trackers.reminderEnabled` from `reminder.enabled`). Arrays of strings are `text[]`; arrays of ids queried with `$in` are `uuid[]` with a GIN index (`tips.tagIds`, `resources.tagIds`, `auditLog.targetIds`) — query with `arrayContains` / `arrayOverlaps`. Real per-member state is a child table (`messageThreadMembers`). Data we don't use yet goes in `extra` (jsonb) — never drop a field the old site stored (see docs/legacy/01).
- **Enums**: `text().$type<…>()` plus a CHECK constraint (`enumCheck` in `_shared.ts`); the value list is an exported `as const` array next to the table (`NOTIFICATION_KINDS`, `PN_SESSION_STATUSES`…). Adding a value = edit the array + `pnpm db:generate`. Numeric ranges that matter have CHECKs too; string length caps live in Zod, not the database.
- **Dates**: `timestamptz` read as JS `Date` (`tstz()`); `createdAt`/`updatedAt` default to now and `updatedAt` is bumped by Drizzle on every update. Local calendar days ("yyyy-MM-dd") are `date` columns read as strings.
- **Text search**: `tips.searchVector` is a generated, GIN-indexed tsvector (title weight A, searchText D): `where(sql\`${tips.searchVector} @@ websearch_to_tsquery('english', ${q})\`)`, rank with `ts_rank`. Elsewhere use `ilike` (escape `%`/`_`). Case-insensitive sorts use `lower(col)`.
- **Distance**: resources have `lat`/`lng` (double precision, no PostGIS); compute haversine distance in SQL (formula in `schema/resources.ts`).
- **Counters** (`commentCount`, `reportCount`, `useCount`…) are integers: update atomically with `sql\`${t.col} + 1\``, never read-modify-write.
- **Idempotent writes** use unique indexes + `onConflictDoNothing` / `onConflictDoUpdate` (notifications `dedupeKey`, points `key`, SMS sends, tip views…). Partial unique indexes need `where`/`targetWhere` matching the index predicate.
- **Transactions**: `withTransaction(async (tx) => { … })` (or `db.transaction`) when a write touches several tables and must be all-or-nothing; pass `tx`, not `db`, to everything inside. Helpers that can run either way take an `Executor` (`Db | Tx`).
- **Session revisions** (`pnSessionRevisions`) are immutable: a trigger rejects UPDATE. Insert a new revision instead.
- Shared tables (don't change their shape without asking): `users` (Better Auth's `user` table, read-mostly — Better Auth owns the auth columns), `profiles` (one per user), `pointEntries`, `notifications`, `usageEvents`, `loginSessions`.
- Index what you query.

## Reading data

- In Server Components, call functions from `features/<area>/queries.ts` (`import "server-only"`).
- Return **DTOs**: plain objects with string ids and ISO dates, only the fields the UI needs. Never pass raw rows with private columns to client components.
- Never expose one participant's private data to another: email, phone, study ID, intervention date, check-in answers, health data. Public profile = name, level, avatar, about me, badges, posts.
- Paginate lists (cursor on `(createdAt, id)`). Feeds use infinite scroll.

## Writing data

- Server Actions in `features/<area>/actions.ts` with `"use server"`, built from `permissionAction("<permission>")` (or `authedAction`) with `.inputSchema(zodSchema)`.
- Check **ownership** in every action that touches something that belongs to someone (edit/delete own post, coach owns participant, …). The old site skipped these; don't.
- Validate ids with `isUuid` (`@/server/db/ids`). Cap string lengths in Zod.
- Throw `UserFacingError("…")` for messages the user should see; anything else becomes a generic error and is logged.
- After a write: `revalidatePath` / `updateTag` for what changed, or `refresh()`. Return what the client needs for optimistic UI.
- Side effects that must not fail the action (points, notifications, usage) use the never-throw helpers:
  - `award({ userId, reason, key? })` from `features/gamification/points.ts` (rules in `POINT_RULES`; use `key` for once-only awards)
  - `notify({ userId, kind, text, dedupeKey, actorId?, excerpt?, href? })` from `features/notifications/notify.ts`
  - `trackUsage(userId, type, meta?)` from `server/services/usage.ts`

## Permissions

`src/server/auth/roles.ts` defines roles (`admin`, `research_admin`, `coordinator`, `coach`, `participant`, `control`, `ecoach_user`) and feature permissions. In pages use `requirePermission("…")`; in actions `permissionAction("…")`; in UI decisions `can(viewer, "…")`. If you need a permission that doesn't exist, use the closest one and say so in your report — don't edit roles.ts.

## UI

The look is warm, calm and modern — a supportive health app, not a dashboard template. The brand is plum (`primary`), magenta (`brand-magenta`), sky (`brand-sky`), apricot (`brand-apricot`), pink (`brand-pink`) on faintly plum-tinted neutrals. Headings use the display font automatically (`h1–h4` get `font-heading`).

- Mobile first. Participant pages live in a reading column (the shell gives ~42rem on desktop); design for 390px wide first, then check 1280px. Staff pages are wide and data-dense.
- Surfaces: `rounded-2xl border bg-card shadow-soft` for cards; `bg-secondary` for tinted highlights; `bg-muted/60` for quiet wells. Avoid heavy borders and drop shadows elsewhere.
- Use `PageHeader` for page titles (supports the "N new" counter), `UserAvatar` for people, shadcn `Empty` for empty states (friendly copy + a next step), `Skeleton` in `loading.tsx` for slow pages, `Spinner` inside buttons while pending, `toast` (sonner) for results of actions.
- Buttons: `rounded-full` pills for primary participant actions (the old site's signature), regular radius in staff UI. Toggle pairs → `ToggleGroup`. Selected state uses primary/secondary tokens, not the old green.
- Motion: subtle. `animate-rise` for entering content; `motion` for list reordering/layout; respect reduced motion (global CSS handles most).
- Icons: Lucide. Reactions may use emoji or the legacy reaction SVGs from `public/`.
- Copy: plain, kind, second person ("You're all caught up", not "No records found"). Sentence case. No lorem ipsum.
- Dark mode must look right — use tokens, never hard-coded hex colours in components.
- Accessibility: every input has a label; icon-only buttons have `aria-label`; async results announced (toasts are live regions); keyboard reachable; visible focus; hit targets ≥ 40px on touch.

## Dates and time

The study is timezone-sensitive. Use `src/lib/dates.ts` with `viewer.timezone` (or the participant's timezone in jobs): `friendlyDate`, `shortAgo`, `dayKey`, `studyWeek`, `studyDay`, `formatInZone`.

## Files

`server/services/storage.ts`: `putFile(folder, buffer, type)`, `signedFileUrl(key, filename?)`, `deleteFile(key)`, `ALLOWED_UPLOAD_TYPES`, `MAX_UPLOAD_BYTES`. Files are private; check access before creating a signed URL. Avatars are served by `/api/avatars/[userId]` (library avatars are `public/avatars/<avatarId>.png`).

## Background jobs

Add Inngest functions to `features/<area>/jobs.ts` (already registered in `app/api/inngest/route.ts`):

```ts
inngest.createFunction(
  { id: "time-on-site-points", triggers: [{ cron: "TZ=America/New_York 0 23 * * *" }] },
  async ({ step }) => { … },
);
```

Event payloads carry ids only. Jobs must be idempotent (safe to retry).

## SMS and email

`sendSms({ to, body, mediaUrl?, ref })` and `sendMail({ to, subject, template, ref })`. They only log unless `DELIVERY_MODE=live`. Email templates are React Email components in `src/server/emails/` using `EmailLayout`.

## Security and privacy

- Treat everything from the client as untrusted, including ids in URLs and form fields.
- Sanitize HTML with `sanitizeUserHtml` (participants) / `sanitizeStaffHtml` (staff) before storing; render stored HTML with `dangerouslySetInnerHTML` only after that.
- Logs, job events and analytics carry ids only — no names, phone numbers, emails, message bodies or health answers.
- Don't replicate the defects listed in the legacy specs (missing ownership checks, GET-deletes, global counters, …).

## Quality bar

- `npx tsc --noEmit` and `npx eslint <your files>` clean for your files. Unit-test non-trivial logic (`*.test.ts`, Vitest).
- Look at your pages: with the dev server running on :3000, `MSYS_NO_PATHCONV=1 npx tsx scripts/shot.mts <username> <outDir> /path /path@390` takes light + dark screenshots (seeded users: admin, research, coordinator, coach, participant, both, pnonly, control — password `password123`). Fix what looks off.
- Sample content for local testing goes in `scripts/seed-<area>.mts` (run with `npx tsx --env-file=.env.local --conditions=react-server scripts/seed-<area>.mts`). Site-authored program content that the specs quote verbatim (SMS texts, session descriptions, level copy…) may be used as seed/default content. Never copy participant data.
- No TODO placeholders or dead buttons: if something can't be finished, leave it out of the UI and list it in your report.
