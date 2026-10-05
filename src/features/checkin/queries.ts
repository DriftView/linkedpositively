import "server-only";
import { format } from "date-fns";
import { and, asc, count, desc, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { moodFor } from "@/features/tracker/moods";
import type { Viewer } from "@/server/auth/session";
import { can } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { checkinPrompts, dailyCheckins, profiles, weeklyCheckins, type CheckinPrompt, type WeeklyCheckin } from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";
import { checkinTiming, checkinWeek, promptSequence, type CheckinWeek } from "./schedule";
import type { CheckinAnswer, CheckinDay, CheckinHistoryItem, CheckinPromptData } from "./types";

/**
 * Read side of the weekly check-in. 🔒 Everything here is the viewer's own
 * health data; never call these for someone else.
 */

type StoredDay = { date: string; medsTaken?: boolean | null; mood?: number | null; used?: boolean | null };
type StoredCheckin = WeeklyCheckin;

export type LeanPrompt = CheckinPrompt;

export async function startDateOf(userId: string) {
  const [profile] = await db
    .select({ interventionStartDate: profiles.interventionStartDate })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile?.interventionStartDate ?? null;
}

export async function promptForSequence(sequence: number): Promise<LeanPrompt | null> {
  const [prompt] = await db.select().from(checkinPrompts).where(eq(checkinPrompts.sequence, sequence)).limit(1);
  return prompt ?? null;
}

export function promptData(prompt: LeanPrompt): CheckinPromptData {
  return {
    sequence: prompt.sequence,
    title: prompt.title,
    likertText: prompt.likertText,
    options: [...(prompt.likertOptions ?? [])].sort((a, b) => a.value - b.value),
    openText: prompt.openText,
    openPlaceholder: prompt.openPlaceholder ?? "",
  };
}

/**
 * The week's 7 days from the daily tracker check-ins (meds + mood), with the
 * "used?" answers already given (if any).
 */
export async function weekDays(userId: string, week: CheckinWeek, stored?: StoredDay[] | null): Promise<CheckinDay[]> {
  const daily = await db
    .select({ day: dailyCheckins.day, meds: dailyCheckins.meds, mood: dailyCheckins.mood })
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, userId), inArray(dailyCheckins.day, week.dates)));
  const byDay = new Map(daily.map((d) => [d.day, d]));
  const storedByDay = new Map((stored ?? []).map((d) => [d.date, d]));
  return week.dates.map((date) => {
    const entry = byDay.get(date);
    const saved = storedByDay.get(date);
    // Live tracker data wins; fall back to the stored snapshot (e.g. migrated weeks).
    const medsTaken = entry?.meds ?? saved?.medsTaken ?? null;
    const mood = moodFor(entry?.mood ?? saved?.mood ?? null);
    const noon = new Date(`${date}T12:00:00Z`);
    return {
      date,
      weekday: format(noon, "EEEE"),
      label: format(noon, "MMM d"),
      medsTaken: typeof medsTaken === "boolean" ? medsTaken : null,
      mood: mood ? { value: mood.value, label: mood.label, src: mood.src } : null,
      used: typeof saved?.used === "boolean" ? saved.used : null,
    };
  });
}

async function storedCheckin(userId: string, week: number): Promise<StoredCheckin | null> {
  const [doc] = await db
    .select()
    .from(weeklyCheckins)
    .where(and(eq(weeklyCheckins.userId, userId), eq(weeklyCheckins.week, week)))
    .limit(1);
  return doc ?? null;
}

function answerOf(doc: StoredCheckin | null): CheckinAnswer | null {
  if (!doc) return null;
  return {
    likertValue: doc.likertValue ?? null,
    openAnswer: doc.openAnswer ?? "",
    submittedAt: doc.submittedAt?.toISOString() ?? null,
    autoSubmitted: Boolean(doc.autoSubmitted),
    feedback: doc.likertValue ? { long: doc.feedbackLong ?? "", short: doc.feedbackShort ?? "" } : null,
  };
}

