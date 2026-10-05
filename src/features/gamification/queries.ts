import "server-only";
import { startOfWeek } from "date-fns";
import { and, desc, eq, gte, inArray, lt, lte, or, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { gamificationStates, levelCopy, notifications, pointEntries, profiles, users } from "@/server/db/schema";
import { inZone } from "@/lib/dates";
import { effectiveColorTheme, type ColorThemeId } from "./catalog";
import { DEFAULT_LEVEL_COPY, LEVELS, levelForPoints, levelProgress, pointsToNextLevel } from "./levels";
import { isActiveParticipant } from "./participants";
import { pointReasonLabel } from "./point-labels";
import { sumPoints, totalPoints } from "./points";

/** Start of the current week (Sunday 00:00) in the given timezone. */
export function weekStart(timezone: string, now = new Date()) {
  return new Date(startOfWeek(inZone(now, timezone)).getTime());
}

export type LevelSummary = {
  points: number;
  pointsThisWeek: number;
  level: number;
  levelMin: number;
  nextLevelAt: number | null;
  toNext: number | null;
  progress: number;
  maxLevel: boolean;
};

export const getLevelSummary = cache(async (userId: string, timezone: string): Promise<LevelSummary> => {
  const [points, weekRows] = await Promise.all([
    totalPoints(userId),
    db
      .select({ total: sumPoints })
      .from(pointEntries)
      .where(and(eq(pointEntries.userId, userId), gte(pointEntries.at, weekStart(timezone)))),
  ]);
  const info = levelForPoints(points);
  return {
    points,
    pointsThisWeek: weekRows[0]?.total ?? 0,
    level: info.level,
    levelMin: info.min,
    nextLevelAt: info.next,
    toNext: pointsToNextLevel(points),
    progress: levelProgress(points),
    maxLevel: info.next === null,
  };
});

/** Level of any user (public: shown on profile cards). */
export async function levelOf(userId: string) {
  return levelForPoints(await totalPoints(userId)).level;
}

export type PointHistoryItem = { id: string; reason: string; label: string; points: number; at: string };

/** Newest first. `before` is the opaque cursor returned as `nextCursor` ("<iso>_<id>"). */
export async function getPointHistory(
  userId: string,
  { limit = 20, before }: { limit?: number; before?: string } = {},
): Promise<{ items: PointHistoryItem[]; nextCursor: string | null }> {
  const conditions = [eq(pointEntries.userId, userId)];
  const [iso, lastId] = (before ?? "").split("_");
  if (iso && lastId && !Number.isNaN(Date.parse(iso)) && isUuid(lastId)) {
    const at = new Date(iso);
    conditions.push(or(lt(pointEntries.at, at), and(eq(pointEntries.at, at), lt(pointEntries.id, lastId)))!);
  }
  const rows = await db
    .select({ id: pointEntries.id, reason: pointEntries.reason, points: pointEntries.points, at: pointEntries.at })
    .from(pointEntries)
    .where(and(...conditions))
    .orderBy(desc(pointEntries.at), desc(pointEntries.id))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((row) => ({
    id: row.id,
    reason: row.reason,
    label: pointReasonLabel(row.reason),
    points: row.points,
    at: row.at.toISOString(),
  }));
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit && last ? `${last.at}_${last.id}` : null };
}

export type LevelCopyItem = {
  level: number;
  min: number;
  next: number | null;
  headline: string;
  description: string;
  unlocks: string[];
  updatedAt: string | null;
};

/** The six levels with their (staff-editable) copy. */
export const getLevelCopy = cache(async (): Promise<LevelCopyItem[]> => {
  const rows = await db.select().from(levelCopy).where(lte(levelCopy.level, LEVELS.length));
  const byLevel = new Map(rows.map((row) => [row.level, row]));
  return LEVELS.map((info) => {
    const row = byLevel.get(info.level);
    const fallback = DEFAULT_LEVEL_COPY[info.level];
    return {
      level: info.level,
      min: info.min,
      next: info.next,
      headline: row?.headline || fallback.headline,
      description: row?.description || fallback.description,
      unlocks: info.unlocks,
      updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null,
    };
  });
});

// ---------------------------------------------------------------------------
// Leaderboard

