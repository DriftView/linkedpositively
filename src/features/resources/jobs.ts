import type { InngestFunction } from "inngest";
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { resources } from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { geocodeResource, geocodingEnabled } from "./geocode";

/**
 * Geocodes resources still waiting for coordinates (after a CSV import, or
 * when the Geocoding API was down). Runs on demand and nightly. Idempotent:
 * each run picks up whatever is still pending.
 */
const geocodePending = inngest.createFunction(
  {
    id: "resources-geocode-pending",
    concurrency: { limit: 1 },
    triggers: [{ event: "resources/geocode.pending" }, { cron: "TZ=America/New_York 30 3 * * *" }],
  },
  async ({ step }) => {
    if (!geocodingEnabled()) return { skipped: "no GOOGLE_MAPS_API_KEY" };
    let done = 0;
    for (let batch = 0; batch < 20; batch++) {
      const processed = await step.run(`batch-${batch}`, async () => {
        const pending = await db.select({ id: resources.id }).from(resources).where(eq(resources.geocodeStatus, "pending")).limit(25);
        for (const resource of pending) await geocodeResource(resource.id);
        return pending.length;
      });
      done += processed;
      if (processed < 25) break;
    }
    return { geocoded: done };
  },
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [geocodePending];
