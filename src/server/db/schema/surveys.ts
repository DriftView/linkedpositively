import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { enumCheck, id, legacyColumns, legacyConstraints, rangeCheck, timestamps, tstz } from "./_shared";
import { users } from "./auth";

export const SURVEY_KEYS = ["baseline", "midpoint", "followup"] as const;
export type SurveyKey = (typeof SURVEY_KEYS)[number];

export const SURVEY_FIELD_TARGETS = ["studyId", "username", "email", "phone", "extra"] as const;
export type SurveyFieldTarget = (typeof SURVEY_FIELD_TARGETS)[number];

export const SURVEY_SYNC_MODES = ["off", "create_users", "update_users"] as const;
export type SurveySyncMode = (typeof SURVEY_SYNC_MODES)[number];

/** Response value key (Qualtrics export tag or QID) → account field. */
export type SurveyFieldMapEntry = { source: string; target: SurveyFieldTarget };

/**
 * A Qualtrics survey used by the study.
 *
 * - `url` is the participant-facing form; the study ID is appended as `?ID=`.
 * - `promptEnabled` shows an in-app card/pop-up from `openWeek` through
 *   `closeWeek` of the intervention (legacy: the midpoint in-app messages).
 * - `syncMode` imports responses with the Qualtrics API: baseline responses
 *   create control accounts, later ones mark the participant as done.
 *
 * Legacy: variable `midpoint_url`, qsurvey tables `multiple_qsurveys`
 * (surveyid, status 1 = create users / 0 = update users) and `qsurvey`
 * (export tag → profile field mapping).
 */
export const surveys = pgTable(
  "surveys",
  {
    id: id(),
    key: text().$type<SurveyKey>().notNull().unique(),
    title: text().notNull(),
    url: text().notNull().default(""),
    qualtricsSurveyId: text().notNull().default(""),
    syncMode: text().$type<SurveySyncMode>().notNull().default("off"),
    /** Response value key (Qualtrics export tag or QID) → account field. */
    fieldMap: jsonb().$type<SurveyFieldMapEntry[]>().notNull().default([]),
    promptEnabled: boolean().notNull().default(false),
    openWeek: integer().notNull().default(10),
    closeWeek: integer().notNull().default(11),
    lastSyncedAt: tstz(),
    lastSyncError: text(),
    updatedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("surveys", t),
    enumCheck("surveys_key_ck", t.key, SURVEY_KEYS),
    enumCheck("surveys_sync_mode_ck", t.syncMode, SURVEY_SYNC_MODES),
    rangeCheck("surveys_open_week_ck", t.openWeek, 1, 52),
    rangeCheck("surveys_close_week_ck", t.closeWeek, 1, 52),
  ],
);

export const SURVEY_OUTCOMES = ["completed", "created_user", "updated_user", "skipped", "error"] as const;
export type SurveyOutcome = (typeof SURVEY_OUTCOMES)[number];
export const SURVEY_SOURCES = ["qualtrics", "participant", "staff"] as const;
export type SurveySource = (typeof SURVEY_SOURCES)[number];

/**
 * One survey completion: imported from Qualtrics (idempotent on the
 * ResponseID), reported by the participant ("I've finished it") or recorded
 * by staff. Also serves as the Qualtrics sync's processing log (`outcome`).
 * Legacy: qsurvey `users_logs` / `twm_survey_response_log`, user field
 * `field_followup_survey`.
 */
export const surveyResponses = pgTable(
  "survey_responses",
  {
    id: id(),
    surveyKey: text().$type<SurveyKey>().notNull(),
    /** Null when the response matched no account, or the account was deleted (research data is kept). */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    studyId: text(),
    /** Qualtrics ResponseID ("R_…"); unique so a response is processed once. */
    responseId: text(),
    source: text().$type<SurveySource>().notNull(),
    outcome: text().$type<SurveyOutcome>().notNull().default("completed"),
    /** Short machine-readable reason for skipped/error rows (e.g. "duplicate_email"). */
    note: text(),
    completedAt: tstz().notNull().defaultNow(),
    /** Mapped answers kept for the research team (never shown to participants). */
    data: jsonb().$type<Record<string, unknown>>(),
    ...legacyColumns(),
    ...timestamps(),
  },
  (t) => [
    ...legacyConstraints("survey_responses", t),
    uniqueIndex("survey_responses_response_id_uq")
      .on(t.responseId)
      .where(sql`${t.responseId} is not null`),
    index("survey_responses_user_survey_idx").on(t.userId, t.surveyKey),
    index("survey_responses_survey_completed_idx").on(t.surveyKey, t.completedAt.desc()),
    enumCheck("survey_responses_source_ck", t.source, SURVEY_SOURCES),
    enumCheck("survey_responses_outcome_ck", t.outcome, SURVEY_OUTCOMES),
  ],
);

/**
 * A participant's interaction with an in-app survey prompt: when they opened
 * the survey and until when the pop-up stays hidden ("Remind me later").
 */
export const surveyPrompts = pgTable(
  "survey_prompts",
  {
    id: id(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    surveyKey: text().$type<SurveyKey>().notNull(),
    /** Intervention start day the prompt belongs to. */
    cycle: text().notNull(),
    openedAt: tstz(),
    opens: integer().notNull().default(0),
    snoozedUntil: tstz(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("survey_prompts_user_survey_cycle_uq").on(t.userId, t.surveyKey, t.cycle)],
);

export type Survey = typeof surveys.$inferSelect;
export type NewSurvey = typeof surveys.$inferInsert;
export type SurveyResponse = typeof surveyResponses.$inferSelect;
export type NewSurveyResponse = typeof surveyResponses.$inferInsert;
export type SurveyPrompt = typeof surveyPrompts.$inferSelect;
export type NewSurveyPrompt = typeof surveyPrompts.$inferInsert;
