import { profiles, surveyResponses, surveys, users, type SurveyFieldMapEntry, type SurveyKey } from "@/server/db/schema";
import { q, type Ctx } from "./lib/context";
import { localDateTime, str, variable } from "./lib/drupal";
import { legacy, upsertRows } from "./lib/upsert";
import { userMap } from "./lib/user-map";

/**
 * Qualtrics surveys (disabled qsurvey module): survey config
 * (multiple_qsurveys + the qsurvey question → field mapping + variable
 * midpoint_url) and the per-ResponseID processing log (users_logs) as
 * survey_responses. qsurvey_admin holds API credentials (secret, not
 * migrated); twm_survey_response_log and qsurvey_watchdog are sync timing/error
 * logs whose ResponseIDs are all in users_logs.
 */

const TARGET: Record<string, SurveyFieldMapEntry["target"]> = {
  field_study_id: "studyId",
  name: "username",
  mail: "email",
  field_number: "phone",
};

const LP_SITE_TIMEZONE = "America/Los_Angeles";

export async function migrateSurveys(ctx: Ctx) {
  const configs = await q<{ id: number; surveyid: string; status: number }>(ctx.lp, "select id, surveyid, status from multiple_qsurveys order by id");
  const mapping = await q<{ survey_id: string; export_tag: string; profile_field: string }>(
    ctx.lp,
    "select survey_id, export_tag, profile_field from qsurvey where profile_field <> 'Ignore' and export_tag <> '' order by qid",
  );
  const midpointUrl = await variable(ctx.lp, "midpoint_url");
  ctx.stats.source("surveys", configs.length);
  const keyOf = new Map<string, SurveyKey>();
  const rows = configs.map((config) => {
    // status 1 = create users (baseline), 0 = update users (midpoint/follow-up).
    const key: SurveyKey = Number(config.status) === 1 ? "baseline" : "midpoint";
    keyOf.set(config.surveyid, key);
    const fieldMap: SurveyFieldMapEntry[] = mapping
      .filter((m) => m.survey_id === config.surveyid)
      .map((m) => ({ source: m.export_tag, target: TARGET[m.profile_field] ?? ("extra" as const) }));
    return {
      key,
      title: key === "baseline" ? "Baseline survey" : "Midpoint survey",
      url: key === "midpoint" && typeof midpointUrl === "string" ? midpointUrl : "",
      qualtricsSurveyId: config.surveyid,
      syncMode: key === "baseline" ? ("create_users" as const) : ("update_users" as const),
      fieldMap,
      ...legacy("lp", "multiple_qsurveys", config.id),
    };
  });
  // Staff own the survey settings once the app runs: only link existing rows to their legacy source.
  await upsertRows(ctx, "surveys", surveys, rows, { target: [surveys.key], update: ["legacySite", "legacyTable", "legacyId"] });

  const map = await userMap(ctx);
  const logs = await q<{ id: number; rid: string; name: string | null; survey_id: string; data: string; logs: string; status: number; created_at: string }>(
    ctx.lp,
    "select id, rid, name, survey_id, data, logs, status, created_at from users_logs order by id",
  );
  ctx.stats.source("survey_responses", logs.length);
  const seen = new Set<string>();
  const out = [];
  let matched = 0;
  const migrated = new Set([...map.lp.values(), ...map.pn.values()]);
  const byStudyId = new Map(
    (await ctx.db.select({ userId: profiles.userId, studyId: profiles.studyId }).from(profiles))
      .filter((p) => p.studyId && migrated.has(p.userId))
      .map((p) => [p.studyId!, p.userId]),
  );
  const byUsername = new Map(
    (await ctx.db.select({ id: users.id, username: users.username }).from(users))
      .filter((u) => u.username && migrated.has(u.id))
      .map((u) => [u.username!, u.id]),
  );
  for (const row of logs) {
    const surveyKey = keyOf.get(row.survey_id);
    if (!surveyKey) {
      ctx.stats.skip("survey_responses", "unknown survey");
      continue;
    }
    const responseId = str(row.rid);
    if (responseId && seen.has(responseId)) {
      ctx.stats.skip("survey_responses", "duplicate ResponseID");
      continue;
    }
    if (responseId) seen.add(responseId);
    const message = row.logs ?? "";
    const studyId = /Study ID\(([^)]+)\)/.exec(message)?.[1] ?? null;
    const outcome = /found! Successfully updated/.test(message) ? "updated_user" : /No Study ID/.test(message) ? "skipped" : "completed";
    // Baseline rows created accounts by username (`name`); later rows matched by study ID. Most of those accounts were deleted.
    const userId = (studyId ? byStudyId.get(studyId) : undefined) ?? (row.name ? byUsername.get(row.name.trim().toLowerCase()) : undefined) ?? null;
    if (userId) matched++;
    const at = localDateTime(row.created_at, LP_SITE_TIMEZONE) ?? new Date(0);
    out.push({
      surveyKey,
      userId,
      studyId,
      responseId,
      source: "qualtrics" as const,
      outcome: outcome as "updated_user" | "skipped" | "completed",
      note: outcome === "skipped" ? "no_study_id" : null,
      completedAt: at,
      // Research data (staff only): the raw log columns.
      data: { name: row.name, data: row.data, log: message, status: Number(row.status) },
      ...legacy("lp", "users_logs", row.id),
      createdAt: at,
      updatedAt: at,
    });
  }
  ctx.stats.note("survey_responses", `${matched} responses linked to a migrated account (by study ID or username); the rest keep userId null`);
  await upsertRows(ctx, "survey_responses", surveyResponses, out);
}
