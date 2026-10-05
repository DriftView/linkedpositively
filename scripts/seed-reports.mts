/**
 * Sample activity for the study reports (never run against production):
 * sign-in sessions (some without a sign-out), tracker/resource/profile
 * usage events, content-warning clicks, avatar changes, resource ratings,
 * journey goals, tip views and favourites and survey completions, for the
 * seeded participants that have a study ID. Also gives the community seed
 * participants (alex, jamie, dana, kim, robin, shay) a study ID and an
 * intervention start when they have none, so they show up in reports.
 *
 * Every row it creates is marked with `legacyTable: "seed_reports"` (legacy
 * columns, site "lp", a running id) and is replaced on the next run.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-reports.mts
 */
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, pgClient, withTransaction } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { journeyUserGoals } from "@/server/db/schema/content";
import { profiles } from "@/server/db/schema/profiles";
import { resourceRatings, resources as resourcesTable } from "@/server/db/schema/resources";
import { surveyResponses } from "@/server/db/schema/surveys";
import { loginSessions, usageEvents } from "@/server/db/schema/system";
import { tipFavorites, tips as tipsTable, tipViews } from "@/server/db/schema/tips";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const SEED_TABLE = "seed_reports";
let markId = 0;
/** Legacy columns marking a row as made by this script (unique per row). */
const mark = () => ({ legacySite: "lp" as const, legacyTable: SEED_TABLE, legacyId: ++markId });
const DAY = 86_400_000;

