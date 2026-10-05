import type { InngestFunction } from "inngest";
import { inngest } from "@/server/jobs/client";
import { sendDueReminders } from "./reminders";

/**
 * Tracker reminders (legacy Elysia cron jobs `tracking_sms` and
 * `med_tracking_sms`). Runs every 15 minutes; each participant's reminders
 * are evaluated in their own timezone and every slot is sent at most once
 * (see reminders.ts), so retries and overlapping runs are safe.
 */
const trackerReminders = inngest.createFunction(
  { id: "tracker-reminders", triggers: [{ cron: "*/15 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => step.run("send-due-reminders", () => sendDueReminders()),
);

/** Background jobs of this feature, registered in app/api/inngest/route.ts. */
export const jobs: InngestFunction.Any[] = [trackerReminders];
