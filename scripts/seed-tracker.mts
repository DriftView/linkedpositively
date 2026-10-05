/**
 * Sample tracker data for local testing (never run against production):
 * ~6 weeks of daily check-ins, personal trackers with answers, and reminder
 * settings for the "participant" and "both" test accounts. Re-running
 * replaces what it created before.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-tracker.mts
 */
import { eq } from "drizzle-orm";
import { db, pgClient, withTransaction } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { dailyCheckins } from "@/server/db/schema/checkin";
import { checkinReminders, trackerEntries, trackerReminderLogs, trackers } from "@/server/db/schema/tracker";
import { dayKey, DEFAULT_TIMEZONE } from "@/lib/dates";
import { shiftDay } from "@/features/tracker/calendar-math";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

/** Small deterministic PRNG so every run produces the same month. */
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

// Mood weights: mostly bright/steady days with some harder ones.
const MOOD_WEIGHTS = [14, 8, 5, 7, 16, 7, 4, 8, 5, 6, 5, 2];
function pickMood(rand: () => number) {
  const total = MOOD_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let roll = rand() * total;
  for (let index = 0; index < MOOD_WEIGHTS.length; index++) {
    roll -= MOOD_WEIGHTS[index];
    if (roll <= 0) return index + 1;
  }
  return 5;
}

const plans = [
  { username: "participant", seed: 7, includeToday: false },
  { username: "both", seed: 42, includeToday: true },
];

for (const plan of plans) {
  const [user] = await db
    .select({ id: users.id, timezone: users.timezone })
    .from(users)
    .where(eq(users.username, plan.username))
    .limit(1);
  if (!user) {
    console.log(`skip    ${plan.username} (run pnpm seed first)`);
    continue;
  }
  const userId = user.id;
  const timezone = user.timezone || DEFAULT_TIMEZONE;
  const today = dayKey(new Date(), timezone);
  const rand = random(plan.seed);

  // Daily check-ins for the last 42 days, with a solid recent streak.
  const checkins: (typeof dailyCheckins.$inferInsert)[] = [];
  for (let offset = plan.includeToday ? 0 : 1; offset <= 42; offset++) {
    const day = shiftDay(today, -offset);
    const recent = offset <= 6;
    if (!recent && rand() < 0.2) continue; // a few missed days
    const meds = rand() < (recent ? 0.95 : 0.82);
    const mood = rand() < 0.08 ? null : pickMood(rand);
    const answerOnlyMeds = rand() < 0.05;
    checkins.push({ userId, day, meds, mood: answerOnlyMeds ? null : mood });
  }

  // Replace what an earlier run created, all or nothing.
  const entryCount = await withTransaction(async (tx) => {
    await tx.delete(dailyCheckins).where(eq(dailyCheckins.userId, userId));
    await tx.delete(trackerEntries).where(eq(trackerEntries.userId, userId));
    await tx.delete(trackerReminderLogs).where(eq(trackerReminderLogs.userId, userId));
    await tx.delete(trackers).where(eq(trackers.userId, userId));
    await tx.delete(checkinReminders).where(eq(checkinReminders.userId, userId));

    if (checkins.length) await tx.insert(dailyCheckins).values(checkins);

    await tx.insert(checkinReminders).values({
      userId,
      reminder: { enabled: true, channel: "in_app", frequency: "daily", weekday: 1, hour: 20, minute: 0 },
    });

    // Personal trackers.
    const [prep] = await tx
      .insert(trackers)
      .values({
        userId,
        kind: "prep",
        label: "PrEP",
        legacyTermId: 297,
        reminder: { enabled: true, channel: "in_app", frequency: "daily", weekday: 1, hour: 9, minute: 30 },
        createdAt: new Date(Date.now() - 30 * 86_400_000),
      })
      .returning({ id: trackers.id });
    const [walk] = await tx
      .insert(trackers)
      .values({
        userId,
        kind: "custom",
        label: plan.username === "both" ? "Drink 8 glasses of water" : "Go for a walk",
        legacyTermId: 0,
        reminder: { enabled: false, channel: "in_app", frequency: "weekly", weekday: 6, hour: 10, minute: 0 },
        createdAt: new Date(Date.now() - 18 * 86_400_000),
      })
      .returning({ id: trackers.id });

    const entries = [];
    for (let offset = 1; offset <= 30; offset++) {
      if (rand() < 0.85)
        entries.push({ userId, trackerId: prep.id, day: shiftDay(today, -offset), done: rand() < 0.9 });
    }
    for (let offset = 1; offset <= 18; offset++) {
      if (rand() < 0.6)
        entries.push({ userId, trackerId: walk.id, day: shiftDay(today, -offset), done: rand() < 0.65 });
    }
    if (entries.length) await tx.insert(trackerEntries).values(entries);
    return entries.length;
  });

  console.log(`seeded  ${plan.username}: ${checkins.length} check-ins, 2 trackers, ${entryCount} tracker answers`);
}

await pgClient.end();
process.exit(0);
