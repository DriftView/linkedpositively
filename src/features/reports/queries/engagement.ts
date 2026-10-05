import "server-only";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  comments as commentsTable,
  dailyCheckins,
  journeyUserGoals,
  pointEntries,
  posts as postsTable,
  smsClicks,
  tipFavorites,
  tipViews,
  usageEvents,
} from "@/server/db/schema";
import { formatNumber, median } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { SMS_WEEK_COLUMNS, smsColumnKey } from "../sms-weeks";
import { activeDays } from "./shared";
import { countAll, countMap, countWhere, inDays, inIds, inRange } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportColumn, ReportResult, ReportRow } from "../types";

/** Profile edits that count as "outward facing profile features" (legacy: About me or Age changed). */
const OUTWARD_FIELDS = ["aboutMe", "age"];

type Metric = { key: string; header: string; label: string; short?: string; hint?: string };

const METRICS: Metric[] = [
  { key: "posts", header: "Frequency of wall posts by Participant SID", label: "Wall posts", short: "Posts" },
  {
    key: "comments",
    header: "Number of comments by Participant SID",
    label: "Comments",
    hint: "On posts, tips and resources",
  },
  {
    key: "tipsViewed",
    header: "Number of Thrive-Tips Viewed",
    label: "Tips viewed",
    short: "Tips",
    hint: "Distinct tips opened",
  },
  {
    key: "tailoredViewed",
    header: "Number of Tailored Thrive-Tips Viewed",
    label: "Tailored tips viewed",
    short: "Tailored",
    hint: "Tips recommended to them when first opened",
  },
  { key: "favorites", header: "Number of Thrive Tips marked as 'Favorites' ", label: "Favourite tips", short: "Favs" },
];
const TAIL_METRICS: Metric[] = [
  {
    key: "artDays",
    header: "Number of days ART Adherence Reported",
    label: "Meds days reported",
    short: "Meds days",
    hint: "Days with a medication answer in the daily check-in",
  },
  {
    key: "moodDays",
    header: "Number of Mood Responses Reported",
    label: "Mood responses",
    short: "Moods",
    hint: "Days with a mood in the daily check-in",
  },
  { key: "goalsSet", header: "Number of Goals Set", label: "Goals set", short: "Goals" },
  {
    key: "goalReports",
    header: "Number of Times Progress Toward Goals is Reported",
    label: "Goal updates",
    short: "Goal upd.",
    hint: "Progress updates on their goals",
  },
  {
    key: "activeDays",
    header: "Total Number of Active Intervention Days",
    label: "Active days",
    short: "Active days",
    hint: "Distinct days with any recorded activity",
  },
  {
    key: "profileUpdates",
    header: "Number of times the participant updated their outward facing profile features",
    label: "Profile updates",
    short: "Profile upd.",
    hint: "About me / age changes",
  },
  { key: "points", header: "Total Points Earned", label: "Points", short: "Points" },
];

/**
 * Standard User Engagement Report (legacy uy_standard_user_engagement): one
 * row per participant. Every metric is grouped by the participant's own id,
 * which fixes the old report's misaligned "Total Points" column and the
 * values that carried over from the previous row.
 */
