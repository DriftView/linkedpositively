import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import type { AiCoachId } from "@/server/db/schema/ai";
import { logger } from "@/server/logger";
import { COACHES } from "./coach-design";

/**
 * The coaches members can choose right now: those the database accepts. A new
 * coach is added in code with a migration that allows its id
 * (`ai_preferences_look_ck`); until that migration has run, choosing it would
 * fail to save, so it stays out of the picker and appears by itself once the
 * migration is applied. Read from the constraint, cached for a few minutes.
 */

const CHECK_EVERY_MS = 5 * 60 * 1000;

let cached: { ids: AiCoachId[]; at: number } | null = null;

export async function availableCoachIds(): Promise<AiCoachId[]> {
  if (cached && Date.now() - cached.at < CHECK_EVERY_MS) return cached.ids;
  try {
    const rows = await db.execute<{ definition: string }>(
      sql`select pg_get_constraintdef(oid) as definition from pg_constraint where conname = 'ai_preferences_look_ck' limit 1`,
    );
    const definition = rows[0]?.definition;
    // No such constraint: anything goes.
    const ids = definition
      ? COACHES.map((coach) => coach.id).filter((id) => definition.includes(`'${id}'`))
      : COACHES.map((coach) => coach.id);
    cached = { ids, at: Date.now() };
    return ids;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "coach availability check failed");
    return cached?.ids ?? COACHES.map((coach) => coach.id);
  }
}
