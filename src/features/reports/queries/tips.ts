import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { tipFavorites, tipViews, tips as tipsTable } from "@/server/db/schema";
import { formatNumber, percent } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation } from "../population";
import { inIds, inRange } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportColumn, ReportResult, ReportRow } from "../types";

/** Published tips in the old database order (Drupal node id, then creation). */
async function publishedTips() {
  return db
    .select({ id: tipsTable.id, title: tipsTable.title })
    .from(tipsTable)
    .where(eq(tipsTable.published, true))
    .orderBy(sql`${tipsTable.legacyId} asc nulls last`, tipsTable.createdAt, tipsTable.id);
}

/**
 * Participant × tip matrices (legacy uy_user_tips_report): how often each
 * tip was opened, or whether it was saved as a favourite. The old routes
 * could only be run by the site's first admin account; they now follow the
 * normal reports permission.
 */
export async function tipMatrixReport(
  meta: ReportMeta,
  filters: ReportFilters,
  mode: "views" | "favorites",
): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const tips = await publishedTips();

  // One cell per person × published tip: open count, or 1 for a favourite.
  const cells = new Map<string, number>();
  if (mode === "views") {
    const views = await db
      .select({ userId: tipViews.userId, tipId: tipViews.tipId, count: tipViews.count })
      .from(tipViews)
      .innerJoin(tipsTable, and(eq(tipsTable.id, tipViews.tipId), eq(tipsTable.published, true)))
      .where(and(inIds(tipViews.userId, population.ids), inRange(tipViews.firstViewedAt, filters)));
    for (const v of views) cells.set(`${v.userId}:${v.tipId}`, v.count);
  } else {
    const favorites = await db
      .select({ userId: tipFavorites.userId, tipId: tipFavorites.tipId })
      .from(tipFavorites)
      .innerJoin(tipsTable, and(eq(tipsTable.id, tipFavorites.tipId), eq(tipsTable.published, true)))
      .where(and(inIds(tipFavorites.userId, population.ids), inRange(tipFavorites.createdAt, filters)));
    for (const f of favorites) cells.set(`${f.userId}:${f.tipId}`, 1);
  }

  const rows: ReportRow[] = population.people.map((person) => {
    const row: ReportRow = { id: person.id, sid: person.sid };
    let total = 0;
    let distinct = 0;
    tips.forEach((tip, i) => {
      const value = cells.get(`${person.id}:${tip.id}`) ?? 0;
      row[`t${i}`] = value;
      total += value;
      if (value) distinct += 1;
    });
    row.total = mode === "views" ? total : distinct;
    row.distinct = distinct;
    return row;
  });

  const perTip = tips.map((tip, i) => ({
    title: tip.title,
    total: rows.reduce((s, r) => s + (r[`t${i}`] as number), 0),
  }));
  const top = [...perTip].sort((a, b) => b.total - a.total)[0];
  const reached = rows.filter((r) => (r.distinct as number) > 0).length;
  const columns: ReportColumn[] = [
    { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
    mode === "views"
      ? { id: "total", label: "Opens", kind: "number", hint: "All opens across tips" }
      : { id: "total", label: "Saved", kind: "number", hint: "Tips saved as favourites" },
    ...(mode === "views"
      ? [{ id: "distinct", label: "Tips", kind: "number" as const, hint: "Distinct tips opened" }]
      : []),
    ...tips.map((tip, i) => ({
      id: `t${i}`,
      label: tip.title,
      short: `${i + 1}`,
      kind: mode === "views" ? ("heat" as const) : ("flag" as const),
      hint: tip.title,
    })),
  ];

  const tipHeaders = tips.map((t) => t.title.replace(/[\r\n]+/g, " ").replace(/,/g, " "));
  return {
    view: {
      layout: "table",
      columns,
      rows,
      tiles:
        mode === "views"
          ? [
              { label: "Published tips", value: formatNumber(tips.length) },
              {
                label: "Participants who opened a tip",
                value: formatNumber(reached),
                hint: `${percent(reached, rows.length)} of ${formatNumber(rows.length)}`,
              },
              { label: "Total opens", value: formatNumber(perTip.reduce((s, t) => s + t.total, 0)) },
              {
                label: "Most opened",
                value: top && top.total ? `${formatNumber(top.total)}×` : "—",
                hint: top && top.total ? top.title : undefined,
              },
            ]
          : [
              { label: "Published tips", value: formatNumber(tips.length) },
              {
                label: "Participants with favourites",
                value: formatNumber(reached),
                hint: `${percent(reached, rows.length)} of ${formatNumber(rows.length)}`,
              },
              { label: "Favourites", value: formatNumber(perTip.reduce((s, t) => s + t.total, 0)) },
              {
                label: "Most saved",
                value: top && top.total ? `${formatNumber(top.total)}×` : "—",
                hint: top && top.total ? top.title : undefined,
              },
            ],
      searchKeys: ["sid"],
      initialSort: { id: "total", desc: true },
      notes: [
        mode === "views"
          ? "Each cell is how many times the participant opened that tip (0 if never). With a date range, tips first opened in the range are counted."
          : "Each cell is 1 if the participant saved the tip as a favourite, otherwise 0. With a date range, favourites saved in the range are counted.",
        "Columns are the published tips in their original order; hover a number to see the tip. Every participant with a study ID gets a row, as before.",
        "These reports used to run only for the site's first administrator account; anyone with access to reports can now run them.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        ["Participant SID", ...tipHeaders],
        ...rows.map((r) => [r.sid as string, ...tips.map((_, i) => r[`t${i}`] as number)]),
      ],
    },
  };
}
