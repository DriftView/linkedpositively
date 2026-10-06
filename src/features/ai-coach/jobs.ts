import type { InngestFunction } from "inngest";
import type { AiAlertLevel } from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { deliverAlert } from "./escalation";

/**
 * Delivers AI Coach safety alerts (in-app, email, on-call text). The event
 * carries the alert id and level only. In-app notifications are deduplicated,
 * so a retry never notifies anyone twice in the app.
 */
const deliverSafetyAlert = inngest.createFunction(
  { id: "ai-safety-alert-deliver", retries: 3, triggers: [{ event: "ai/safety.alert" }] },
  async ({ event, step }) => {
    const { alertId, level } = event.data as { alertId: string; level: AiAlertLevel };
    return step.run("deliver", () => deliverAlert(alertId, level));
  },
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [deliverSafetyAlert];