/** Small deterministic PRNG so every run produces the same data. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Study IDs for the community seed participants.
const EXTRA_SIDS: Record<string, { sid: string; startDaysAgo: number }> = {
  alex: { sid: "LP-2001", startDaysAgo: 70 },
  jamie: { sid: "LP-2002", startDaysAgo: 55 },
  dana: { sid: "LP-2003", startDaysAgo: 40 },
  kim: { sid: "LP-2004", startDaysAgo: 90 },
  robin: { sid: "LP-2005", startDaysAgo: 25 },
  shay: { sid: "LP-2006", startDaysAgo: 12 },
};
for (const [username, plan] of Object.entries(EXTRA_SIDS)) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!user) continue;
  const [profile] = await db
    .select({ studyId: profiles.studyId, interventionStartDate: profiles.interventionStartDate })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);
  const set: { studyId?: string; interventionStartDate?: Date } = {};
  if (!profile?.studyId) set.studyId = plan.sid;
  if (!profile?.interventionStartDate) {
    const start = new Date(Date.now() - plan.startDaysAgo * DAY);
    start.setUTCHours(4, 0, 0, 0);
    set.interventionStartDate = start;
  }
  if (Object.keys(set).length) {
    await db
      .insert(profiles)
      .values({ userId: user.id, ...set })
      .onConflictDoUpdate({ target: profiles.userId, set });
    console.log(`study   ${username} → ${JSON.stringify(Object.keys(set))}`);
  }
}

// Clear what the previous run made.
await withTransaction(async (tx) => {
  for (const table of [
    loginSessions,
    usageEvents,
    resourceRatings,
    journeyUserGoals,
    tipViews,
    tipFavorites,
    surveyResponses,
  ]) {
    await tx.delete(table).where(eq(table.legacyTable, SEED_TABLE));
  }
});

const studyProfiles = await db
  .select({ userId: profiles.userId, studyId: profiles.studyId })
  .from(profiles)
  .where(and(sql`${profiles.studyId} is not null`, ne(profiles.studyId, "")));
const participants = studyProfiles.length
  ? await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(
        and(
          inArray(
            users.id,
            studyProfiles.map((p) => p.userId),
          ),
          sql`${users.role} ~ '(^|,)\\s*participant\\s*(,|$)'`,
        ),
      )
      .orderBy(asc(users.createdAt), asc(users.id))
  : [];

const AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15",
];
const AVATARS = ["pack-1-03", "pack-1-07", "pack-2-02", "pack-2-11", "pack-3-05"];
const tips = await db
  .select({ id: tipsTable.id })
  .from(tipsTable)
  .where(eq(tipsTable.published, true))
  .orderBy(asc(tipsTable.createdAt), asc(tipsTable.id));
const resources = await db
  .select({ id: resourcesTable.id })
  .from(resourcesTable)
  .where(eq(resourcesTable.status, "published"))
  .orderBy(asc(resourcesTable.createdAt), asc(resourcesTable.id))
  .limit(12);

const now = Date.now();
let seeded = 0;
for (const [index, user] of participants.entries()) {
  const rand = random(1000 + index * 97);
  const userId = user.id;
  const agent = AGENTS[index % AGENTS.length];
  const at = (daysAgo: number) => new Date(now - daysAgo * DAY - Math.floor(rand() * 12 * 3_600_000));

  // Sign-ins over the last ten weeks; about a third signed out properly.
  const sessions = [];
  const count = 6 + Math.floor(rand() * 18);
  for (let i = 0; i < count; i++) {
    const loginAt = at(Math.floor(rand() * 70));
    const closed = rand() < 0.35;
    const minutes = 2 + Math.floor(rand() * 40);
    sessions.push({
      userId,
      loginAt,
      logoutAt: closed ? new Date(loginAt.getTime() + minutes * 60_000 + Math.floor(rand() * 60_000)) : null,
      userAgent: agent,
      program: "lp" as const,
      ...mark(),
    });
  }
  await db.insert(loginSessions).values(sessions);

  // Usage events the counter reports read.
  const events: (typeof usageEvents.$inferInsert)[] = [];
  const add = (type: string, n: number, meta: Record<string, string> = {}) => {
    for (let i = 0; i < n; i++) events.push({ userId, type, meta, at: at(Math.floor(rand() * 70)), ...mark() });
  };
  add("tracker_view", Math.floor(rand() * 14), { tracker: "checkin" });
  add("resource_view", Math.floor(rand() * 8));
  add("profile_edit", Math.floor(rand() * 4), { field: "aboutMe" });
  add("profile_edit", Math.floor(rand() * 2), { field: "badges" });
  add("content_warning_open", Math.floor(rand() * 3));
  const avatarChanges = Math.floor(rand() * 3);
  for (let i = 0; i < avatarChanges; i++) {
    events.push({
      userId,
      type: "profile_avatar",
      meta: { avatar: AVATARS[(index + i) % AVATARS.length] },
      at: at(60 - i * 20),
      ...mark(),
    });
  }
  if (events.length) await db.insert(usageEvents).values(events);

  // Resource ratings (one per user and resource: keep a rating made in the app).
  const rated = resources.filter(() => rand() < 0.25);
  if (rated.length) {
    await db
      .insert(resourceRatings)
      .values(
        rated.map((r) => {
          const when = at(Math.floor(rand() * 60));
          return {
            userId,
            resourceId: r.id,
            value: 1 + Math.floor(rand() * 5),
            createdAt: when,
            updatedAt: when,
            ...mark(),
          };
        }),
      )
      .onConflictDoNothing({ target: [resourceRatings.userId, resourceRatings.resourceId] });
  }

  // Journey goals with progress updates.
  const goals = Math.floor(rand() * 3);
  for (let i = 0; i < goals; i++) {
    const createdAt = at(30 + Math.floor(rand() * 30));
    await db.insert(journeyUserGoals).values({
      userId,
      ownCategory: "Everyday health",
      ownGoal: ["Take my meds with breakfast", "Walk three times a week", "Book my next clinic visit"][i % 3],
      step: 2,
      dismissed: false,
      updateCount: Math.floor(rand() * 6),
      createdAt,
      updatedAt: new Date(createdAt.getTime() + 7 * DAY),
      ...mark(),
    });
  }

  // Tip views and favourites (only where the tip-seed made none).
  for (const tip of tips) {
    if (rand() > 0.3) continue;
    const [exists] = await db
      .select({ id: tipViews.id })
      .from(tipViews)
      .where(and(eq(tipViews.userId, userId), eq(tipViews.tipId, tip.id)))
      .limit(1);
    if (exists) continue;
    const first = at(Math.floor(rand() * 60));
    await db.insert(tipViews).values({
      userId,
      tipId: tip.id,
      count: 1 + Math.floor(rand() * 4),
      recommended: rand() < 0.3,
      firstViewedAt: first,
      lastViewedAt: first,
      ...mark(),
    });
    if (rand() < 0.25) {
      await db
        .insert(tipFavorites)
        .values({ userId, tipId: tip.id, createdAt: first, ...mark() })
        .onConflictDoNothing({ target: [tipFavorites.userId, tipFavorites.tipId] });
    }
  }

  // Survey completions: everyone did the baseline; some the midpoint.
  const profile = studyProfiles.find((p) => p.userId === user.id);
  const hasResponse = async (surveyKey: "baseline" | "midpoint") =>
    (
      await db
        .select({ id: surveyResponses.id })
        .from(surveyResponses)
        .where(and(eq(surveyResponses.userId, userId), eq(surveyResponses.surveyKey, surveyKey)))
        .limit(1)
    ).length > 0;
  if (!(await hasResponse("baseline"))) {
    await db
      .insert(surveyResponses)
      .values({
        surveyKey: "baseline",
        userId,
        studyId: profile?.studyId,
        source: "staff",
        outcome: "completed",
        completedAt: at(75),
        ...mark(),
      });
  }
  if (rand() < 0.5 && !(await hasResponse("midpoint"))) {
    await db
      .insert(surveyResponses)
      .values({
        surveyKey: "midpoint",
        userId,
        studyId: profile?.studyId,
        source: "participant",
        outcome: "completed",
        completedAt: at(10),
        ...mark(),
      });
  }
  seeded += 1;
  console.log(`seeded  ${user.username} (${sessions.length} sessions, ${events.length} events)`);
}

console.log(`done: ${seeded} participants`);
await pgClient.end();