export type LeaderboardRow = {
  rank: number;
  userId: string;
  name: string;
  username: string;
  points: number;
  level: number;
  avatarVersion: string | null;
  isViewer: boolean;
};

export async function getLeaderboard(input: {
  period: "week" | "all";
  timezone: string;
  viewerId: string;
  limit?: number;
}): Promise<{ rows: LeaderboardRow[]; viewerRow: LeaderboardRow | null; totalPeople: number }> {
  const since = input.period === "week" ? weekStart(input.timezone) : null;
  // Participants (active, not staff-only) with their all-time and period totals.
  const totals = await db
    .select({
      userId: pointEntries.userId,
      total: sumPoints,
      period: since
        ? sql<number>`coalesce(sum(${pointEntries.points}) filter (where ${pointEntries.at} >= ${since.toISOString()}::timestamptz), 0)::int`
        : sumPoints,
    })
    .from(pointEntries)
    .innerJoin(users, eq(users.id, pointEntries.userId))
    .where(isActiveParticipant)
    .groupBy(pointEntries.userId);

  const scored = totals.filter((row) => row.period > 0);
  if (!scored.length) return { rows: [], viewerRow: null, totalPeople: 0 };

  const people = await db
    .select({
      id: users.id,
      name: users.name,
      username: users.username,
      displayUsername: users.displayUsername,
      avatarVersion: profiles.updatedAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(inArray(users.id, scored.map((row) => row.userId)));
  const byId = new Map(people.map((person) => [person.id, person]));

  const ranked = scored
    .filter((row) => byId.has(row.userId))
    .map((row) => {
      const user = byId.get(row.userId)!;
      return {
        userId: row.userId,
        name: user.name || user.displayUsername || user.username || "Member",
        username: user.username ?? "",
        points: row.period,
        level: levelForPoints(row.total).level,
        avatarVersion: user.avatarVersion ? user.avatarVersion.toISOString() : null,
        isViewer: row.userId === input.viewerId,
      };
    })
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  // Standard competition ranking: 1, 2, 2, 4.
  const rows: LeaderboardRow[] = [];
  ranked.forEach((row, index) => {
    const previous = rows[index - 1];
    const rank = previous && previous.points === row.points ? previous.rank : index + 1;
    rows.push({ ...row, rank });
  });

  const limit = input.limit ?? 50;
  const viewerRow = rows.find((row) => row.isViewer) ?? null;
  return { rows: rows.slice(0, limit), viewerRow, totalPeople: rows.length };
}

// ---------------------------------------------------------------------------
// Colour theme and level-up celebration

/** The colour theme to apply for a user (their choice only counts from level 6). */
export const getColorThemeFor = cache(async (userId: string): Promise<ColorThemeId> => {
  if (!isUuid(userId)) return "theme-1";
  const [profile] = await db
    .select({ colorTheme: profiles.colorTheme })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!profile?.colorTheme || profile.colorTheme === "theme-1") return "theme-1";
  return effectiveColorTheme(profile.colorTheme, levelForPoints(await totalPoints(userId)).level);
});

export type PendingCelebration = { level: number; headline: string };

/**
 * A level-up the user hasn't celebrated yet. Only real level-ups count (a
 * "level" notification exists for the level), so people who reached a level
 * before this feature existed don't get surprise confetti.
 */
export const getPendingCelebration = cache(async (userId: string): Promise<PendingCelebration | null> => {
  if (!isUuid(userId)) return null;
  const [points, [state]] = await Promise.all([
    totalPoints(userId),
    db
      .select({ celebratedLevel: gamificationStates.celebratedLevel })
      .from(gamificationStates)
      .where(eq(gamificationStates.userId, userId))
      .limit(1),
  ]);
  const level = levelForPoints(points).level;
  if (level <= (state?.celebratedLevel ?? 1)) return null;
  const [notification] = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, userId),
        eq(notifications.kind, "level"),
        eq(notifications.dedupeKey, `level-${level}`),
      ),
    )
    .limit(1);
  if (!notification) return null;
  const copy = (await getLevelCopy()).find((item) => item.level === level);
  return { level, headline: copy?.headline ?? "" };
});
