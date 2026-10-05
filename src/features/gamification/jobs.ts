import type { InngestFunction } from "inngest";
import { inngest } from "@/server/jobs/client";
import { awardTimeOnSite } from "./time-on-site";

/**
 * Time-on-site points (legacy P9, `youthrive_timeonsite_cron`). Runs hourly
 * and credits each participant for their previous local day, at most once
 * per day (keyed), so a missed or repeated run never loses or doubles points.
 */
const timeOnSitePoints = inngest.createFunction(
  { id: "time-on-site-points", triggers: [{ cron: "15 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => step.run("award", async () => awardTimeOnSite()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [timeOnSitePoints];
