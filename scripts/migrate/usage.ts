import { loginSessions, usageEvents } from "@/server/db/schema";
import { q, tableExists, type Ctx } from "./lib/context";
import { ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Study usage data: LP login sessions (youthrive_reports), PN login sessions
 * (ecoach_usage_session, empty) and engagement counters (ts_user_stats,
 * profile_features_update). The old counters are one row per user and type
 * with a running `count`; the new usage_events table has one row per event and
 * no count column, so each counter becomes ONE event carrying meta.count
 * (reports that count rows undercount these; see the migration report).
 */
const STAT_TYPE: Record<string, string> = {
  "profile-edits": "profile_edit",
  profile_avatar: "profile_avatar",
  resource_views: "resource_view",
  tpv: "tracker_view",
};

export async function migrateUsage(ctx: Ctx) {
  const map = await userMap(ctx);

  for (const [pool, table, program, siteMap, site] of [
    [ctx.lp, "youthrive_reports", "lp", map.lp, "lp"],
    [ctx.pn, "ecoach_usage_session", "peernav", map.pn, "peernav"],
  ] as const) {
    if (!(await tableExists(pool, table))) continue;
    const rows = await q<{ id: number; uid: string; login_date: number | null; logout_date: number | null; device_used: string | null }>(
      pool,
      `select id, uid, login_date, logout_date, device_used from ${table} order by id`,
    );
    const name = `login_sessions (${table})`;
    ctx.stats.source(name, rows.length);
    const out = [];
    for (const row of rows) {
      const userId = siteMap.get(Number(row.uid));
      if (!userId) {
        ctx.stats.skip(name, "user not migrated (deleted account)");
        continue;
      }
      const loginAt = ts(row.login_date);
      if (!loginAt) {
        ctx.stats.skip(name, "no login time");
        continue;
      }
      out.push({
        userId,
        loginAt,
        logoutAt: ts(row.logout_date),
        userAgent: (row.device_used ?? "").slice(0, 1000),
        program,
        ...legacy(site, table, row.id),
      });
    }
    await upsertRows(ctx, name, loginSessions, out);
  }

  const stats = await q<{ id: number; uid: number; type: string; count: number; created: number }>(
    ctx.lp,
    "select id, uid, type, count, created from ts_user_stats order by id",
  );
  ctx.stats.source("usage_events (ts_user_stats)", stats.length);
  const events = [];
  for (const row of stats) {
    const userId = map.lp.get(Number(row.uid));
    const type = STAT_TYPE[row.type];
    if (!userId) {
      ctx.stats.skip("usage_events (ts_user_stats)", "user not migrated (deleted account)");
      continue;
    }
    if (!type) {
      ctx.stats.skip("usage_events (ts_user_stats)", `unknown type ${row.type}`);
      continue;
    }
    events.push({ userId, type, meta: { count: Number(row.count) || 0, legacyCounter: true }, at: ts(row.created) ?? new Date(0), ...legacy("lp", "ts_user_stats", row.id) });
  }
  await upsertRows(ctx, "usage_events (ts_user_stats)", usageEvents, events);

  const profileUpdates = await q<{ id: number; uid: string; count: number; created: number }>(
    ctx.lp,
    "select id, uid, count, created from profile_features_update order by id",
  );
  ctx.stats.source("usage_events (profile_features_update)", profileUpdates.length);
  const updates = [];
  for (const row of profileUpdates) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("usage_events (profile_features_update)", "user not migrated (deleted account)");
      continue;
    }
    updates.push({
      userId,
      type: "profile_edit",
      meta: { count: Number(row.count) || 0, legacyCounter: true, source: "profile_features_update" },
      at: ts(row.created) ?? new Date(0),
      ...legacy("lp", "profile_features_update", row.id),
    });
  }
  await upsertRows(ctx, "usage_events (profile_features_update)", usageEvents, updates);
}
