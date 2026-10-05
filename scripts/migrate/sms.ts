import { and, eq, isNotNull } from "drizzle-orm";
import { smsClicks, smsSends } from "@/server/db/schema";
import { q, type Ctx } from "./lib/context";
import { localDateTime, str, ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { tzOf, userMap } from "./lib/user-map";

/**
 * Weekly SMS program history: sent messages (uy_sms_reminder_stats, sent rows
 * only, `sms_created_date` in the participant's local time) and link clicks
 * (sms_engagement_messages, first click per week). Imported rows use cycle
 * "legacy". Message texts were PHP constants (seeded as sms_templates by the app);
 * the unused reminder_messages / reminder_sms_inputs nodes are not migrated.
 * record_shorten (TinyURL log) is operational and not migrated.
 */

function weekOf(flag: string) {
  const match = /^WEEK-(\d+)/.exec(flag);
  return match ? Number(match[1]) : 0;
}

export async function migrateSms(ctx: Ctx) {
  const map = await userMap(ctx);
  const sends = await q<{ id: number; uid: number; message_sid: string; sms_to: string; sms_from: string; sms_created_date: string | null; sms_flag: string | null }>(
    ctx.lp,
    "select id, uid, message_sid, sms_to, sms_from, sms_created_date, sms_flag from uy_sms_reminder_stats order by id",
  );
  ctx.stats.source("sms_sends", sends.length);
  const seen = new Set<string>();
  const out = [];
  for (const row of sends) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("sms_sends", "user not migrated (deleted account)");
      continue;
    }
    const flag = str(row.sms_flag) ?? "UNKNOWN";
    const key = `${userId}:${flag}`;
    if (seen.has(key)) {
      ctx.stats.skip("sms_sends", "second send of the same flag to the same user (kept the first)");
      continue;
    }
    seen.add(key);
    const timezone = tzOf(map, userId);
    const at = localDateTime(row.sms_created_date, timezone) ?? new Date(0);
    out.push({
      userId,
      flag,
      week: weekOf(flag),
      cycle: "legacy",
      scheduledFor: at,
      timezone,
      status: "sent" as const,
      to: str(row.sms_to),
      from: str(row.sms_from),
      messageSid: str(row.message_sid),
      attempts: 1,
      sentAt: at,
      ...legacy("lp", "uy_sms_reminder_stats", row.id),
      createdAt: at,
      updatedAt: at,
    });
  }
  await upsertRows(ctx, "sms_sends", smsSends, out, { target: [smsSends.userId, smsSends.flag, smsSends.cycle] });

  const clicks = await q<{ id: number; uid: number; week: string; clicked: string; link_clicked_date: number }>(
    ctx.lp,
    "select id, uid, week, clicked, link_clicked_date from sms_engagement_messages order by id",
  );
  ctx.stats.source("sms_clicks", clicks.length);
  const clickRows = [];
  const seenClicks = new Set<string>();
  for (const row of clicks) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("sms_clicks", "user not migrated (deleted account)");
      continue;
    }
    const flag = String(row.week ?? "").trim().replace(/^WEEK-19 4$/, "WEEK-19+FOUR");
    if (seenClicks.has(`${userId}:${flag}`)) {
      ctx.stats.skip("sms_clicks", "duplicate click row");
      continue;
    }
    seenClicks.add(`${userId}:${flag}`);
    const at = ts(row.link_clicked_date) ?? new Date(0);
    const [send] = ctx.opts.dryRun
      ? []
      : await ctx.db
          .select({ id: smsSends.id })
          .from(smsSends)
          .where(and(eq(smsSends.userId, userId), eq(smsSends.flag, flag), eq(smsSends.cycle, "legacy"), isNotNull(smsSends.legacyId)))
          .limit(1);
    clickRows.push({
      userId,
      sendId: send?.id ?? null,
      flag,
      week: weekOf(flag),
      cycle: "legacy",
      firstClickAt: at,
      lastClickAt: at,
      count: 1,
      ...legacy("lp", "sms_engagement_messages", row.id),
    });
  }
  await upsertRows(ctx, "sms_clicks", smsClicks, clickRows, { target: [smsClicks.userId, smsClicks.flag, smsClicks.cycle] });
}
