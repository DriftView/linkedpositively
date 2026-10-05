import { after } from "next/server";
import { PageHeader } from "@/components/app/page-header";
import { NotificationList } from "@/features/notifications/components/notification-list";
import { listNotifications, markNotificationsSeen } from "@/features/notifications/queries";
import { lastNotificationsSeen, unreadNotificationsCount } from "@/features/notifications/unread";
import { requireViewer } from "@/server/auth/session";

export const metadata = { title: "Notifications" };

/** "Your Notifications | N New" (legacy /all-comments). Opening it resets the bell. */
export default async function NotificationsPage() {
  const viewer = await requireViewer();
  const seen = await lastNotificationsSeen(viewer.id);
  const [unread, { items, nextCursor }] = await Promise.all([
    unreadNotificationsCount(viewer),
    listNotifications(viewer, { seen }),
  ]);
  after(() => markNotificationsSeen(viewer.id));

  return (
    <div>
      <PageHeader
        title="Your notifications"
        count={unread}
        description="Comments, reactions, tags and messages from the study team."
      />
      <NotificationList initialItems={items} initialCursor={nextCursor} seen={seen?.toISOString() ?? null} />
    </div>
  );
}
