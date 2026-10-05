import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { InngestFunction } from "inngest";
import { notify } from "@/features/notifications/notify";
import { db } from "@/server/db/client";
import { profiles, users, weeklyCheckins } from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/server/logger";
import { weekDays } from "./queries";
import { checkinTiming, checkinWeek } from "./schedule";

/**
 * Hourly (each participant has their own timezone, so windows open at
 * different UTC hours):
 * - when a weekly check-in opens, send the in-app reminder "It's time for your
 *   weekly check-in!" (the old home-page block), once per week;
 * - when a window has closed without an answer, store a "missed" snapshot of
 *   that week (the old Saturday-night auto-submit), with `used` left unknown.
 * Idempotent: notifications dedupe per week, snapshots are upserts that never
 * overwrite an answer.
 */
const weeklyCheckinCycle = inngest.createFunction(
  { id: "weekly-checkin-cycle", triggers: [{ cron: "7 * * * *" }] },
  async ({ step }) => {
    const participants = await step.run("find-participants", async () => {
      const rows = await db
        .select({ userId: profiles.userId, start: profiles.interventionStartDate, timezone: users.timezone })
        .from(profiles)
        .innerJoin(users, eq(users.id, profiles.userId))
        .where(
          and(
            sql`${users.role} ~ '(^|,)participant(,|$)'`,
            sql`${users.banned} is not true`,
            isNotNull(profiles.interventionStartDate),
          ),
        );
      return rows.map((p) => ({
        userId: p.userId,
        start: p.start!.toISOString(),
        timezone: p.timezone || "America/New_York",
      }));
    });

    let reminded = 0;
    let closed = 0;
    for (const batch of chunk(participants, 50)) {
      const result = await step.run(`process-${batch[0]?.userId ?? "none"}`, async () => {
        let r = 0;
        let c = 0;
        const now = new Date();
        for (const p of batch) {
          try {
            const start = new Date(p.start);
            const timing = checkinTiming(start, now, p.timezone);
            if (timing.openWeek == null) continue;

            const [open] = await db
              .select({ id: weeklyCheckins.id })
              .from(weeklyCheckins)
              .where(
                and(
                  eq(weeklyCheckins.userId, p.userId),
                  eq(weeklyCheckins.week, timing.openWeek),
                  isNotNull(weeklyCheckins.likertValue),
                ),
              )
              .limit(1);
            if (!open) {
              await notify({
                userId: p.userId,
                kind: "checkin_reminder",
                text: "It's time for your weekly check-in!",
                href: "/check-in",
                dedupeKey: `weekly-checkin-${timing.openWeek}`,
              });
              r += 1;
            }

            const lastClosed = timing.openWeek - 1;
            if (lastClosed >= 1) {
              const week = checkinWeek(start, lastClosed, p.timezone);
              const days = (await weekDays(p.userId, week)).map((d) => ({ date: d.date, medsTaken: d.medsTaken, mood: d.mood?.value ?? null, used: null }));
              const inserted = await db
                .insert(weeklyCheckins)
                .values({
                  userId: p.userId,
                  week: lastClosed,
                  weekStart: week.start,
                  weekEnd: week.end,
                  days,
                  autoSubmitted: true,
                  submittedAt: now,
                })
                .onConflictDoNothing({ target: [weeklyCheckins.userId, weeklyCheckins.week] })
                .returning({ id: weeklyCheckins.id });
              c += inserted.length;
            }
          } catch (error) {
            logger.error({ userId: p.userId, err: (error as Error).message }, "weekly check-in cycle failed for user");
          }
        }
        return { r, c };
      });
      reminded += result.r;
      closed += result.c;
    }
    return { participants: participants.length, reminded, closed };
  },
);

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [weeklyCheckinCycle];
