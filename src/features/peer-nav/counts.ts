import "server-only";
import type { Viewer } from "@/server/auth/session";
import { logger } from "@/server/logger";
import { countUnread } from "./messages";

/** Unread Peer Navigation messages for the viewer (shell badge). Never throws. */
export async function unreadMessagesCount(viewer: Viewer) {
  try {
    return await countUnread(viewer.id);
  } catch (error) {
    logger.warn({ userId: viewer.id, err: (error as Error).message }, "unread messages count failed");
    return 0;
  }
}
