import type { InngestFunction } from "inngest";
import { getSettings } from "@/features/admin/settings";
import { notify } from "@/features/notifications/notify";
import { cycleKey } from "@/features/sms/schedule";
import { studyDay, studyWeek } from "@/lib/dates";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { profiles, surveyResponses, users } from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { promptMessage, promptStage } from "./defaults";
import { qualtricsConfigured, syncQualtrics } from "./qualtrics";
import { getSurveys } from "./service";

/** Qualtrics import (legacy every 13 min). Off unless configured and switched on in Settings. */
const qualtricsSync = inngest.createFunction(
  { id: "qualtrics-sync", triggers: [{ cron: "*/15 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => {
    const settings = await step.run("check-settings", async () => (await getSettings()).qualtricsSyncEnabled);
    if (!settings || !qualtricsConfigured()) return { skipped: true };
    return step.run("sync", () => syncQualtrics());
  },
);

/**
 * In-app messages for open survey windows (legacy midpoint notifications:
 * "your midpoint survey is ready", "one more week", "last day"). One message
 * per stage and cycle, deduplicated by key.
 */
async function sendSurveyNotifications(now = new Date()) {
  const settings = await getSettings();
  if (!settings.surveyPromptsEnabled) return { sent: 0 };
  const surveys = (await getSurveys()).filter((survey) => survey.promptEnabled && survey.url);
  if (!surveys.length) return { sent: 0 };
  const participants = await db
    .select({
      userId: profiles.userId,
      interventionStartDate: profiles.interventionStartDate,
      firstName: profiles.firstName,
      name: users.name,
      timezone: users.timezone,
    })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(
      and(
        sql`${users.role} ~ '(^|,)\\s*participant\\s*(,|$)'`,
        sql`${users.banned} is not true`,
        isNotNull(profiles.interventionStartDate),
      ),
    );
  const done = participants.length
    ? await db
        .select({ userId: surveyResponses.userId, surveyKey: surveyResponses.surveyKey })
        .from(surveyResponses)
        .where(
          and(
            inArray(
              surveyResponses.userId,
              participants.map((row) => row.userId),
            ),
            inArray(surveyResponses.outcome, ["completed", "updated_user"]),
          ),
        )
    : [];
  const doneKeys = new Set(done.map((row) => `${row.userId}:${row.surveyKey}`));

  let sent = 0;
  for (const participant of participants) {
    const timezone = participant.timezone || "America/New_York";
    const start = participant.interventionStartDate!;
    const week = studyWeek(start, now, timezone);
    const day = studyDay(start, now, timezone);
    for (const survey of surveys) {
      if (doneKeys.has(`${participant.userId}:${survey.key}`)) continue;
      const stage = promptStage(week, day, survey.openWeek, survey.closeWeek);
      if (!stage) continue;
      await notify({
        userId: participant.userId,
        kind: "survey",
        text: promptMessage(stage, participant.firstName || (participant.name ?? "").split(" ")[0] || "there", survey.title),
        href: "/surveys",
        dedupeKey: `survey:${survey.key}:${stage}:${cycleKey(start, timezone)}`,
      });
      sent++;
    }
  }
  return { sent };
}

const surveyNotifications = inngest.createFunction(
  { id: "survey-prompt-notifications", triggers: [{ cron: "TZ=America/New_York 0 9 * * *" }] },
  async ({ step }) => step.run("notify", () => sendSurveyNotifications()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [qualtricsSync, surveyNotifications];
