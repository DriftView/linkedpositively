/**
 * Sample profiles and points for local testing (never run against
 * production): about-me text, avatars, badges, ~6 weeks of point history
 * and level-up notifications for the seeded accounts, plus a few extra
 * community members so the leaderboard has people on it. Re-running
 * replaces what it created before.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-profile.mts
 */
import { and, eq, like } from "drizzle-orm";
import { createAccount } from "@/server/auth/accounts";
import { db, pgClient } from "@/server/db/client";
import { users } from "@/server/db/schema/auth";
import { gamificationStates, pointEntries } from "@/server/db/schema/gamification";
import { profiles, type NewProfile } from "@/server/db/schema/profiles";
import { notifications } from "@/server/db/schema/system";
import { DEFAULT_LEVEL_COPY, levelForPoints } from "@/features/gamification/levels";
import { POINT_RULES, type PointReason } from "@/features/gamification/points";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

async function userIdOf(username: string) {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  return user?.id;
}

const extraMembers = [
  { username: "alex", name: "Alex Rivera" },
  { username: "jamie", name: "Jamie Brooks" },
  { username: "dana", name: "Dana Lee" },
  { username: "kim", name: "Kim Nguyen" },
  { username: "robin", name: "Robin Patel" },
  { username: "shay", name: "Shay Moore" },
];
for (const member of extraMembers) {
  if (await userIdOf(member.username)) continue;
  await createAccount({
    ...member,
    email: `${member.username}@example.test`,
    password: "password123",
    roles: ["participant"],
  });
  console.log(`created ${member.username}`);
}

type Plan = {
  username: string;
  points?: number;
  /** Share of points earned in the last 7 days. */
  recent?: number;
  seed: number;
  profile: Partial<Omit<NewProfile, "id" | "userId">>;
  /** Leave the latest level-up uncelebrated (shows the confetti once). */
  pendingCelebration?: boolean;
};

const plans: Plan[] = [
  {
    username: "participant",
    points: 640,
    recent: 0.2,
    seed: 3,
    profile: {
      aboutMe:
        "Mom of two, plant collector and part-time baker. I joined to learn more about staying on top of my health and to meet people who get it. Always up for swapping recipes!",
      avatarId: "pack-3-05",
      badges: ["mother-grandmother", "foodie", "music-lover"],
      phone: "+15555550142",
    },
  },
  {
    username: "both",
    points: 2140,
    recent: 0.12,
    seed: 11,
    pendingCelebration: true,
    profile: {
      aboutMe: "Writer, walker, tea drinker. Here for the good vibes and the tips.",
      avatarId: "pack-6-03",
      badges: ["book-worm", "self-care-pro", "mental-health-advocate", "lets-chat"],
      colorTheme: "theme-3",
      firstName: "Morgan",
      pronouns: "she/her",
      location: "Birmingham, AL",
    },
  },
  {
    username: "alex",
    points: 980,
    recent: 0.3,
    seed: 21,
    profile: {
      aboutMe: "Coffee first. Then everything else.",
      avatarId: "pack-4-02",
      badges: ["traveller", "fitness-fanatic"],
    },
  },
  {
    username: "jamie",
    points: 455,
    recent: 0.35,
    seed: 22,
    profile: {
      aboutMe: "Dog mom to a very spoiled beagle named Biscuit.",
      avatarId: "pack-2-04",
      badges: ["pet-lover"],
    },
  },
  {
    username: "dana",
    points: 1480,
    recent: 0.15,
    seed: 23,
    profile: {
      aboutMe: "Gospel choir on Sundays, gardening the rest of the week.",
      avatarId: "pack-5-07",
      badges: ["religious", "music-lover", "caregiver"],
    },
  },
  {
    username: "kim",
    points: 215,
    recent: 0.6,
    seed: 24,
    profile: { aboutMe: "New here — say hi!", avatarId: "pack-1-08", badges: [] },
  },
  { username: "robin", points: 330, recent: 0.05, seed: 25, profile: { avatarId: "pack-2-09", badges: ["art-lover"] } },
  {
    username: "shay",
    points: 90,
    recent: 0.8,
    seed: 26,
    profile: { aboutMe: "Learning something new every day.", avatarId: "pack-1-03" },
  },
  {
    username: "coach",
    seed: 31,
    profile: {
      firstName: "Jordan",
      pronouns: "they/them",
      location: "Atlanta, GA",
      aboutMe:
        "Peer navigator for four years. I love helping people find the right clinic, get their questions answered and feel less alone along the way.",
      zoomLink: "https://zoom.us/j/5550100123",
    },
  },
  { username: "pnonly", seed: 32, profile: { firstName: "Taylor", pronouns: "he/him", location: "Jackson, MS" } },
  {
    username: "coordinator",
    seed: 33,
    profile: { aboutMe: "Study coordinator. Reach out any time!", avatarId: "pack-1-11" },
  },
];

