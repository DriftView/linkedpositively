"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { award } from "@/features/gamification/points";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { weeklyCheckins } from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";
import { promptForSequence, startDateOf, weekDays } from "./queries";
import { adherenceBand, checkinTiming, checkinWeek, feedbackBand, promptSequence } from "./schedule";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Saves the open weekly check-in (all three steps at once): the "used?"
 * answers per day, the Likert answer and the open answer. Returns the
 * feedback to show. Answers can be changed until the check-in closes.
 */
export const submitWeeklyCheckin = permissionAction("checkin.weekly")
  .inputSchema(
    z.object({
      week: z.number().int().min(1).max(520),
      used: z.array(z.object({ date: dateKey, used: z.boolean().nullable() })).max(7),
      likertValue: z.number().int().min(1).max(5),
      openAnswer: z.string().trim().max(2000),
    }),
  )
  .action(async ({ parsedInput: input, ctx }) => {
    const viewer = ctx.viewer;
    const start = await startDateOf(viewer.id);
    const timing = checkinTiming(start, new Date(), viewer.timezone);
    if (!start || timing.openWeek !== input.week) {
      throw new UserFacingError("This check-in has closed. Your next one opens soon.");
    }
    const week = checkinWeek(start, input.week, viewer.timezone);
    const sequence = promptSequence(input.week);
    const prompt = await promptForSequence(sequence);
    if (!prompt) throw new UserFacingError("This week's check-in isn't ready yet. Please try again later.");
    const option = (prompt.likertOptions ?? []).find((o) => o.value === input.likertValue);
    if (!option) throw new UserFacingError("Please choose one of the answers.");

    const usedByDate = new Map(input.used.filter((u) => week.dates.includes(u.date)).map((u) => [u.date, u.used]));
    const days = (await weekDays(viewer.id, week)).map((d) => ({
      date: d.date,
      medsTaken: d.medsTaken,
      mood: d.mood?.value ?? null,
      used: usedByDate.get(d.date) ?? null,
    }));

    const band = feedbackBand(input.likertValue);
    const feedbackLong = (band === "low" ? prompt.feedbackLow : band === "medium" ? prompt.feedbackMedium : prompt.feedbackHigh) ?? "";
    const adherence = adherenceBand(sequence, days.map((d) => d.medsTaken));
    const feedbackShort = adherence === "more" ? (prompt.moreAdherentFeedback ?? "") : adherence === "less" ? (prompt.lessAdherentFeedback ?? "") : "";

    const answer = {
      weekStart: week.start,
      weekEnd: week.end,
      days,
      promptId: prompt.id,
      promptSequence: sequence,
      likertText: prompt.likertText,
      openText: prompt.openText,
      likertValue: input.likertValue,
      likertLabel: option.label,
      openAnswer: input.openAnswer,
      feedbackLong,
      feedbackShort: toPlainText(feedbackShort),
      submittedAt: new Date(),
      autoSubmitted: false,
    };
    await db
      .insert(weeklyCheckins)
      .values({ userId: viewer.id, week: input.week, ...answer })
      .onConflictDoUpdate({ target: [weeklyCheckins.userId, weeklyCheckins.week], set: answer });

    const points = await award({ userId: viewer.id, reason: "weekly_checkin", key: `weekly-checkin:${input.week}` });
    revalidatePath("/check-in", "layout");
    return { feedback: { long: feedbackLong, short: toPlainText(feedbackShort) }, points: points.awarded ? points.points : 0 };
  });
