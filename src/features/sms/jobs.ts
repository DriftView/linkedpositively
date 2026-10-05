import type { InngestFunction } from "inngest";
import { inngest } from "@/server/jobs/client";
import { reconcileSchedules, sendDueMessages } from "./service";

/**
 * Sends program texts that are due. Every 5 minutes, so a message goes out
 * within 5 minutes of its slot (the old cron ran every minute but needed to
 * hit one exact minute). Each row is claimed atomically, so overlapping runs
 * and retries never double-send.
 */
const sendDue = inngest.createFunction(
  { id: "sms-send-due", triggers: [{ cron: "*/5 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => step.run("send-due-messages", () => sendDueMessages()),
);

/** Plans schedules for participants who have a start date but none yet (e.g. migrated accounts). */
const reconcile = inngest.createFunction(
  { id: "sms-reconcile-schedules", triggers: [{ cron: "17 * * * *" }] },
  async ({ step }) => step.run("reconcile", () => reconcileSchedules()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [sendDue, reconcile];
