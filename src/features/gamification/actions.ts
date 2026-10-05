"use server";

import { revalidatePath } from "next/cache";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { authedAction, permissionAction } from "@/server/actions/safe-action";
import { db } from "@/server/db/client";
import { gamificationStates, levelCopy } from "@/server/db/schema";
import { LEVELS, levelForPoints } from "./levels";
import { totalPoints } from "./points";
import { getPointHistory } from "./queries";

/** Marks the level-up celebration as seen (never beyond the level actually reached). */
export const acknowledgeLevelUp = authedAction
  .inputSchema(z.object({ level: z.number().int().min(1).max(LEVELS.length) }))
  .action(async ({ parsedInput, ctx }) => {
    const reached = levelForPoints(await totalPoints(ctx.viewer.id)).level;
    const level = Math.min(parsedInput.level, reached);
    await db
      .insert(gamificationStates)
      .values({ userId: ctx.viewer.id, celebratedLevel: level })
      .onConflictDoUpdate({
        target: gamificationStates.userId,
        set: { celebratedLevel: sql`greatest(${gamificationStates.celebratedLevel}, excluded.celebrated_level)` },
      });
    return { level };
  });

const levelCopySchema = z.object({
  level: z.number().int().min(1).max(LEVELS.length),
  headline: z.string().trim().min(1, "Add a headline.").max(300),
  description: z.string().trim().max(600),
});

/** Saves the wording for one level (legacy admin/config/system/levels-description). */
export const saveLevelCopy = permissionAction("content.manage")
  .inputSchema(levelCopySchema)
  .action(async ({ parsedInput, ctx }) => {
    const set = {
      headline: parsedInput.headline,
      description: parsedInput.description,
      updatedBy: ctx.viewer.id,
    };
    const [row] = await db
      .insert(levelCopy)
      .values({ level: parsedInput.level, ...set })
      .onConflictDoUpdate({ target: levelCopy.level, set })
      .returning({ updatedAt: levelCopy.updatedAt });
    revalidatePath("/levels");
    revalidatePath("/admin/content/levels");
    return { level: parsedInput.level, updatedAt: row?.updatedAt ? row.updatedAt.toISOString() : null };
  });

/** Next page of the viewer's own points history. */
export const loadPointHistory = authedAction
  .inputSchema(z.object({ before: z.string().max(80) }))
  .action(async ({ parsedInput, ctx }) => getPointHistory(ctx.viewer.id, { before: parsedInput.before, limit: 20 }));