export type CheckinOverview =
  | { state: "not-started" | "first-week"; nextOpensAt: string | null; historyCount: number; canAnswer: boolean }
  | {
      state: "due" | "done";
      week: { week: number; start: string; end: string; closesAt: string };
      nextOpensAt: string | null;
      days: CheckinDay[];
      prompt: CheckinPromptData | null;
      answer: CheckinAnswer | null;
      historyCount: number;
      canAnswer: boolean;
    };

/** Everything the /check-in page needs. */
export async function checkinOverview(viewer: Viewer): Promise<CheckinOverview> {
  const start = await startDateOf(viewer.id);
  const now = new Date();
  const timing = checkinTiming(start, now, viewer.timezone);
  const canAnswer = can(viewer, "checkin.weekly");
  if (!start || !timing.started || timing.openWeek == null) {
    return {
      state: (start && timing.started ? "first-week" : "not-started") as "first-week" | "not-started",
      nextOpensAt: timing.nextOpensAt?.toISOString() ?? null,
      historyCount: 0,
      canAnswer,
    };
  }

  const week = checkinWeek(start, timing.openWeek, viewer.timezone);
  const [doc, prompt, historyCount] = await Promise.all([
    storedCheckin(viewer.id, week.week),
    promptForSequence(promptSequence(week.week)),
    db
      .select({ count: count() })
      .from(weeklyCheckins)
      .where(and(eq(weeklyCheckins.userId, viewer.id), lt(weeklyCheckins.week, week.week)))
      .then(([row]) => row?.count ?? 0),
  ]);
  const days = await weekDays(viewer.id, week, doc?.days);
  const answer = answerOf(doc);
  return {
    state: (answer?.submittedAt && !answer.autoSubmitted ? "done" : "due") as "done" | "due",
    week: { week: week.week, start: week.start, end: week.end, closesAt: week.closesAt.toISOString() },
    nextOpensAt: timing.nextOpensAt?.toISOString() ?? null,
    days,
    prompt: prompt ? promptData(prompt) : null,
    answer,
    historyCount,
    canAnswer,
  };
}

/** Past weeks, newest first; weeks without a record count as missed. */
export async function checkinHistory(viewer: Viewer): Promise<CheckinHistoryItem[]> {
  const start = await startDateOf(viewer.id);
  const timing = checkinTiming(start, new Date(), viewer.timezone);
  if (!start || timing.openWeek == null) return [];
  const docs = await db
    .select()
    .from(weeklyCheckins)
    .where(eq(weeklyCheckins.userId, viewer.id))
    .orderBy(desc(weeklyCheckins.week));
  const byWeek = new Map(docs.map((d) => [d.week, d]));
  const items: CheckinHistoryItem[] = [];
  for (let w = timing.openWeek; w >= 1; w--) {
    const doc = byWeek.get(w);
    const info = checkinWeek(start, w, viewer.timezone);
    const answered = Boolean(doc?.submittedAt && !doc.autoSubmitted && doc.likertValue);
    const meds = (doc?.days ?? []).map((d) => d.medsTaken);
    items.push({
      week: w,
      start: info.start,
      end: info.end,
      status: answered ? "answered" : w === timing.openWeek ? "open" : "missed",
      likertLabel: doc?.likertLabel ?? null,
      medsTaken: meds.filter((m) => m === true).length,
      medsAnswered: meds.filter((m) => typeof m === "boolean").length,
    });
  }
  // Migrated weeks beyond today's count (e.g. a changed start date) are still shown.
  for (const doc of docs) {
    if (doc.week > timing.openWeek) {
      items.unshift({
        week: doc.week,
        start: doc.weekStart,
        end: doc.weekEnd,
        status: doc.likertValue ? "answered" : "missed",
        likertLabel: doc.likertLabel ?? null,
        medsTaken: (doc.days ?? []).filter((d) => d.medsTaken === true).length,
        medsAnswered: (doc.days ?? []).filter((d) => typeof d.medsTaken === "boolean").length,
      });
    }
  }
  return items;
}

