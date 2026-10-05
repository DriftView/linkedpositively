import "server-only";
import { addDays, format, parseISO } from "date-fns";
import { and, desc, eq, isNotNull, max } from "drizzle-orm";
import { db } from "@/server/db/client";
import { dailyCheckins, trackerEntries, trackers as trackersTable } from "@/server/db/schema";
import { MOODS } from "@/features/tracker/moods";
import { dayKey } from "@/lib/dates";
import { formatNumber, legacyDateTime, legacyDotDate, percent, studyDayOf, studyWeekOfDay } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { eventCountReport } from "./shared";
import { countAll, countWhere, inDays, inIds } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";

export async function trackerViewsReport(meta: ReportMeta, filters: ReportFilters) {
  const population = await studyPopulation(filters);
  return eventCountReport({
    meta,
    filters,
    population,
    type: "tracker_view",
    noun: "views",
    chartTitle: "Tracker page views per week",
    notes: [
      "Counts every time a participant opened the daily tracker, their personal trackers or one tracker's history.",
    ],
  });
}

/**
 * Standard User Tracked Items Report (legacy ts_tracking + ts_tracking_data):
 * each personal tracker with its start, last check-in and number of check-ins.
 */
export async function trackedItemsReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  // Check-in stats per tracker (inside the day range), joined onto every tracker of the people in scope.
  const stats = db
    .select({
      trackerId: trackerEntries.trackerId,
      n: countAll().as("n"),
      done: countWhere(eq(trackerEntries.done, true)).as("done"),
      last: max(trackerEntries.createdAt).as("last"),
    })
    .from(trackerEntries)
    .where(and(inIds(trackerEntries.userId, population.ids), inDays(trackerEntries.day, filters)))
    .groupBy(trackerEntries.trackerId)
    .as("stats");
  const dated = Boolean(filters.from || filters.to);
  const trackers = await db
    .select({
      id: trackersTable.id,
      userId: trackersTable.userId,
      label: trackersTable.label,
      kind: trackersTable.kind,
      createdAt: trackersTable.createdAt,
      deletedAt: trackersTable.deletedAt,
      n: stats.n,
      done: stats.done,
      last: stats.last,
    })
    .from(trackersTable)
    .leftJoin(stats, eq(stats.trackerId, trackersTable.id))
    // With a date range, only trackers checked in during it.
    .where(and(inIds(trackersTable.userId, population.ids), dated ? isNotNull(stats.trackerId) : undefined))
    .orderBy(desc(trackersTable.createdAt), desc(trackersTable.id));

  const rows = trackers.map((tracker) => {
    const person = population.byId.get(tracker.userId)!;
    const n = tracker.n ?? 0;
    return {
      id: tracker.id,
      sid: person.sid,
      item: tracker.label,
      kind: tracker.kind === "custom" ? "Own words" : "Preset",
      start: tracker.createdAt.toISOString(),
      end: tracker.last ? new Date(tracker.last).toISOString() : null,
      checkins: n,
      yes: n ? percent(tracker.done ?? 0, n) : "—",
      state: tracker.deletedAt ? "Deleted" : "Active",
    };
  });

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "item", label: "Tracked item", kind: "text", hint: "Tracker item description" },
        { id: "kind", label: "Type", kind: "text" },
        { id: "start", label: "Started", kind: "date", hint: "Tracking start date" },
        { id: "end", label: "Last check-in", kind: "date", hint: "Tracking end date" },
        { id: "checkins", label: "Check-ins", kind: "heat", hint: "Number of check-ins" },
        { id: "yes", label: "Answered yes", kind: "text" },
        { id: "state", label: "Tracker", kind: "text" },
      ],
      rows,
      tiles: [
        { label: "Trackers", value: formatNumber(rows.length) },
        { label: "Participants tracking", value: formatNumber(new Set(rows.map((r) => r.sid)).size) },
        { label: "Check-ins", value: formatNumber(rows.reduce((s, r) => s + r.checkins, 0)) },
        { label: "Never checked in", value: formatNumber(rows.filter((r) => r.checkins === 0).length) },
      ],
      searchKeys: ["sid", "item"],
      initialSort: { id: "start", desc: true },
      notes: [
        "Personal trackers (not the daily meds and mood check-in, which has its own report). Deleted trackers stay listed so their check-ins still count.",
        "End date is the most recent check-in; the old report picked an arbitrary one. Trackers without check-ins are listed too, with no end date (with a date range, only trackers checked in during it).",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        [
          "Participant SID",
          "Tracker item description",
          "Tracking start date",
          "Tracking end date",
          "Number of check-ins",
        ],
        ...rows.map((r) => [r.sid, r.item, legacyDateTime(r.start), legacyDateTime(r.end), r.checkins]),
      ],
    },
  };
}

export const CHECKIN_DAYS = 150;

export type CheckinStrip = {
  id: string;
  sid: string;
  start: string;
  /** Per study day: "Y" took meds, "N" missed, "?" checked in without a meds answer, "-" no check-in, " " not reached yet. */
  meds: string;
  moods: (number | null)[];
  reported: number;
  taken: number;
  moodCount: number;
};

