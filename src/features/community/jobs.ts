import type { InngestFunction } from "inngest";
import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { communityUploads } from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { logger } from "@/server/logger";
import { deleteFile } from "@/server/services/storage";

/**
 * Deletes composer photos that were uploaded but never posted (older than a
 * day). The old site's temporary files were cleaned by Drupal cron.
 */
export async function cleanOrphanUploads(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const orphans = await db
    .select({ id: communityUploads.id, key: communityUploads.key })
    .from(communityUploads)
    .where(and(isNull(communityUploads.attachedAt), lt(communityUploads.createdAt, cutoff)))
    .limit(500);
  let removed = 0;
  for (const upload of orphans) {
    try {
      await deleteFile(upload.key);
      await db.delete(communityUploads).where(eq(communityUploads.id, upload.id));
      removed++;
    } catch (error) {
      logger.warn({ uploadId: upload.id, err: (error as Error).message }, "orphan upload cleanup failed");
    }
  }
  return { removed };
}

const orphanUploads = inngest.createFunction(
  { id: "community-orphan-uploads", triggers: [{ cron: "TZ=America/New_York 30 3 * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => step.run("clean", () => cleanOrphanUploads()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [orphanUploads];