/** One past (or the open) week: the day table, the answers and the feedback. */
export async function checkinWeekDetail(viewer: Viewer, weekNumber: number) {
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 520) return null;
  const start = await startDateOf(viewer.id);
  if (!start) return null;
  const timing = checkinTiming(start, new Date(), viewer.timezone);
  const doc = await storedCheckin(viewer.id, weekNumber);
  if (!doc && (timing.openWeek == null || weekNumber > timing.openWeek)) return null;
  const info = checkinWeek(start, weekNumber, viewer.timezone);
  const week = doc ? { ...info, start: doc.weekStart, end: doc.weekEnd } : info;
  const days = await weekDays(viewer.id, doc ? { ...info, dates: doc.days?.length ? doc.days.map((d) => d.date) : info.dates } : info, doc?.days);
  return {
    week: weekNumber,
    start: week.start,
    end: week.end,
    isOpen: weekNumber === timing.openWeek,
    days,
    likertText: doc?.likertText ?? null,
    likertLabel: doc?.likertLabel ?? null,
    openText: doc?.openText ?? null,
    answer: answerOf(doc),
  };
}

/** For the home page card: the open check-in, if the viewer hasn't answered it. */
export async function weeklyCheckinDue(viewer: Viewer) {
  if (!can(viewer, "checkin.weekly")) return null;
  const start = await startDateOf(viewer.id);
  const timing = checkinTiming(start, new Date(), viewer.timezone);
  if (!start || timing.openWeek == null) return null;
  const [answered] = await db
    .select({ id: weeklyCheckins.id })
    .from(weeklyCheckins)
    .where(
      and(
        eq(weeklyCheckins.userId, viewer.id),
        eq(weeklyCheckins.week, timing.openWeek),
        isNotNull(weeklyCheckins.likertValue),
        sql`${weeklyCheckins.autoSubmitted} is not true`,
      ),
    )
    .limit(1);
  if (answered) return null;
  const week = checkinWeek(start, timing.openWeek, viewer.timezone);
  return { week: week.week, closesAt: week.closesAt.toISOString() };
}

/** Staff list of the 10 prompt slots. */
export async function promptSlots() {
  const prompts = await db.select().from(checkinPrompts).orderBy(asc(checkinPrompts.sequence));
  const bySequence = new Map(prompts.map((p) => [p.sequence, p]));
  return Array.from({ length: 10 }, (_, i) => {
    const p = bySequence.get(i + 1);
    return p
      ? {
          sequence: i + 1,
          id: p.id,
          title: p.title,
          likertText: p.likertText,
          openText: p.openText,
          options: (p.likertOptions ?? []).length,
          feedbackComplete: Boolean(toPlainText(p.feedbackLow ?? "") && toPlainText(p.feedbackMedium ?? "") && toPlainText(p.feedbackHigh ?? "")),
          updatedAt: p.updatedAt.toISOString(),
        }
      : { sequence: i + 1, id: null, title: null, likertText: null, openText: null, options: 0, feedbackComplete: false, updatedAt: null };
  });
}

/** Form values for a prompt slot (defaults for an empty slot). */
export async function promptForEdit(sequence: number) {
  const prompt = await promptForSequence(sequence);
  const options = [...(prompt?.likertOptions ?? [])].sort((a, b) => a.value - b.value);
  return {
    exists: Boolean(prompt),
    values: {
      sequence,
      title: prompt?.title ?? `Week ${sequence}`,
      likertText: prompt?.likertText ?? "",
      likertOptions: Array.from({ length: 5 }, (_, i) => ({ value: i + 1, label: options.find((o) => o.value === i + 1)?.label ?? "" })),
      openText: prompt?.openText ?? "",
      openPlaceholder: prompt?.openPlaceholder ?? "",
      feedbackLow: prompt?.feedbackLow ?? "",
      feedbackMedium: prompt?.feedbackMedium ?? "",
      feedbackHigh: prompt?.feedbackHigh ?? "",
      moreAdherentFeedback: prompt?.moreAdherentFeedback ?? "",
      lessAdherentFeedback: prompt?.lessAdherentFeedback ?? "",
    },
  };
}
