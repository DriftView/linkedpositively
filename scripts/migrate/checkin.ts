import { addDays, format } from "date-fns";
import { checkinPrompts, dailyCheckins, weeklyCheckins, type LikertOption, type WeeklyCheckinDay } from "@/server/db/schema";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";
import { nodes } from "./content";
import { q, type Ctx } from "./lib/context";
import { dayOf, fv, int, loadFields, str, ts } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { tzOf, userMap } from "./lib/user-map";

/**
 * Weekly check-in prompts (node weekly_checkin_prompt), weekly check-ins
 * (node weekly_checkins + table weekly_checkin_feedback, folded into `days`)
 * and the daily "Main tracker" check-in (reminder_checkin).
 */
export async function migrateCheckin(ctx: Ctx) {
  await migratePrompts(ctx);
  await migrateWeekly(ctx);
  await migrateDaily(ctx);
}

function parseOptions(value: string | null): LikertOption[] {
  if (!value) return [];
  const out: LikertOption[] = [];
  for (const part of value.split(",")) {
    const match = /^\s*(\d+)\s*\|(.*)$/.exec(part);
    if (!match) {
      // A label containing a comma: append to the previous option.
      if (out.length) out[out.length - 1].label += `,${part}`;
      continue;
    }
    out.push({ value: Number(match[1]), label: match[2].trim() });
  }
  return out.map((o) => ({ value: o.value, label: o.label.trim() })).filter((o) => o.value >= 1 && o.value <= 5);
}

async function migratePrompts(ctx: Ctx) {
  const rows = await nodes(ctx, ctx.lp, ["weekly_checkin_prompt"]);
  ctx.stats.source("checkin_prompts", rows.length);
  const fields = await loadFields(ctx.lp, "node", ["weekly_checkin_prompt"], [
    "field_sequence_prompt_number_",
    "field_prompt_text",
    "field_prompt_options",
    "field_open_ended_prompt_text",
    "field_open_ended_prompt_instruct",
    "field_feedback_high_long",
    "field_feedback_medium_long",
    "field_feedback_low_long",
    "field_medication_taking_feedback",
    "field_less_adherent_feedback",
    "field_more_adherent_feedback",
  ]);
  const html = (id: number, field: string) => sanitizeStaffHtml(str(fv(fields, id, field)) ?? "");
  const plain = (id: number, field: string) => toPlainText(str(fv(fields, id, field)) ?? "");
  const out = [];
  const seen = new Set<number>();
  for (const node of rows) {
    const sequence = int(fv(fields, node.nid, "field_sequence_prompt_number_"));
    if (!sequence || sequence < 1 || sequence > 10) {
      ctx.stats.skip("checkin_prompts", "sequence missing or outside 1–10");
      continue;
    }
    if (seen.has(sequence)) {
      ctx.stats.skip("checkin_prompts", "second prompt for the same sequence");
      continue;
    }
    seen.add(sequence);
    out.push({
      sequence,
      title: node.title.trim() || `Week ${sequence}`,
      likertText: plain(node.nid, "field_prompt_text"),
      likertOptions: parseOptions(str(fv(fields, node.nid, "field_prompt_options"))),
      openText: plain(node.nid, "field_open_ended_prompt_text"),
      openPlaceholder: plain(node.nid, "field_open_ended_prompt_instruct"),
      feedbackLow: html(node.nid, "field_feedback_low_long"),
      feedbackMedium: html(node.nid, "field_feedback_medium_long"),
      feedbackHigh: html(node.nid, "field_feedback_high_long"),
      moreAdherentFeedback: html(node.nid, "field_more_adherent_feedback"),
      lessAdherentFeedback: html(node.nid, "field_less_adherent_feedback"),
      medicationFeedback: html(node.nid, "field_medication_taking_feedback"),
      ...legacy("lp", "node", node.nid),
      createdAt: ts(node.created) ?? new Date(0),
      updatedAt: ts(node.changed) ?? new Date(0),
    });
  }
  // The real prompt wording replaces the seeded SAMPLE prompts (same sequence).
  await upsertRows(ctx, "checkin_prompts", checkinPrompts, out, { target: [checkinPrompts.sequence] });
}

// ---------------------------------------------------------------------------

/** Old weekly-feedback mood images → daily-tracker mood codes (features/tracker/moods.ts). */
const MOOD_IMAGE: Record<string, number> = {
  happy: 1,
  suprised: 2,
  surprised: 2,
  fine: 5,
  meh: 6,
  anxious: 8,
  sad: 10,
  frustrated: 11,
};

