import type { InngestFunction } from "inngest";
import { inngest } from "@/server/jobs/client";
import { and, eq, gte, inArray, isNull, lte, ne, or } from "drizzle-orm";
import { hasPermission, parseRoles } from "@/server/auth/roles";
import { db } from "@/server/db/client";
import { profiles, users } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { notify } from "./notify";

/**
 * Site-authored study messages (docs/legacy/03 §6.2), kept close to the old
 * wording. The old week-6 text said "8 weeks remaining" (a typo for 18) and
 * the last weeks were in capitals; both are fixed here.
 */
export const WELCOME_TEXT = "Welcome to LinkPositively (LP). We're glad you're a part of the LP community.";

export const STUDY_WEEKS = 24;

const ENDINGS: Record<number, string> = {
  21: "You have 3 weeks remaining! Time to start wrapping things up!",
  23: "You have 1 week remaining! Time to start saying goodbye!",
  24: "Your time in the study is now at a close. Time to get in that final post!",
};

export const TIME_ON_SITE_WEEKS = [3, 6, 9, 12, 15, 18, 21, 23, 24] as const;

export function timeOnSiteMessages(name: string) {
  return TIME_ON_SITE_WEEKS.map((week) => {
    const remaining = STUDY_WEEKS - week;
    const tail = ENDINGS[week] ?? `You have ${remaining} weeks remaining!`;
    return {
      week,
      text: `Hello ${name}. You have been on the LinkPositively site for ${week} weeks. ${tail}`,
    };
  });
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Creates the study's welcome and "time on site" messages that are due for
 * one person (docs/legacy/03 §6.2). Each is dated when it became due, and
 * deduplicated, so this is safe to call on every home page view and from the
 * daily job.
 */
export async function ensureStudyMessages(input: {
  userId: string;
  name: string;
  start: Date | null | undefined;
  now?: Date;
}) {
  const { userId, start } = input;
  if (!start) return 0;
  const now = input.now ?? new Date();
  if (start > now) return 0;
  const weeks = Math.floor((now.getTime() - start.getTime()) / WEEK_MS);
  const due = [
    { key: "welcome", text: WELCOME_TEXT, at: start },
    ...timeOnSiteMessages(input.name)
      .filter((message) => message.week <= weeks)
      .map((message) => ({ key: `timeonsite-week${message.week}`, text: message.text, at: new Date(start.getTime() + message.week * WEEK_MS) })),
  ];
  await Promise.all(
    due.map((message) =>
      notify({
        userId,
        kind: message.key === "welcome" ? "welcome" : "time_on_site",
        text: message.text,
        dedupeKey: message.key,
        createdAt: message.at,
      }),
    ),
  );
  return due.length;
}

/** Daily sweep over everyone in the intervention window (plus a week of slack). */
export async function sweepStudyMessages(now = new Date()) {
  const earliest = new Date(now.getTime() - 26 * WEEK_MS);
  const rows = await db
    .select({ userId: profiles.userId, interventionStartDate: profiles.interventionStartDate, firstName: profiles.firstName })
    .from(profiles)
    .where(and(gte(profiles.interventionStartDate, earliest), lte(profiles.interventionStartDate, now)));
  const members = rows.length
    ? await db
        .select({ id: users.id, name: users.name, role: users.role })
        .from(users)
        .where(and(inArray(users.id, rows.map((profile) => profile.userId)), or(isNull(users.banned), ne(users.banned, true))))
    : [];
  const byId = new Map(members.map((user) => [user.id, user]));
  let people = 0;
  for (const profile of rows) {
    const user = byId.get(profile.userId);
    if (!user || !hasPermission(parseRoles(user.role), "lp.access")) continue;
    try {
      await ensureStudyMessages({
        userId: profile.userId,
        name: profile.firstName || user.name || "there",
        start: profile.interventionStartDate,
        now,
      });
      people++;
    } catch (error) {
      logger.warn({ userId: profile.userId, err: (error as Error).message }, "study messages failed");
    }
  }
  return { people };
}

/** For the home page: makes sure the viewer's due messages exist. */
export async function ensureStudyMessagesFor(userId: string, fallbackName: string) {
  const [profile] = await db
    .select({ interventionStartDate: profiles.interventionStartDate, firstName: profiles.firstName })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (!profile?.interventionStartDate) return;
  await ensureStudyMessages({ userId, name: profile.firstName || fallbackName, start: profile.interventionStartDate });
}
/**
 * Welcome + "time on site" week messages (docs/legacy/03 §6.2). The old site
 * computed them on every page view; here a daily sweep stores them (and the
 * home page tops them up for the person viewing it).
 */
const studyMessages = inngest.createFunction(
  { id: "study-time-on-site-messages", triggers: [{ cron: "TZ=America/New_York 15 6 * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => step.run("sweep", () => sweepStudyMessages()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [studyMessages];
