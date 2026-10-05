"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { uuidSchema } from "@/server/db/ids";
import { journeyCategories, journeyGoals, journeyMethods, journeyUserGoals } from "@/server/db/schema";

// Personal goals are a tracking feature; `tracker.use` is the closest permission (participants).
const PERMISSION = "tracker.use" as const;
const objectId = uuidSchema;
const MAX_ACTIVE = 12;

const startSchema = z.union([
  z.object({ kind: z.literal("catalog"), goalId: objectId, goalIn: z.string().trim().max(60).default(""), targetDate: z.iso.date().optional() }),
  z.object({
    kind: z.literal("own"),
    ownGoal: z.string().trim().min(3, "Describe your goal in a few words").max(300),
    ownCategory: z.string().trim().max(120).default(""),
    goalIn: z.string().trim().max(60).default(""),
    targetDate: z.iso.date().optional(),
  }),
]);

function revalidateJourney() {
  revalidatePath("/journey");
}

/** Goals the user is still working on (not removed, not completed). */
function activeGoalsOf(userId: string) {
  return and(
    eq(journeyUserGoals.userId, userId),
    eq(journeyUserGoals.dismissed, false),
    isNull(journeyUserGoals.completedAt),
  );
}

export const startGoalAction = permissionAction(PERMISSION)
  .inputSchema(startSchema)
  .action(async ({ parsedInput, ctx }) => {
    const userId = ctx.viewer.id;
    const [{ active } = { active: 0 }] = await db
      .select({ active: count() })
      .from(journeyUserGoals)
      .where(activeGoalsOf(userId));
    if (active >= MAX_ACTIVE) throw new UserFacingError(`You're working on ${MAX_ACTIVE} goals already. Finish or remove one first.`);
    const base = {
      userId,
      step: 1,
      goalIn: parsedInput.goalIn || null,
      targetDate: parsedInput.targetDate ? new Date(`${parsedInput.targetDate}T12:00:00Z`) : null,
    };

    if (parsedInput.kind === "own") {
      const [doc] = await db
        .insert(journeyUserGoals)
        .values({ ...base, ownGoal: parsedInput.ownGoal, ownCategory: parsedInput.ownCategory || null })
        .returning({ id: journeyUserGoals.id });
      revalidateJourney();
      return { id: doc!.id };
    }

    const [found] = await db
      .select({
        goalId: journeyGoals.id,
        goalName: journeyGoals.name,
        methodId: journeyMethods.id,
        methodName: journeyMethods.name,
        categoryId: journeyCategories.id,
        categoryName: journeyCategories.name,
      })
      .from(journeyGoals)
      .innerJoin(journeyMethods, eq(journeyMethods.id, journeyGoals.methodId))
      .innerJoin(journeyCategories, eq(journeyCategories.id, journeyMethods.categoryId))
      .where(and(eq(journeyGoals.id, parsedInput.goalId), eq(journeyCategories.published, true)))
      .limit(1);
    if (!found) throw new UserFacingError("That goal isn't available any more.");
    const [existing] = await db
      .select({ id: journeyUserGoals.id })
      .from(journeyUserGoals)
      .where(and(activeGoalsOf(userId), eq(journeyUserGoals.goalId, found.goalId)))
      .limit(1);
    if (existing) return { id: existing.id };
    const [doc] = await db
      .insert(journeyUserGoals)
      .values({ ...base, ...found })
      .returning({ id: journeyUserGoals.id });
    revalidateJourney();
    return { id: doc!.id };
  });

const updateSchema = z.object({
  id: objectId,
  step: z.number().int().min(1).max(7),
  currentStepNote: z.string().trim().max(500).default(""),
  nextStepNote: z.string().trim().max(500).default(""),
  targetDate: z.iso.date().nullable().optional(),
});

/** Update progress on one of your own goals. */
export const updateGoalAction = permissionAction(PERMISSION)
  .inputSchema(updateSchema)
  .action(async ({ parsedInput, ctx }) => {
    const filter = and(eq(journeyUserGoals.id, parsedInput.id), eq(journeyUserGoals.userId, ctx.viewer.id));
    const [before] = await db
      .select({ completedAt: journeyUserGoals.completedAt })
      .from(journeyUserGoals)
      .where(filter)
      .limit(1);
    if (!before) throw new UserFacingError("That goal isn't yours or was removed.");
    const set: Partial<typeof journeyUserGoals.$inferInsert> = {
      step: parsedInput.step,
      currentStepNote: parsedInput.currentStepNote,
      nextStepNote: parsedInput.nextStepNote,
      percentage: Math.round(((parsedInput.step - 1) / 6) * 100),
    };
    if (parsedInput.targetDate === null) set.targetDate = null;
    else if (parsedInput.targetDate) set.targetDate = new Date(`${parsedInput.targetDate}T12:00:00Z`);
    if (parsedInput.step === 7 && !before.completedAt) set.completedAt = new Date();
    if (parsedInput.step < 7) set.completedAt = null;
    await db
      .update(journeyUserGoals)
      .set({ ...set, updateCount: sql`${journeyUserGoals.updateCount} + 1` })
      .where(filter);
    revalidateJourney();
    return { id: parsedInput.id, step: parsedInput.step, completed: parsedInput.step === 7, justCompleted: parsedInput.step === 7 && !before.completedAt };
  });

/** Remove a goal from your journey (kept for the study as dismissed, like Drupal field_dismiss). */
export const dismissGoalAction = permissionAction(PERMISSION)
  .inputSchema(z.object({ id: objectId, dismissed: z.boolean().default(true) }))
  .action(async ({ parsedInput, ctx }) => {
    const result = await db
      .update(journeyUserGoals)
      .set({ dismissed: parsedInput.dismissed })
      .where(and(eq(journeyUserGoals.id, parsedInput.id), eq(journeyUserGoals.userId, ctx.viewer.id)))
      .returning({ id: journeyUserGoals.id });
    if (!result.length) throw new UserFacingError("That goal isn't yours or was removed.");
    revalidateJourney();
    return { id: parsedInput.id, dismissed: parsedInput.dismissed };
  });
