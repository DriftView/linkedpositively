import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TrackerDetail } from "@/features/tracker/components/tracker-detail";
import { getSmsStatus, getTracker } from "@/features/tracker/queries";
import { requirePermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "Tracker" };

export default async function TrackerPage({ params }: PageProps<"/tracker/personal/[id]">) {
  const viewer = await requirePermission("tracker.use");
  const { id } = await params;
  // getTracker only returns the viewer's own, active trackers.
  const [data, sms] = await Promise.all([getTracker(viewer.id, id, viewer.timezone), getSmsStatus(viewer.id)]);
  if (!data) notFound();
  await trackUsage(viewer.id, "tracker_view", { tracker: "personal-detail" });

  return (
    <div>
      <Link
        href="/tracker/personal"
        className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeft className="size-4" aria-hidden />
        My trackers
      </Link>
      <TrackerDetail tracker={data.tracker} days={data.days} today={data.today} since={data.since} sms={sms} timezone={viewer.timezone} />
    </div>
  );
}
