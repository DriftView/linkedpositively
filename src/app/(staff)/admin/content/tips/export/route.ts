import { asc, sql } from "drizzle-orm";
import Papa from "papaparse";
import { can, getViewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { tips as tipsTable, tipTags } from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";

/** Tip content export (the old "thrive-export" page's "Export to Doc"). */
export async function GET() {
  const viewer = await getViewer();
  if (!viewer || !can(viewer, "content.manage")) return new Response("Not found", { status: 404 });
  const [tips, tags] = await Promise.all([
    // Tips without a release day first (as the old Mongo sort did).
    db
      .select()
      .from(tipsTable)
      .orderBy(sql`${tipsTable.displayDay} asc nulls first`, asc(tipsTable.title)),
    db.select({ id: tipTags.id, name: tipTags.name }).from(tipTags),
  ]);
  const names = new Map(tags.map((t) => [t.id, t.name]));
  const csv = Papa.unparse(
    tips.map((tip) => ({
      Title: tip.title,
      Type: tip.type,
      Published: tip.published ? "yes" : "no",
      "Day (cycle 1)": tip.displayDay ?? "",
      "Day (cycle 2)": tip.displayDayTwo ?? "",
      Topics: tip.tagIds
        .map((id) => names.get(id) ?? "")
        .filter(Boolean)
        .join("; "),
      Category: tip.categoryId ? (names.get(tip.categoryId) ?? "") : "",
      "Tailoring rule": tip.rule ? `${tip.rule.field} ${tip.rule.operator} ${tip.rule.value}` : "",
      "Pull quote": tip.pullquote ?? "",
      Description: toPlainText(tip.description ?? ""),
      Content: toPlainText((tip.html ?? "").replace(/</g, " <")),
      "Video link": tip.videoUrl ?? "",
      Link: tip.link ?? "",
    })),
    { escapeFormulae: true },
  );
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="thrive-tips-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
