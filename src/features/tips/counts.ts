import "server-only";
import type { Viewer } from "@/server/auth/session";
import { logger } from "@/server/logger";
import { countNewTips } from "./queries";

/**
 * "Your Tips | N New Tips": tips released to the viewer since they last opened
 * Your Tips (profile.lastTipsSeenAt). The old site showed today's count even
 * after the tips were read. Never throws (it runs in the shell layout).
 */
export async function tipsNewCount(viewer: Viewer) {
  try {
    return await countNewTips(viewer);
  } catch (error) {
    logger.warn({ userId: viewer.id, err: (error as Error).message }, "tipsNewCount failed");
    return 0;
  }
}
