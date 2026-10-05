import { isNotNull, sql } from "drizzle-orm";
import { levelForPoints } from "@/features/gamification/levels";
import { gamificationStates, pointEntries } from "@/server/db/schema";
import { q, type Ctx } from "./lib/context";
import { ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Points: `achievement_stats` is the old site's ledger (one row per
 * achievement, user and server-local day, points summed into it). Each row
 * becomes one point entry with the legacy achievement id as `reason`
 * (point-labels.ts has wording for them), so totals and levels match.
 * achievement_storage (per-user "already awarded" counters), achievement_totals
 * and achievement_unlocks (dead contrib layer) are not ledgers and are not migrated.
 * Gamification state: celebratedLevel = current level, so nobody gets a
 * level-up celebration for levels reached on the old site.
 */
export async function migrateGamification(ctx: Ctx) {
  const map = await userMap(ctx);
  const rows = await q<{ id: number; achievement_id: string; uid: number; points: number; date: number }>(
    ctx.lp,
    "select id, achievement_id, uid, points, date from achievement_stats order by id",
  );
  ctx.stats.source("point_entries", rows.length);
  const out = [];
  for (const row of rows) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("point_entries", "user not migrated (deleted account)");
      continue;
    }
    out.push({
      userId,
      reason: row.achievement_id,
      points: Number(row.points) || 0,
      key: null,
      at: ts(row.date) ?? new Date(0),
      ...legacy("lp", "achievement_stats", row.id),
    });
  }
  await upsertRows(ctx, "point_entries", pointEntries, out);

  if (ctx.opts.dryRun) return;
  const totals = await ctx.db
    .select({ userId: pointEntries.userId, total: sql<number>`coalesce(sum(${pointEntries.points}), 0)::int` })
    .from(pointEntries)
    .where(isNotNull(pointEntries.legacyId))
    .groupBy(pointEntries.userId);
  const states = totals.map((t) => ({ userId: t.userId, celebratedLevel: levelForPoints(Number(t.total)).level }));
  ctx.stats.source("gamification_states", states.length);
  // Only ever raise celebratedLevel (a level celebrated in the new app stays celebrated).
  await upsertRows(ctx, "gamification_states", gamificationStates, states, {
    target: [gamificationStates.userId],
    update: [],
    insertOnly: true,
  });
  await ctx.db.execute(sql`
    update ${gamificationStates} g set celebrated_level = s.level
    from (values ${sql.join(
      states.length ? states.map((s) => sql`(${s.userId}::uuid, ${s.celebratedLevel}::int)`) : [sql`(null::uuid, 0)`],
      sql`, `,
    )}) as s(user_id, level)
    where g.user_id = s.user_id and g.celebrated_level < s.level`);
}
