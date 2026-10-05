import "server-only";
import { eq, sql } from "drizzle-orm";
import { env } from "@/env";
import { normalizePhone } from "@/features/sms/phone";
import { createAccount } from "@/server/auth/accounts";
import { db } from "@/server/db/client";
import { logger } from "@/server/logger";
import { profiles, surveyResponses, surveys as surveysTable, users, type SurveyKey } from "@/server/db/schema";
import type { SurveyConfig } from "./service";
import { getSurveys } from "./service";

/**
 * Qualtrics response import (legacy `qsurvey_createuser_cron`, every 13 min).
 *
 * For each survey with a sync mode, exports responses recorded since the last
 * sync (minus 6 hours of overlap, like the old job) through the v3
 * export-responses API as uncompressed JSON, then:
 * - create_users (baseline): creates an active control account per new
 *   respondent (study ID and username required; skipped when the study ID or
 *   email already exists). They get a welcome link when randomized.
 * - update_users (midpoint/follow-up): matches the respondent by study ID and
 *   marks the survey as completed for them.
 * Every ResponseID is recorded once in SurveyResponse, so reruns are safe.
 */

const OVERLAP_MS = 6 * 60 * 60 * 1000;
const POLL_ATTEMPTS = 20;
const POLL_DELAY_MS = 2000;

export function qualtricsConfigured() {
  return Boolean(env.QUALTRICS_API_TOKEN && env.QUALTRICS_DATA_CENTER);
}

type QualtricsResponse = { responseId: string; values: Record<string, unknown>; labels?: Record<string, unknown> };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`https://${env.QUALTRICS_DATA_CENTER}.qualtrics.com/API/v3${path}`, {
    ...init,
    headers: { "X-API-TOKEN": env.QUALTRICS_API_TOKEN ?? "", "Content-Type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Qualtrics ${response.status} on ${path.split("/").slice(0, 3).join("/")}`);
  return (await response.json()) as T;
}

async function exportResponses(surveyId: string, since: Date | null): Promise<QualtricsResponse[]> {
  const start = await api<{ result: { progressId: string } }>(`/surveys/${surveyId}/export-responses`, {
    method: "POST",
    body: JSON.stringify({ format: "json", compress: false, ...(since ? { startDate: since.toISOString().replace(/\.\d{3}Z$/, "Z") } : {}) }),
  });
  let fileId: string | null = null;
  for (let attempt = 0; attempt < POLL_ATTEMPTS && !fileId; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_DELAY_MS));
    const progress = await api<{ result: { status: string; fileId?: string } }>(
      `/surveys/${surveyId}/export-responses/${start.result.progressId}`,
    );
    if (progress.result.status === "failed") throw new Error("Qualtrics export failed");
    if (progress.result.status === "complete") fileId = progress.result.fileId ?? null;
  }
  if (!fileId) throw new Error("Qualtrics export timed out");
  const file = await api<{ responses: QualtricsResponse[] }>(`/surveys/${surveyId}/export-responses/${fileId}/file`);
  return file.responses ?? [];
}

function readValue(response: QualtricsResponse, source: string) {
  const raw = response.values[source] ?? response.values[`${source}_TEXT`] ?? response.labels?.[source];
  if (raw === null || raw === undefined) return "";
  return String(Array.isArray(raw) ? raw.join(",") : raw).trim();
}

function mapResponse(survey: SurveyConfig, response: QualtricsResponse) {
  const mapped: { studyId: string; username: string; email: string; phone: string; extra: Record<string, string> } = {
    studyId: "",
    username: "",
    email: "",
    phone: "",
    extra: {},
  };
  for (const { source, target } of survey.fieldMap) {
    const value = readValue(response, source);
    if (target === "extra") {
      if (value) mapped.extra[source] = value.slice(0, 200);
    } else if (value) {
      mapped[target] = value.slice(0, 200);
    }
  }
  return mapped;
}

async function uniqueUsername(base: string) {
  const clean = base.toLowerCase().replace(/[^a-z0-9._-]+/g, "").slice(0, 50) || "participant";
  let candidate = clean;
  for (let i = 2; ; i++) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.username, candidate)).limit(1);
    if (!taken) break;
    candidate = `${clean}${i}`;
  }
  return candidate;
}

