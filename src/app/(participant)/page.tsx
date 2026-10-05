import { after } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckinDueCard } from "@/features/checkin/components/checkin-due-card";
import { ControlHome } from "@/features/community/components/control-home";
import { PostSkeleton } from "@/features/community/components/feed";
import { WallFeed } from "@/features/community/components/wall-feed";
import { lastWallVisit, markWallVisited, wallNewCount } from "@/features/community/counts";
import { HomeMessages } from "@/features/notifications/components/home-messages";
import { ensureStudyMessagesFor } from "@/features/notifications/jobs";
import { homeMessages } from "@/features/notifications/queries";
import { TodayCheckinCard } from "@/features/tracker/components/today-checkin-card";
import { can, requireViewer } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export const metadata = { title: "Your wall" };

/** Home = "Your Wall" (legacy /drupal-wall): messages, today's check-in, composer and the community feed. */
export default async function HomePage({ searchParams }: PageProps<"/">) {
  const viewer = await requireViewer();
  const { denied } = await searchParams;
  const deniedAlert = denied ? (
    <Alert className="mb-5 rounded-2xl">
      <AlertDescription>That page isn&apos;t available to your account, so we brought you home.</AlertDescription>
    </Alert>
  ) : null;

  const firstName = viewer.name.split(" ")[0];
  if (!can(viewer, "community.post") && !can(viewer, "tips.view")) {
    return (
      <>
        {deniedAlert}
        <ControlHome name={firstName} />
      </>
    );
  }

  await ensureStudyMessagesFor(viewer.id, firstName);
  const [since, fresh, messages] = await Promise.all([
    lastWallVisit(viewer.id),
    wallNewCount(viewer),
    homeMessages(viewer),
  ]);
  after(async () => {
    await markWallVisited(viewer.id);
    await trackUsage(viewer.id, "wall_view");
  });

  return (
    <div className="space-y-5">
      {deniedAlert}
      <HomeMessages initialItems={messages.items} total={messages.total} />
      <PageHeader
        className="mb-0"
        title="Your wall"
        count={fresh}
        description={
          fresh
            ? `Hi ${firstName}! Here's what the community shared since your last visit.`
            : `Hi ${firstName}! See what the community is sharing, and share how you're doing.`
        }
      />
      {can(viewer, "checkin.weekly") ? (
        <Suspense fallback={null}>
          <CheckinDueCard viewer={viewer} className="mb-4" />
        </Suspense>
      ) : null}
      <Suspense fallback={null}>
        <TodayCheckinCard viewer={viewer} />
      </Suspense>
      <Suspense
        fallback={
          <div className="space-y-4">
            <PostSkeleton />
            <PostSkeleton />
          </div>
        }
      >
        <WallFeed viewer={viewer} since={since} />
      </Suspense>
    </div>
  );
}
