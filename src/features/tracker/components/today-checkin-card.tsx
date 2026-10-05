import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { formatInZone } from "@/lib/dates";
import { can, type Viewer } from "@/server/auth/session";
import { streaks } from "../calendar-math";
import { getCheckinCalendar, getTodayCheckin } from "../queries";
import { DailyCheckin } from "./daily-checkin";

/**
 * TodayCheckinCard({ viewer }) — server component for the home page.
 *
 * Shows today's daily check-in (meds yes/no + mood) with one-tap, optimistic
 * answers and points, folding into a summary once done, plus the current
 * streak and a link to the full calendar at /tracker. Renders nothing for
 * viewers without the `tracker.use` permission (staff, control arm).
 */
export async function TodayCheckinCard({ viewer }: { viewer: Viewer }) {
  if (!can(viewer, "tracker.use")) return null;
  const now = new Date();
  const [today, recent] = await Promise.all([
    getTodayCheckin(viewer.id, viewer.timezone),
    getCheckinCalendar(viewer.id, { from: new Date(now.getTime() - 120 * 86_400_000), to: now, timezone: viewer.timezone }),
  ]);
  const streak = streaks(
    recent.map((day) => day.date),
    today.day,
  ).current;

  return (
    <section
      aria-labelledby="today-checkin-title"
      className="animate-rise rounded-2xl border bg-card p-4 shadow-soft sm:p-6"
    >
      <div className="mb-5 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-magenta uppercase">
            {formatInZone(now, "EEEE, MMM d", viewer.timezone)}
          </p>
          <h2 id="today-checkin-title" className="mt-0.5 text-xl font-semibold">
            Daily check-in
          </h2>
        </div>
        {streak > 1 ? (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-brand-apricot/20 px-2.5 py-1 text-xs font-semibold tabular-nums">
            <Flame className="size-3.5 text-brand-magenta" aria-hidden />
            {streak}-day streak
          </span>
        ) : null}
      </div>

      <DailyCheckin initial={today} compact />

      <div className="mt-5 border-t pt-3.5">
        <Link
          href="/tracker"
          className="group inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          See your calendar
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    </section>
  );
}
