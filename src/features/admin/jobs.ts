import type { InngestFunction } from "inngest";
import { inngest } from "@/server/jobs/client";
import { autoBlockExpiredParticipants } from "./lifecycle";

/**
 * Daily 150-day auto-block (legacy twm_general_cron). Runs early in the
 * morning Eastern time; safe to retry (already-blocked people are skipped).
 */
const autoBlock = inngest.createFunction(
  { id: "participant-auto-block", triggers: [{ cron: "TZ=America/New_York 30 3 * * *" }] },
  async ({ step }) => step.run("block-expired-participants", () => autoBlockExpiredParticipants()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [autoBlock];