async function migrateWeekly(ctx: Ctx) {
  const map = await userMap(ctx);
  const feedback = await q<{
    id: number;
    user_id: number;
    week_days: string;
    meds: string | null;
    moods: string | null;
    used: string | null;
    reminder_id: string | null;
    week_count: string | null;
    date: string | null;
  }>(ctx.lp, "select id, user_id, week_days, meds, moods, used, reminder_id, week_count, date from weekly_checkin_feedback order by id");
  ctx.stats.source("weekly_checkins (weekly_checkin_feedback rows)", feedback.length);
  const answerNodes = await nodes(ctx, ctx.lp, ["weekly_checkins"]);
  ctx.stats.source("weekly_checkins (weekly_checkins nodes)", answerNodes.length);
  const fields = await loadFields(ctx.lp, "node", ["weekly_checkins"], [
    "field_likert_prompt_value",
    "field_open_ended_prompt_value",
    "field_feedback_long",
    "field_feedback_short",
    "field_user_id",
  ]);

  const groups = new Map<string, typeof feedback>();
  for (const row of feedback) {
    const userId = map.lp.get(Number(row.user_id));
    if (!userId) {
      ctx.stats.skip("weekly_checkins (weekly_checkin_feedback rows)", "user not migrated (deleted account)");
      continue;
    }
    const week = Number(/(\d+)/.exec(row.week_count ?? "")?.[1]);
    if (!Number.isFinite(week) || week < 1) {
      ctx.stats.skip("weekly_checkins (weekly_checkin_feedback rows)", "week 0 / no week number");
      continue;
    }
    const key = `${userId}:${week}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
  }
  const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const out = [];
  for (const [key, rows] of groups) {
    const [userId, weekText] = key.split(":");
    const week = Number(weekText);
    // Rows were written when the week was reviewed: the reviewed week is the calendar week (Sun–Sat) before `date`.
    const written = new Date(`${(rows[0].date ?? "").slice(0, 10)}T12:00:00Z`);
    const lastSaturday = addDays(written, -((written.getUTCDay() + 1) % 7 || 7));
    const weekStart = addDays(lastSaturday, -6);
    const days: WeeklyCheckinDay[] = WEEKDAY.map((name, index) => {
      const row = [...rows].reverse().find((r) => r.week_days === name);
      const meds = row?.meds ?? "";
      const moodImage = /files\/([a-z]+)\./i.exec(row?.moods ?? "")?.[1]?.toLowerCase();
      return {
        date: format(addDays(weekStart, index), "yyyy-MM-dd"),
        medsTaken: /checkedcircle/.test(meds) ? true : /no-skip"><div class="circle"/.test(meds) ? false : null,
        mood: moodImage ? (MOOD_IMAGE[moodImage] ?? null) : null,
        used: row?.used === "1" ? true : row?.used === "0" ? false : null,
      };
    });
    out.push({
      userId,
      week,
      weekStart: format(weekStart, "yyyy-MM-dd"),
      weekEnd: format(addDays(weekStart, 6), "yyyy-MM-dd"),
      days,
      submittedAt: ts(Date.parse(written.toISOString()) / 1000),
      ...legacy("lp", "weekly_checkin_feedback", rows[0].id),
    });
  }
  for (const node of answerNodes) {
    if (!map.lp.get(int(fv(fields, node.nid, "field_user_id")) ?? node.uid)) {
      ctx.stats.skip("weekly_checkins (weekly_checkins nodes)", "user not migrated (deleted account)");
    } else {
      ctx.stats.note("weekly_checkins (weekly_checkins nodes)", `node ${node.nid}: answers not merged (no live nodes expected)`);
    }
  }
  await upsertRows(ctx, "weekly_checkins", weeklyCheckins, out, { target: [weeklyCheckins.userId, weeklyCheckins.week] });
}

// ---------------------------------------------------------------------------

async function migrateDaily(ctx: Ctx) {
  const map = await userMap(ctx);
  const rows = await q<{ id: number; uid: number; meds: number | null; moods: number | null; checkin: number | null; created: number }>(
    ctx.lp,
    "select id, uid, meds, moods, checkin, created from reminder_checkin order by id desc",
  );
  ctx.stats.source("daily_checkins", rows.length);
  const byDay = new Map<string, Record<string, unknown> & { extra: Record<string, unknown> }>();
  for (const row of rows) {
    const userId = map.lp.get(Number(row.uid));
    if (!userId) {
      ctx.stats.skip("daily_checkins", "user not migrated (deleted account)");
      continue;
    }
    // `created` is local midnight of the answered day (Drupal ran in the user's timezone).
    const day = dayOf(row.created, tzOf(map, userId));
    if (!day) {
      ctx.stats.skip("daily_checkins", "no date");
      continue;
    }
    const meds = row.meds === null ? null : Number(row.meds) === 1;
    const mood = row.moods !== null && Number(row.moods) >= 1 && Number(row.moods) <= 12 ? Number(row.moods) : null;
    const key = `${userId}:${day}`;
    const existing = byDay.get(key);
    if (existing) {
      // Rows are newest first: fill only what the newer row left unanswered.
      if (existing.meds === null && meds !== null) existing.meds = meds;
      if (existing.mood === null && mood !== null) existing.mood = mood;
      (existing.extra.mergedIds as number[]).push(Number(row.id));
      ctx.stats.skip("daily_checkins", "second row for the same user and day (merged)");
      continue;
    }
    const extra: Record<string, unknown> = { mergedIds: [] as number[] };
    if (row.checkin !== null) extra.checkin = row.checkin;
    if (row.moods !== null && mood === null) extra.legacyMood = row.moods;
    byDay.set(key, {
      userId,
      day,
      meds,
      mood,
      extra,
      ...legacy("lp", "reminder_checkin", row.id),
      createdAt: ts(row.created) ?? new Date(0),
      updatedAt: ts(row.created) ?? new Date(0),
    });
  }
  const out = [...byDay.values()].map((row) => {
    if (!(row.extra.mergedIds as number[]).length) delete row.extra.mergedIds;
    return { ...row, extra: Object.keys(row.extra).length ? row.extra : null };
  });
  await upsertRows(ctx, "daily_checkins", dailyCheckins, out, { target: [dailyCheckins.userId, dailyCheckins.day] });
}
