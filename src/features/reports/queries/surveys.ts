import "server-only";
import { and, asc, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { SURVEY_KEYS, surveyPrompts, surveyResponses, type SurveyKey, type SurveyOutcome } from "@/server/db/schema";
import { formatNumber, legacySlashDate, percent } from "../format";
import type { ReportFilters } from "../filters";
import { studyPopulation, type Person } from "../population";
import { inIds, inRange } from "./sql";
import type { ReportMeta } from "../catalog";
import type { ReportResult } from "../types";

const DONE: SurveyOutcome[] = ["completed", "created_user", "updated_user"];

const SURVEY_LABELS: Record<SurveyKey, string> = { baseline: "Baseline", midpoint: "Midpoint", followup: "Follow-up" };

const SOURCE_LABELS: Record<string, string> = { qualtrics: "Qualtrics", participant: "Participant", staff: "Staff" };

function armOf(person: Person) {
  if (person.roles.includes("participant")) return "Intervention";
  if (person.roles.includes("control")) return "Control";
  return "Other";
}

/**
 * Survey completion (new; the old "Survey Report" menu link pointed at a page
 * that never existed): when each study participant finished the baseline,
 * midpoint and follow-up surveys. A response counts when it was imported
 * from Qualtrics, reported by the participant or recorded by staff, matched
 * by account or, for imported rows without one, by study ID.
 */
export async function surveysReport(meta: ReportMeta, filters: ReportFilters): Promise<ReportResult> {
  const population = await studyPopulation(filters);
  const sids = population.people.map((p) => p.sid);
  const [responses, prompts] = await Promise.all([
    db
      .select({
        userId: surveyResponses.userId,
        studyId: surveyResponses.studyId,
        surveyKey: surveyResponses.surveyKey,
        completedAt: surveyResponses.completedAt,
        source: surveyResponses.source,
      })
      .from(surveyResponses)
      .where(
        and(
          inArray(surveyResponses.outcome, DONE),
          or(
            inIds(surveyResponses.userId, population.ids),
            sql`${surveyResponses.studyId} = any(${sql.param(sids)}::text[])`,
          ),
          inRange(surveyResponses.completedAt, filters),
        ),
      )
      .orderBy(asc(surveyResponses.completedAt), asc(surveyResponses.id)),
    // Prompt opens per person (all surveys and cycles).
    db
      .select({ userId: surveyPrompts.userId, opens: sql<number>`sum(${surveyPrompts.opens})::int` })
      .from(surveyPrompts)
      .where(and(inIds(surveyPrompts.userId, population.ids), gt(surveyPrompts.opens, 0)))
      .groupBy(surveyPrompts.userId),
  ]);

  const bySid = new Map(population.people.map((p) => [p.sid.toLowerCase(), p]));
  const done = new Map<string, Map<SurveyKey, { at: Date; source: string }>>();
  for (const response of responses) {
    const person =
      (response.userId && population.byId.get(response.userId)) ||
      (response.studyId ? bySid.get(response.studyId.toLowerCase()) : undefined);
    if (!person || !SURVEY_KEYS.includes(response.surveyKey as SurveyKey)) continue;
    if (!done.has(person.id)) done.set(person.id, new Map());
    const entry = done.get(person.id)!;
    // Earliest completion wins (responses are sorted oldest first).
    if (!entry.has(response.surveyKey as SurveyKey))
      entry.set(response.surveyKey as SurveyKey, { at: response.completedAt, source: response.source });
  }
  const opens = new Map(prompts.map((prompt) => [prompt.userId, prompt.opens]));

  const rows = population.people.map((person) => {
    const entry = done.get(person.id);
    const row: Record<string, string | number | null> & { id: string } = {
      id: person.id,
      sid: person.sid,
      arm: armOf(person),
    };
    let count = 0;
    for (const key of SURVEY_KEYS) {
      const hit = entry?.get(key);
      row[key] = hit ? hit.at.toISOString() : null;
      row[`${key}Source`] = hit ? (SOURCE_LABELS[hit.source] ?? hit.source) : "";
      if (hit) count += 1;
    }
    row.completed = count;
    row.opens = opens.get(person.id) ?? 0;
    return row;
  });

  const arms = [...new Set(rows.map((r) => r.arm as string))].sort();
  const chartData = SURVEY_KEYS.map((key) => {
    const bucket: Record<string, string | number> = { label: SURVEY_LABELS[key] };
    for (const arm of arms) bucket[arm] = rows.filter((r) => r.arm === arm && r[key]).length;
    return bucket;
  });
  const colors = ["chart-1", "chart-3", "muted"] as const;

  return {
    view: {
      layout: "table",
      columns: [
        { id: "sid", label: "Participant SID", kind: "sid", sticky: true },
        { id: "arm", label: "Arm", kind: "text" },
        ...SURVEY_KEYS.map((key) => ({
          id: key,
          label: SURVEY_LABELS[key],
          kind: "date" as const,
          hint: `${SURVEY_LABELS[key]} survey completed`,
        })),
        { id: "completed", label: "Done", kind: "heat", hint: "Surveys completed (of 3)" },
        {
          id: "opens",
          label: "Prompt opens",
          kind: "number",
          hint: "Times they opened a survey from the in-app prompt",
        },
      ],
      rows,
      tiles: SURVEY_KEYS.map((key) => {
        const n = rows.filter((r) => r[key]).length;
        return {
          label: `${SURVEY_LABELS[key]} complete`,
          value: formatNumber(n),
          hint: `${percent(n, rows.length)} of ${formatNumber(rows.length)}`,
        };
      }).concat([
        {
          label: "Opened a prompt",
          value: formatNumber(rows.filter((r) => (r.opens as number) > 0).length),
          hint: "Clicked through from the app",
        },
      ]),
      chart: rows.length
        ? {
            title: "Completed surveys by arm",
            series: arms.map((arm, i) => ({ key: arm, label: arm, color: colors[i] ?? "muted" })),
            data: chartData,
          }
        : undefined,
      searchKeys: ["sid", "arm"],
      initialSort: { id: "sid", desc: false },
      notes: [
        "A survey counts as done when a response was imported from Qualtrics, the participant said they finished it, or staff recorded it. The earliest completion is shown.",
        "With a date range, only surveys completed inside it count.",
        "The old site had a “Survey Report” menu link but no page behind it; this report is new, so its export layout is new too.",
      ],
      missingSid: population.missingSid,
    },
    csv: {
      filename: meta.filename,
      rows: [
        [
          "Participant SID",
          "Arm",
          "Baseline Completed",
          "Midpoint Completed",
          "Follow-up Completed",
          "Surveys Completed",
          "Prompt Opens",
        ],
        ...rows.map((r) => [
          r.sid,
          r.arm,
          legacySlashDate(r.baseline as string | null),
          legacySlashDate(r.midpoint as string | null),
          legacySlashDate(r.followup as string | null),
          r.completed,
          r.opens,
        ]),
      ],
    },
  };
}
