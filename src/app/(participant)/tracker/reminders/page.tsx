import Link from "next/link";
import { Smartphone } from "lucide-react";
import { ReminderCard } from "@/features/tracker/components/reminder-card";
import { getCheckinReminder, getSmsStatus, listTrackers } from "@/features/tracker/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Reminders" };

/** Every tracker reminder in one place (legacy /reminders and the profile's reminder form). */
export default async function RemindersPage() {
  const viewer = await requirePermission("tracker.use");
  const [checkin, trackers, sms] = await Promise.all([
    getCheckinReminder(viewer.id),
    listTrackers(viewer.id, viewer.timezone),
    getSmsStatus(viewer.id),
  ]);

  return (
    <div className="space-y-7">
      {!sms.hasPhone ? (
        <p className="flex items-start gap-2.5 rounded-2xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Want reminders by text?{" "}
            <Link href="/profile" className="font-medium text-primary underline underline-offset-4">
              Add your mobile number
            </Link>{" "}
            to your profile first.
          </span>
        </p>
      ) : null}

      <section aria-labelledby="checkin-reminder" className="animate-rise space-y-3">
        <h2 id="checkin-reminder" className="text-lg font-semibold">
          Daily check-in
        </h2>
        <ReminderCard
          title="Meds & mood check-in"
          reminder={checkin}
          target={{ type: "checkin" }}
          sms={sms}
          timezone={viewer.timezone}
        />
      </section>

      <section aria-labelledby="tracker-reminders" className="animate-rise space-y-3 [animation-delay:60ms]">
        <h2 id="tracker-reminders" className="text-lg font-semibold">
          My trackers
        </h2>
        {trackers.length ? (
          <div className="divide-y rounded-2xl border bg-card px-4 shadow-soft sm:px-5">
            {trackers.map((tracker) => (
              <ReminderCard
                key={tracker.id}
                bare
                className="py-4"
                title={tracker.label}
                reminder={tracker.reminder}
                target={{ type: "tracker", trackerId: tracker.id, textPlaceholder: tracker.question }}
                sms={sms}
                timezone={viewer.timezone}
              />
            ))}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
            You don&apos;t have any personal trackers yet.{" "}
            <Link href="/tracker/personal/new" className="font-medium text-primary underline underline-offset-4">
              Create one
            </Link>{" "}
            to get reminders for it.
          </p>
        )}
      </section>
    </div>
  );
}
