import Link from "next/link";
import { Plus, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { MAX_ACTIVE_TRACKERS } from "@/features/tracker/kinds";
import { TrackerList } from "@/features/tracker/components/tracker-list";
import { listTrackers } from "@/features/tracker/queries";
import { requirePermission } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "My trackers" };

export default async function PersonalTrackersPage() {
  const viewer = await requirePermission("tracker.use");
  const trackers = await listTrackers(viewer.id, viewer.timezone);
  await trackUsage(viewer.id, "tracker_view", { tracker: "personal" });

  if (!trackers.length) {
    return (
      <Empty className="animate-rise rounded-2xl border border-dashed bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia className="grid size-14 place-items-center rounded-2xl bg-brand-apricot/25 text-foreground dark:text-brand-apricot">
            <Target className="size-7" />
          </EmptyMedia>
          <EmptyTitle className="font-heading text-xl">Track what matters to you</EmptyTitle>
          <EmptyDescription>
            PrEP, hormones, a daily walk: pick something and answer one yes-or-no question each day. We can remind you,
            too.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild className="h-11 rounded-full px-6 text-[0.95rem]">
            <Link href="/tracker/personal/new">
              <Plus data-icon="inline-start" />
              Create a tracker
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const full = trackers.length >= MAX_ACTIVE_TRACKERS;
  const answered = trackers.filter((tracker) => tracker.today !== null).length;
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{answered}</span> of {trackers.length} answered today
        </p>
        {full ? null : (
          <Button asChild className="h-10 rounded-full px-4">
            <Link href="/tracker/personal/new">
              <Plus data-icon="inline-start" />
              New tracker
            </Link>
          </Button>
        )}
      </div>
      <TrackerList trackers={trackers} />
      {full ? (
        <p className="text-center text-sm text-muted-foreground">
          You&apos;re tracking {MAX_ACTIVE_TRACKERS} things, the most at once. Stop one to add another.
        </p>
      ) : null}
    </div>
  );
}
