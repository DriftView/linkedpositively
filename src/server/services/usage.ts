import "server-only";
import { logger } from "@/server/logger";
import { db } from "@/server/db/client";
import { usageEvents } from "@/server/db/schema";

/**
 * Usage event types recorded for the study reports. Add new types here so
 * reports can list them.
 */
export const USAGE_TYPES = [
  "wall_view",
  "tips_view",
  "tip_open",
  "tracker_view",
  "resource_view",
  "resource_search",
  "profile_edit",
  "profile_avatar",
  "content_warning_open",
  "search",
  "glossary_view",
  "page_view",
  "sms_click",
  "survey_open",
  "checkin_weekly_view",
  "peernav_view",
] as const;
export type UsageType = (typeof USAGE_TYPES)[number];

/** Records a usage event. Never throws. `meta` must not contain free text or health data. */
export async function trackUsage(userId: string, type: UsageType, meta?: Record<string, string | number | boolean>) {
  try {
    await db.insert(usageEvents).values({ userId, type, meta });
  } catch (error) {
    logger.warn({ userId, type, err: (error as Error).message }, "usage event failed");
  }
}