async function record(
  survey: SurveyConfig,
  response: QualtricsResponse,
  fields: { outcome: "created_user" | "updated_user" | "skipped" | "error"; note?: string; userId?: string; studyId?: string; data?: Record<string, string> },
) {
  await db
    .insert(surveyResponses)
    .values({
      surveyKey: survey.key,
      responseId: response.responseId,
      source: "qualtrics",
      outcome: fields.outcome,
      note: fields.note ?? null,
      userId: fields.userId ?? null,
      studyId: fields.studyId || null,
      data: fields.data && Object.keys(fields.data).length ? fields.data : null,
      completedAt: new Date(),
    })
    // A response is recorded once, even if two syncs overlap.
    .onConflictDoNothing({ target: surveyResponses.responseId, where: sql`${surveyResponses.responseId} is not null` });
}

async function processResponse(survey: SurveyConfig, response: QualtricsResponse) {
  const [seen] = await db
    .select({ id: surveyResponses.id })
    .from(surveyResponses)
    .where(eq(surveyResponses.responseId, response.responseId))
    .limit(1);
  if (seen) return "seen" as const;
  const fields = mapResponse(survey, response);
  if (!fields.studyId) {
    await record(survey, response, { outcome: "skipped", note: "missing_study_id" });
    return "skipped" as const;
  }

  if (survey.syncMode === "update_users") {
    const [profile] = await db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.studyId, fields.studyId)).limit(1);
    if (!profile) {
      await record(survey, response, { outcome: "skipped", note: "unknown_study_id", studyId: fields.studyId });
      return "skipped" as const;
    }
    await record(survey, response, { outcome: "updated_user", userId: profile.userId, studyId: fields.studyId, data: fields.extra });
    return "updated" as const;
  }

  // create_users
  const email = fields.email.toLowerCase();
  if (!fields.username || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    await record(survey, response, { outcome: "skipped", note: !fields.username ? "missing_name" : "invalid_email", studyId: fields.studyId });
    return "skipped" as const;
  }
  const [[studyTaken], [emailTaken]] = await Promise.all([
    db.select({ id: profiles.id }).from(profiles).where(eq(profiles.studyId, fields.studyId)).limit(1),
    db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1),
  ]);
  if (studyTaken || emailTaken) {
    await record(survey, response, { outcome: "skipped", note: studyTaken ? "duplicate_study_id" : "duplicate_email", studyId: fields.studyId });
    return "skipped" as const;
  }
  const user = await createAccount({
    username: await uniqueUsername(fields.username),
    email,
    roles: ["control"],
    programs: ["lp"],
    timezone: "America/New_York",
  });
  const phone = normalizePhone(fields.phone);
  const profileFields = { studyId: fields.studyId, ...(phone ? { phone } : {}) };
  await db
    .insert(profiles)
    .values({ userId: String(user.id), ...profileFields })
    .onConflictDoUpdate({ target: profiles.userId, set: { ...profileFields, updatedAt: new Date() } });
  await record(survey, response, { outcome: "created_user", userId: String(user.id), studyId: fields.studyId, data: fields.extra });
  return "created" as const;
}

export type SyncSummary = { survey: SurveyKey; created: number; updated: number; skipped: number; error?: string };

export async function syncQualtrics(now = new Date()): Promise<SyncSummary[]> {
  if (!qualtricsConfigured()) return [];
  const surveys = (await getSurveys()).filter((survey) => survey.id && survey.syncMode !== "off" && survey.qualtricsSurveyId);
  const summaries: SyncSummary[] = [];
  for (const survey of surveys) {
    const summary: SyncSummary = { survey: survey.key, created: 0, updated: 0, skipped: 0 };
    try {
      const since = survey.lastSyncedAt ? new Date(new Date(survey.lastSyncedAt).getTime() - OVERLAP_MS) : null;
      const responses = await exportResponses(survey.qualtricsSurveyId, since);
      for (const response of responses) {
        const outcome = await processResponse(survey, response);
        if (outcome === "created") summary.created++;
        else if (outcome === "updated") summary.updated++;
        else if (outcome === "skipped") summary.skipped++;
      }
      await db.update(surveysTable).set({ lastSyncedAt: now, lastSyncError: null }).where(eq(surveysTable.key, survey.key));
    } catch (error) {
      summary.error = (error as Error).message.slice(0, 200);
      logger.error({ survey: survey.key, err: summary.error }, "qualtrics sync failed");
      await db.update(surveysTable).set({ lastSyncError: summary.error }).where(eq(surveysTable.key, survey.key));
    }
    summaries.push(summary);
  }
  return summaries;
}