/**
 * Check-in Report (legacy uy_user_checkin_report, which was switched off):
 * medication and mood answers for the first 150 days from the intervention
 * start, matched by calendar day in the participant's timezone. The old
 * report matched exact timestamps and so pushed answers into extra columns.
 */
export async function checkinReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const people = population.people.filter((p) => p.interventionStartDate);
  const checkins = await db
    .select({
      userId: dailyCheckins.userId,
      day: dailyCheckins.day,
      meds: dailyCheckins.meds,
      mood: dailyCheckins.mood,
    })
    .from(dailyCheckins)
    .where(
      inIds(
        dailyCheckins.userId,
        people.map((p) => p.id),
      ),
    );
  const byUser = new Map<string, Map<string, { meds: boolean | null; mood: number | null }>>();
  for (const c of checkins) {
    const key = c.userId;
    if (!byUser.has(key)) byUser.set(key, new Map());
    byUser.get(key)!.set(c.day, { meds: c.meds ?? null, mood: c.mood ?? null });
  }
  const moodLabel = new Map(MOODS.map((m) => [m.value, m.label]));
  const today = new Date();
  const weekly = new Map<number, { taken: number; missed: number }>();

  const header: string[] = ["Participant SID", "Start Date"];
  for (let i = 1; i <= CHECKIN_DAYS; i++) header.push(`Day${i}/Med Taken`, `Day${i}/Mood Reported`);
  const csvRows: string[][] = [];
  const strips: CheckinStrip[] = [];

  for (const person of people) {
    const startDay = dayKey(person.interventionStartDate!, person.timezone);
    const todayKey = dayKey(today, person.timezone);
    const answers = byUser.get(person.id) ?? new Map();
    const csv: string[] = [person.sid, legacyDotDate(person.interventionStartDate)];
    let meds = "";
    const moods: (number | null)[] = [];
    let reported = 0;
    let taken = 0;
    let moodCount = 0;
    for (let i = 0; i < CHECKIN_DAYS; i++) {
      const day = format(addDays(parseISO(startDay), i), "yyyy-MM-dd");
      const answer = answers.get(day);
      csv.push(answer?.meds === true ? "YES" : answer?.meds === false ? "NO" : "NULL");
      csv.push(answer?.mood ? (moodLabel.get(answer.mood) ?? "NULL") : "NULL");
      if (day > todayKey) meds += " ";
      else if (!answer) meds += "-";
      else meds += answer.meds === true ? "Y" : answer.meds === false ? "N" : "?";
      moods.push(answer?.mood ?? null);
      if (answer?.meds !== null && answer?.meds !== undefined) {
        reported += 1;
        if (answer.meds) taken += 1;
        const week = studyWeekOfDay(studyDayOf(startDay, day));
        const bucket = weekly.get(week) ?? { taken: 0, missed: 0 };
        if (answer.meds) bucket.taken += 1;
        else bucket.missed += 1;
        weekly.set(week, bucket);
      }
      if (answer?.mood) moodCount += 1;
    }
    csvRows.push(csv);
    strips.push({
      id: person.id,
      sid: person.sid,
      start: person.interventionStartDate!.toISOString(),
      meds,
      moods,
      reported,
      taken,
      moodCount,
    });
  }

  const totalReported = strips.reduce((s, r) => s + r.reported, 0);
  const totalTaken = strips.reduce((s, r) => s + r.taken, 0);
  const weeks = [...weekly.keys()].sort((a, b) => a - b);
  const chartData = weeks.length
    ? Array.from({ length: weeks[weeks.length - 1] }, (_, i) => ({
        label: `Wk ${i + 1}`,
        taken: weekly.get(i + 1)?.taken ?? 0,
        missed: weekly.get(i + 1)?.missed ?? 0,
      }))
    : [];

  return {
    view: {
      layout: "checkin",
      columns: [],
      rows: [],
      tiles: [
        { label: "Participants", value: formatNumber(strips.length), hint: "With an intervention start date" },
        { label: "Days with a meds answer", value: formatNumber(totalReported) },
        { label: "Took their meds", value: percent(totalTaken, totalReported), hint: "Of days answered" },
        { label: "Mood answers", value: formatNumber(strips.reduce((s, r) => s + r.moodCount, 0)) },
      ],
      chart: chartData.length
        ? {
            title: "Medication answers by study week",
            series: [
              { key: "taken", label: "Took meds", color: "chart-1" },
              { key: "missed", label: "Missed", color: "chart-4" },
            ],
            data: chartData,
            labelPrefix: "",
          }
        : undefined,
      notes: [
        "Answers from the daily check-in for study days 1–150, each matched to the calendar day in the participant's own timezone.",
        "The old report was switched off because it matched exact times and shifted answers into extra columns; it is rebuilt here with one Med/Mood pair per day. Days without an answer are “NULL”, as before.",
        "Mood names follow the current 12-mood check-in (Happy … Angry); the old 7-mood scale is mapped when history is migrated.",
      ],
      missingSid: population.missingSid,
      extra: { strips, days: CHECKIN_DAYS },
    },
    csv: { filename: meta.filename, rows: [header, ...csvRows] },
  };
}
