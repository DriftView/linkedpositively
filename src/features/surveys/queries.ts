import "server-only";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { profiles, surveyResponses, users } from "@/server/db/schema";
import { qualtricsConfigured } from "./qualtrics";
import { getSurveys, type SurveyConfig } from "./service";

export type SurveyResponseRow = {
  id: string;
  surveyKey: string;
  userId: string | null;
  name: string | null;
  studyId: string | null;
  source: "qualtrics" | "participant" | "staff";
  outcome: "completed" | "created_user" | "updated_user" | "skipped" | "error";
  note: string | null;
  responseId: string | null;
  completedAt: string;
};

export type SurveyAdminData = {
  surveys: (SurveyConfig & { completed: number })[];
  responses: SurveyResponseRow[];
  qualtricsConnected: boolean;
};

const DONE_OUTCOMES = ["completed", "updated_user", "created_user"] as const;

export async function getSurveyAdmin(): Promise<SurveyAdminData> {
  const [surveys, counts, rows] = await Promise.all([
    getSurveys(),
    db
      .select({ surveyKey: surveyResponses.surveyKey, count: count() })
      .from(surveyResponses)
      .where(inArray(surveyResponses.outcome, [...DONE_OUTCOMES]))
      .groupBy(surveyResponses.surveyKey),
    db
      .select({
        response: surveyResponses,
        name: users.name,
        username: users.username,
        profileStudyId: profiles.studyId,
      })
      .from(surveyResponses)
      .leftJoin(users, eq(users.id, surveyResponses.userId))
      .leftJoin(profiles, eq(profiles.userId, surveyResponses.userId))
      .orderBy(desc(surveyResponses.completedAt), desc(surveyResponses.id))
      .limit(1000),
  ]);
  const countByKey = new Map(counts.map((row) => [row.surveyKey, row.count]));
  return {
    qualtricsConnected: qualtricsConfigured(),
    surveys: surveys.map((survey) => ({ ...survey, completed: countByKey.get(survey.key) ?? 0 })),
    responses: rows.map(({ response: row, name, username, profileStudyId }) => {
      const userId = row.userId;
      return {
        id: row.id,
        surveyKey: row.surveyKey,
        userId,
        name: userId ? name || username || null : null,
        studyId: row.studyId ?? (userId ? (profileStudyId ?? null) : null),
        source: row.source,
        outcome: row.outcome,
        note: row.note ?? null,
        responseId: row.responseId ?? null,
        completedAt: row.completedAt.toISOString(),
      };
    }),
  };
}

/** Survey status for one participant (user page). */
export async function getUserSurveys(userId: string) {
  const [surveys, rows] = await Promise.all([
    getSurveys(),
    db
      .select({ surveyKey: surveyResponses.surveyKey, completedAt: surveyResponses.completedAt, source: surveyResponses.source })
      .from(surveyResponses)
      .where(and(eq(surveyResponses.userId, userId), inArray(surveyResponses.outcome, [...DONE_OUTCOMES])))
      .orderBy(asc(surveyResponses.createdAt), asc(surveyResponses.id)),
  ]);
  return surveys.map((survey) => {
    const done = rows.find((row) => row.surveyKey === survey.key);
    return {
      key: survey.key,
      title: survey.title,
      completedAt: done ? done.completedAt.toISOString() : null,
      source: done ? (done.source as string) : null,
    };
  });
}