export async function engagementReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const ids = population.ids;
  // A filter clause that is "true" when no date range is set, for use inside count(*) filter (where …).
  const within = (condition: ReturnType<typeof inRange>) => condition ?? sql`true`;

  const [postRows, commentRows, tipRows, favoriteRows, checkinRows, goalRows, profileRows, pointRows, clicks, active] =
    await Promise.all([
      db
        .select({ key: sql<string>`${postsTable.authorId}`, n: countAll() })
        .from(postsTable)
        .where(
          and(inIds(postsTable.authorId, ids), eq(postsTable.kind, "post"), inRange(postsTable.createdAt, filters)),
        )
        .groupBy(postsTable.authorId),
      db
        .select({ key: sql<string>`${commentsTable.authorId}`, n: countAll() })
        .from(commentsTable)
        .where(and(inIds(commentsTable.authorId, ids), inRange(commentsTable.createdAt, filters)))
        .groupBy(commentsTable.authorId),
      // Distinct tips opened (one row per person and tip) and those recommended when first opened.
      db
        .select({ key: tipViews.userId, viewed: countAll(), tailored: countWhere(sql`${tipViews.recommended}`) })
        .from(tipViews)
        .where(and(inIds(tipViews.userId, ids), inRange(tipViews.firstViewedAt, filters)))
        .groupBy(tipViews.userId),
      db
        .select({ key: tipFavorites.userId, n: countAll() })
        .from(tipFavorites)
        .where(and(inIds(tipFavorites.userId, ids), inRange(tipFavorites.createdAt, filters)))
        .groupBy(tipFavorites.userId),
      db
        .select({
          key: dailyCheckins.userId,
          meds: countWhere(isNotNull(dailyCheckins.meds)),
          mood: countWhere(isNotNull(dailyCheckins.mood)),
        })
        .from(dailyCheckins)
        .where(and(inIds(dailyCheckins.userId, ids), inDays(dailyCheckins.day, filters)))
        .groupBy(dailyCheckins.userId),
      // Goals set count by creation; progress updates by the goal's last change (as before).
      db
        .select({
          key: journeyUserGoals.userId,
          set: countWhere(within(inRange(journeyUserGoals.createdAt, filters))),
          updates: sql<number>`coalesce(sum(${journeyUserGoals.updateCount}) filter (where ${within(inRange(journeyUserGoals.updatedAt, filters))}), 0)::int`,
        })
        .from(journeyUserGoals)
        .where(inIds(journeyUserGoals.userId, ids))
        .groupBy(journeyUserGoals.userId),
      db
        .select({ key: usageEvents.userId, n: countAll() })
        .from(usageEvents)
        .where(
          and(
            inIds(usageEvents.userId, ids),
            eq(usageEvents.type, "profile_edit"),
            inArray(sql`${usageEvents.meta}->>'field'`, OUTWARD_FIELDS),
            inRange(usageEvents.at, filters),
          ),
        )
        .groupBy(usageEvents.userId),
      db
        .select({ key: pointEntries.userId, n: sql<number>`coalesce(sum(${pointEntries.points}), 0)::int` })
        .from(pointEntries)
        .where(and(inIds(pointEntries.userId, ids), inRange(pointEntries.at, filters)))
        .groupBy(pointEntries.userId),
      db
        .selectDistinct({ userId: smsClicks.userId, flag: smsClicks.flag })
        .from(smsClicks)
        .where(and(inIds(smsClicks.userId, ids), inRange(smsClicks.firstClickAt, filters))),
      activeDays(population.ids, filters),
    ]);

  const clicked = new Map<string, Set<string>>();
  for (const click of clicks) {
    const key = smsColumnKey(click.flag);
    if (!key) continue;
    const id = click.userId;
    if (!clicked.has(id)) clicked.set(id, new Set());
    clicked.get(id)!.add(key);
  }

  const sources: Record<string, Map<string, number>> = {
    posts: countMap(postRows),
    comments: countMap(commentRows),
    tipsViewed: new Map(tipRows.map((r) => [r.key, r.viewed])),
    tailoredViewed: new Map(tipRows.map((r) => [r.key, r.tailored])),
    favorites: countMap(favoriteRows),
    artDays: new Map(checkinRows.map((r) => [r.key, r.meds])),
    moodDays: new Map(checkinRows.map((r) => [r.key, r.mood])),
    goalsSet: new Map(goalRows.map((r) => [r.key, r.set])),
    goalReports: new Map(goalRows.map((r) => [r.key, r.updates])),
    profileUpdates: countMap(profileRows),
    points: countMap(pointRows),
  };

  const rows: ReportRow[] = population.people.map((person) => {
    const row: ReportRow = { id: person.id, sid: person.sid };
    for (const metric of [...METRICS, ...TAIL_METRICS]) {
      row[metric.key] =
        metric.key === "activeDays" ? (active.get(person.id)?.size ?? 0) : (sources[metric.key]?.get(person.id) ?? 0);
    }
    const weeks = clicked.get(person.id);
    for (const week of SMS_WEEK_COLUMNS) row[week.key] = weeks?.has(week.key) ? 1 : 0;
    row.smsClicked = weeks?.size ?? 0;
    return row;
  });

  const columns: ReportColumn[] = [
    { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
    ...METRICS.map((m) => ({
      id: m.key,
      label: m.label,
      short: m.short,
      kind: "heat" as const,
      hint: m.hint ? `${m.hint}. Export column: ${m.header.trim()}` : m.header.trim(),
    })),
    {
      id: "smsClicked",
      label: "SMS links clicked",
      short: "SMS",
      kind: "heat",
      hint: "Weeks whose engagement text they opened (the export has one 1/0 column per week)",
    },
    ...TAIL_METRICS.map((m) => ({
      id: m.key,
      label: m.label,
      short: m.short,
      kind: "heat" as const,
      hint: m.hint ? `${m.hint}. Export column: ${m.header}` : m.header,
    })),
    ...SMS_WEEK_COLUMNS.map((w) => ({ id: w.key, label: w.short, kind: "flag" as const, hint: w.header })),
  ];

  const total = (key: string) => rows.reduce((sum, row) => sum + (row[key] as number), 0);
  const activeValues = rows.map((row) => row.activeDays as number);
  const mid = median(activeValues);
  const clickChart = SMS_WEEK_COLUMNS.map((w) => ({
    label: w.short,
    count: rows.filter((row) => row[w.key] === 1).length,
  }));

  const header = [
    "Participant SID",
    ...METRICS.map((m) => m.header),
    ...SMS_WEEK_COLUMNS.map((w) => w.header),
    ...TAIL_METRICS.map((m) => m.header),
  ];
  const csvRows = rows.map((row) => [
    row.sid as string,
    ...METRICS.map((m) => row[m.key] as number),
    ...SMS_WEEK_COLUMNS.map((w) => row[w.key] as number),
    ...TAIL_METRICS.map((m) => row[m.key] as number),
  ]);

  return {
    view: {
      layout: "table",
      columns,
      rows,
      tiles: [
        { label: "Participants", value: formatNumber(rows.length) },
        { label: "Median active days", value: mid === null ? "—" : formatNumber(mid, 1) },
        {
          label: "Wall posts",
          value: formatNumber(total("posts")),
          hint: `${formatNumber(total("comments"))} comments`,
        },
        { label: "Points earned", value: formatNumber(total("points")) },
      ],
      chart: rows.length
        ? {
            title: "Who opened each weekly text",
            description: "Participants who clicked the link in that week's engagement message.",
            series: [{ key: "count", label: "Participants", color: "primary" }],
            data: clickChart,
          }
        : undefined,
      searchKeys: ["sid"],
      initialSort: { id: "sid", desc: false },
      notes: [
        "Every metric is counted for the participant on that row. The old report attached “Total Points” to the wrong people and let SMS and tip counts spill over from the row above; both are fixed.",
        "Tips viewed are distinct tips; tailored tips are those recommended to the participant when they first opened them.",
        "Meds and mood counts come from the daily check-in (they were always blank in the old report).",
        "Active days are distinct Eastern calendar days with a sign-in, a tracked page view or an action that earned points. The old site counted page hits from the web server access log, which the new app doesn't keep, so numbers are close but not identical.",
        "With a date range, each metric counts only activity inside it (tips by first view, goal updates by the goal's last change).",
      ],
      gaps: [
        {
          label: "Age changes",
          detail:
            "The old count included changes to a participant's age. Age is only edited by staff on the account page, which doesn't record those changes yet, so “Profile updates” counts About me changes only.",
        },
      ],
      missingSid: population.missingSid,
    },
    csv: { filename: meta.filename, rows: [header, ...csvRows] },
  };
}
