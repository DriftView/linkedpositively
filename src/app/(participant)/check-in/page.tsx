import Link from "next/link";
import { after } from "next/server";
import { CalendarClock, CalendarHeart, History } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { CheckinFlow } from "@/features/checkin/components/checkin-flow";
import { CheckinEmpty } from "@/features/checkin/components/checkin-empty";
import { checkinOverview } from "@/features/checkin/queries";
import { formatInZone } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "Weekly check-in" };


export default async function WeeklyCheckinPage() {
  const viewer = await requirePermission("checkin.weekly");
  const overview = await checkinOverview(viewer);
  after(() => trackUsage(viewer.id, "checkin_weekly_view"));

  const historyLink =
    overview.historyCount > 0 ? (
      <Link
        href="/check-in/history"
        className="inline-flex h-10 items-center gap-1.5 rounded-full border bg-card px-4 text-sm font-semibold shadow-soft transition hover:bg-muted"
      >
        <History className="size-4" /> Past check-ins
      </Link>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <PageHeader title="Weekly check-in" description="A few minutes each week to look back, reflect and get a little encouragement." actions={historyLink} />

      {overview.state === "due" || overview.state === "done" ? (
        <CheckinFlow
          key={overview.week.week}
          week={overview.week}
          days={overview.days}
          prompt={overview.prompt}
          answer={overview.answer}
          answered={overview.state === "done"}
          canAnswer={overview.canAnswer}
          nextOpensAt={overview.nextOpensAt}
        />
      ) : overview.state === "first-week" ? (
        <CheckinEmpty
          icon={CalendarHeart}
          title="Your first check-in is almost here"
          description={`It opens ${overview.nextOpensAt ? formatInZone(overview.nextOpensAt, "EEEE, MMMM d", viewer.timezone) : "soon"}. Until then, logging your meds and mood in the tracker each day will fill in your week.`}
          action={{ href: "/tracker", label: "Open the tracker" }}
        />
      ) : (
        <CheckinEmpty
          icon={CalendarClock}
          title="Your check-ins start with your study"
          description="Once your study begins, a short check-in will be ready for you at the end of each week."
        />
      )}
    </div>
  );
}