function prng(seed: number) {
  let state = seed * 7919;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

const EVENTS: [PointReason, number][] = [
  ["time_on_site", 14],
  ["tracker_checkin", 12],
  ["tip_view", 10],
  ["reaction_given", 8],
  ["post", 5],
  ["comment_on_post", 6],
  ["comment_received", 4],
  ["reaction_earned", 5],
  ["tip_view_recommended", 3],
  ["comment_on_tip", 2],
  ["resource_view", 2],
  ["weekly_checkin", 2],
];
const weightTotal = EVENTS.reduce((sum, [, weight]) => sum + weight, 0);

function pick(random: () => number): PointReason {
  let roll = random() * weightTotal;
  for (const [reason, weight] of EVENTS) {
    roll -= weight;
    if (roll <= 0) return reason;
  }
  return "time_on_site";
}

const DAY = 86_400_000;
const now = Date.now();

for (const plan of plans) {
  const userId = await userIdOf(plan.username);
  if (!userId) {
    console.log(`skip    ${plan.username} (run pnpm seed first)`);
    continue;
  }
  const profile = { ...plan.profile, ...(plan.profile.avatarId ? { photoKey: null } : {}) };
  await db
    .insert(profiles)
    .values({ userId, ...profile })
    .onConflictDoUpdate({ target: profiles.userId, set: profile });

  await db.delete(pointEntries).where(and(eq(pointEntries.userId, userId), like(pointEntries.key, "seed:%")));
  if (plan.points) {
    const random = prng(plan.seed);
    const entries: { userId: string; reason: string; points: number; key: string; at: Date }[] = [];
    const oneTime: [PointReason, number][] = [
      ["community_guidelines", 40],
      ["tracker_create", 38],
      ["tracker_settings", 37],
    ];
    let total = 0;
    for (const [reason, daysAgo] of oneTime) {
      if (total + POINT_RULES[reason] > plan.points) break;
      total += POINT_RULES[reason];
      entries.push({
        userId,
        reason,
        points: POINT_RULES[reason],
        key: `seed:${entries.length}`,
        at: new Date(now - daysAgo * DAY),
      });
    }
    const recentTarget = Math.round(plan.points * (plan.recent ?? 0.2));
    const timeOnSiteDays = new Set<number>();
    while (total < plan.points) {
      const reason = pick(random);
      const points = Math.min(POINT_RULES[reason], plan.points - total);
      const inRecent = plan.points - total <= recentTarget;
      const daysAgo = inRecent ? random() * 5.5 : 7 + random() * 35;
      // Time-on-site is earned at most once a day.
      if (reason === "time_on_site") {
        if (timeOnSiteDays.has(Math.floor(daysAgo))) continue;
        timeOnSiteDays.add(Math.floor(daysAgo));
      }
      const at = new Date(now - daysAgo * DAY - random() * 3_600_000);
      entries.push({ userId, reason, points, key: `seed:${entries.length}`, at });
      total += points;
    }
    await db.insert(pointEntries).values(entries);

    // Level-up notifications, as award() would have sent them.
    const level = levelForPoints(total).level;
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.kind, "level"),
          like(notifications.dedupeKey, "level-%"),
        ),
      );
    for (let reached = 2; reached <= level; reached += 1) {
      await db.insert(notifications).values({
        userId,
        kind: "level",
        text: `Congratulations, you've leveled up to Level ${reached}! ${DEFAULT_LEVEL_COPY[reached].headline}`,
        href: "/levels",
        dedupeKey: `level-${reached}`,
        createdAt: new Date(now - (level - reached + 1) * 4 * DAY),
      });
    }
    const celebratedLevel = plan.pendingCelebration ? level - 1 : level;
    await db
      .insert(gamificationStates)
      .values({ userId, celebratedLevel })
      .onConflictDoUpdate({ target: gamificationStates.userId, set: { celebratedLevel } });
    console.log(
      `seeded  ${plan.username}: ${total} points, level ${level}${plan.pendingCelebration ? " (celebration pending)" : ""}`,
    );
  } else {
    console.log(`seeded  ${plan.username}: profile`);
  }
}

await pgClient.end();
process.exit(0);
