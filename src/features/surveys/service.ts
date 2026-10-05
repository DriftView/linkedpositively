import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { endOfDay } from "date-fns";
import { getSettings } from "@/features/admin/settings";
import { cycleKey } from "@/features/sms/schedule";
import { inZone, studyDay, studyWeek } from "@/lib/dates";
import { parseRoles } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import { profiles, surveyPrompts, surveyResponses, surveys as surveysTable, users, type SurveyKey } from "@/server/db/schema";
import { DEFAULT_SURVEYS, promptMessage, promptStage, surveyLink, type PromptStage, type SurveyDefaults } from "./defaults";

export type SurveyConfig = SurveyDefaults & { id: string | null; lastSyncedAt: string | null; lastSyncError: string | null };

/** Configured surveys, falling back to the legacy defaults for any not saved yet. */
export async function getSurveys(): Promise<SurveyConfig[]> {
  const stored = await db.select().from(surveysTable);
  return DEFAULT_SURVEYS.map((defaults) => {
    const row = stored.find((survey) => survey.key === defaults.key);
    if (!row) return { ...defaults, id: null, lastSyncedAt: null, lastSyncError: null };
    return {
      key: defaults.key,
      title: row.title,
      url: row.url,
      qualtricsSurveyId: row.qualtricsSurveyId,
      syncMode: row.syncMode,
      fieldMap: row.fieldMap.map((entry) => ({ source: entry.source, target: entry.target })),
      promptEnabled: row.promptEnabled,
      openWeek: row.openWeek,
      closeWeek: row.closeWeek,
      id: row.id,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      lastSyncError: row.lastSyncError ?? null,
    };
  });
}

export type ParticipantSurvey = {
  key: SurveyKey;
  title: string;
  stage: PromptStage | null;
  message: string | null;
  /** Our tracking route that records the open and redirects to Qualtrics. */
  href: string | null;
  completed: boolean;
  /** The pop-up may open by itself (not snoozed today). */
  autoOpen: boolean;
  closesOn: string | null;
};

type Person = { id: string; name: string; timezone: string };

async function completedKeys(userId: string) {
  const rows = await db
    .select({ surveyKey: surveyResponses.surveyKey })
    .from(surveyResponses)
    .where(and(eq(surveyResponses.userId, userId), inArray(surveyResponses.outcome, ["completed", "updated_user", "created_user"])));
  return new Set(rows.map((row) => row.surveyKey));
}

async function profileOf(userId: string) {
  const [profile] = await db
    .select({ interventionStartDate: profiles.interventionStartDate, studyId: profiles.studyId, firstName: profiles.firstName })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return profile ?? null;
}

/**
 * The surveys a participant should see now, with the prompt stage. Only
 * people in the intervention arm with a start date get prompts.
 */
export async function getParticipantSurveys(person: Person, now = new Date()): Promise<ParticipantSurvey[]> {
  const [[user], profile, surveys, done, settings] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.id, person.id)).limit(1),
    profileOf(person.id),
    getSurveys(),
    completedKeys(person.id),
    getSettings(),
  ]);
  if (!user || !parseRoles(user.role ?? "").includes("participant") || !profile?.interventionStartDate) return [];
  const start = profile.interventionStartDate;
  const week = studyWeek(start, now, person.timezone);
  const day = studyDay(start, now, person.timezone);
  const cycle = cycleKey(start, person.timezone);
  const prompts = await db
    .select({ surveyKey: surveyPrompts.surveyKey, snoozedUntil: surveyPrompts.snoozedUntil })
    .from(surveyPrompts)
    .where(and(eq(surveyPrompts.userId, person.id), eq(surveyPrompts.cycle, cycle)));
  const name = profile.firstName || person.name.split(" ")[0];

  return surveys
    .filter((survey) => survey.promptEnabled && survey.url)
    .map((survey) => {
      const completed = done.has(survey.key);
      const stage = completed || !settings.surveyPromptsEnabled ? null : promptStage(week, day, survey.openWeek, survey.closeWeek);
      const snoozed = prompts.find((prompt) => prompt.surveyKey === survey.key)?.snoozedUntil;
      const closes = new Date(start.getTime() + (survey.closeWeek * 7 - 1) * 86_400_000);
      return {
        key: survey.key,
        title: survey.title,
        stage,
        message: stage ? promptMessage(stage, name, survey.title) : null,
        href: surveyLink(survey.url, profile.studyId) ? `/surveys/${survey.key}/go` : null,
        completed,
        autoOpen: Boolean(stage) && (!snoozed || snoozed <= now),
        closesOn: stage ? closes.toISOString() : null,
      };
    })
    .filter((survey) => survey.stage || survey.completed);
}

/** The one survey to prompt for right now, if any. */
export async function getDuePrompt(person: Person) {
  const surveys = await getParticipantSurveys(person);
  return surveys.find((survey) => survey.stage) ?? null;
}

/** Records that the participant opened the survey and returns the Qualtrics URL (with ?ID=). */
export async function openSurvey(person: Person, key: SurveyKey) {
  const [surveys, profile] = await Promise.all([getSurveys(), profileOf(person.id)]);
  const survey = surveys.find((candidate) => candidate.key === key);
  const url = survey ? surveyLink(survey.url, profile?.studyId) : null;
  if (!url) return null;
  if (profile?.interventionStartDate) {
    const now = new Date();
    await db
      .insert(surveyPrompts)
      .values({ userId: person.id, surveyKey: key, cycle: cycleKey(profile.interventionStartDate, person.timezone), openedAt: now, opens: 1 })
      .onConflictDoUpdate({
        target: [surveyPrompts.userId, surveyPrompts.surveyKey, surveyPrompts.cycle],
        set: { openedAt: now, opens: sql`${surveyPrompts.opens} + 1`, updatedAt: now },
      });
  }
  return url;
}

/** "Remind me later": hides the pop-up until tomorrow (the card stays). */
export async function snoozePrompt(person: Person, key: SurveyKey) {
  const profile = await profileOf(person.id);
  if (!profile?.interventionStartDate) return;
  const until = new Date(endOfDay(inZone(new Date(), person.timezone)).getTime() + 1);
  await db
    .insert(surveyPrompts)
    .values({ userId: person.id, surveyKey: key, cycle: cycleKey(profile.interventionStartDate, person.timezone), snoozedUntil: until })
    .onConflictDoUpdate({
      target: [surveyPrompts.userId, surveyPrompts.surveyKey, surveyPrompts.cycle],
      set: { snoozedUntil: until, updatedAt: new Date() },
    });
}

/** "I've finished it" (or staff marking it done). Idempotent per person and survey. */
export async function markSurveyComplete(userId: string, key: SurveyKey, source: "participant" | "staff") {
  const [exists] = await db
    .select({ id: surveyResponses.id })
    .from(surveyResponses)
    .where(
      and(eq(surveyResponses.userId, userId), eq(surveyResponses.surveyKey, key), inArray(surveyResponses.outcome, ["completed", "updated_user"])),
    )
    .limit(1);
  if (exists) return false;
  const profile = await profileOf(userId);
  await db.insert(surveyResponses).values({ userId, surveyKey: key, studyId: profile?.studyId ?? null, source, outcome: "completed" });
  return true;
}
