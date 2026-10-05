import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db/client";
import { appSettings } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { DEFAULT_SETTINGS, SETTING_KEYS, settingsSchema, type AppSettings } from "./settings-schema";

/** Current settings merged over the defaults. Invalid stored values fall back to the default. */
export const getSettings = cache(async (): Promise<AppSettings> => {
  const rows = await db
    .select({ key: appSettings.key, value: appSettings.value })
    .from(appSettings)
    .where(inArray(appSettings.key, [...SETTING_KEYS]));
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const row of rows) merged[row.key] = row.value;
  const parsed = settingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  logger.warn(
    { issues: parsed.error.issues.map((issue) => issue.path.join(".")) },
    "invalid stored settings, using defaults",
  );
  const safe: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const key of SETTING_KEYS) {
    const single = settingsSchema.shape[key].safeParse(merged[key]);
    if (single.success) safe[key] = single.data;
  }
  return safe as AppSettings;
});

/** Saves the given settings; returns the keys that changed. */
export async function saveSettings(values: AppSettings, actorId: string) {
  const current = await getSettings();
  const changed = SETTING_KEYS.filter((key) => current[key] !== values[key]);
  if (changed.length) {
    await db
      .insert(appSettings)
      .values(changed.map((key) => ({ key, value: values[key], updatedBy: actorId })))
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: sql`excluded.value`, updatedBy: sql`excluded.updated_by`, updatedAt: new Date() },
      });
  }
  return changed;
}

/** Small job state (e.g. last sync time) kept next to the settings. */
export async function getJobState<T>(key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, `job:${key}`))
    .limit(1);
  return (row?.value as T | undefined) ?? null;
}

export async function setJobState(key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key: `job:${key}`, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: new Date() } });
}
