import { ParticipantShell } from "@/components/app/participant-shell";
import { getShellCounts } from "@/features/notifications/counts";
import { getMyCoach } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";
import { coachingNav } from "@/server/nav";

/** Peer Navigation, participant side ("Coaching Plans", "My Coach", files, messages). */
export default async function CoachingLayout({ children }: LayoutProps<"/">) {
  const viewer = await requirePermission("peernav.participant");
  const [counts, coach] = await Promise.all([getShellCounts(viewer), getMyCoach(viewer.id)]);
  return (
    <ParticipantShell
      programName="Peer Navigation"
      nav={coachingNav(viewer, counts, { hasZoom: Boolean(coach?.zoomLink) })}
      unread={counts.unreadMessages}
      bellHref="/coaching/messages"
      user={{
        id: viewer.id,
        name: viewer.name,
        username: viewer.username,
        image: viewer.image,
        roleLabel: viewer.roleLabel,
        impersonating: Boolean(viewer.impersonatedBy),
      }}
    >
      {children}
    </ParticipantShell>
  );
}
