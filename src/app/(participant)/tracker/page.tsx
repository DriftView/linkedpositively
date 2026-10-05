import { formatInZone } from "@/lib/dates";
import { CheckinCalendar } from "@/features/tracker/components/checkin-calendar";
import { DailyCheckin } from "@/features/tracker/components/daily-checkin";
import { ReminderCard } from "@/features/tracker/components/reminder-card";
import { getCheckinOverview } from "@/features/tracker/queries";
import { requirePermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "Daily check-in" };

export default async function DailyCheckinPage() {
  const viewer = await requirePermission("tracker.use");
  const { today, days, reminder, sms } = await getCheckinOverview(viewer.id, viewer.timezone);
  await trackUsage(viewer.id, "tracker_view", { tracker: "checkin" });

  return (
    <div className="space-y-8">
      <section aria-labelledby="today-title" className="animate-rise rounded-2xl border bg-card p-4 shadow-soft sm:p-6">
        <p className="text-xs font-semibold tracking-wide text-brand-magenta uppercase">
          {formatInZone(new Date(), "EEEE, MMMM d", viewer.timezone)}
        </p>
        <h2 id="today-title" className="mt-0.5 mb-5 text-xl font-semibold">
          Today
        </h2>
        <DailyCheckin initial={today} />
      </section>

      <section aria-labelledby="calendar-title" className="animate-rise [animation-delay:60ms]">
        <h2 id="calendar-title" className="mb-3 text-xl font-semibold">
          Your month
        </h2>
        <CheckinCalendar days={days} today={today.day} live />
      </section>

      <section aria-labelledby="reminder-title" className="animate-rise [animation-delay:120ms]">
        <h2 id="reminder-title" className="mb-3 text-xl font-semibold">
          Reminder
        </h2>
        <ReminderCard
          title="Daily check-in reminder"
          reminder={reminder}
          target={{ type: "checkin" }}
          sms={sms}
          timezone={viewer.timezone}
        />
      </section>
    </div>
  );
}
