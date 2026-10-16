import { ParticipantShell } from "@/components/app/participant-shell";
import { ColorThemeScope } from "@/features/gamification/components/color-theme-scope";
import { LevelUpGate } from "@/features/gamification/components/level-up-gate";
import { getColorThemeFor } from "@/features/gamification/queries";
import { getShellCounts } from "@/features/notifications/counts";
import { can, requireViewer } from "@/server/auth/session";
import { coachingNav, participantNav } from "@/server/nav";

/**
 * Account pages (/settings) for the member portal, inside the shell they
 * normally use: Link Positively members get the participant app, Peer
 * Navigation-only participants the coaching area. Staff have /account.
 */
export default async function AccountLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  const counts = await getShellCounts(viewer);
  const user = {
    id: viewer.id,
    name: viewer.name,
    username: viewer.username,
    image: viewer.image,
    roleLabel: viewer.roleLabel,
    impersonating: Boolean(viewer.impersonatedBy),
  };

  if (can(viewer, "lp.access")) {
    return (
      <ColorThemeScope theme={await getColorThemeFor(viewer.id)}>
        <ParticipantShell programName="Link Positively" nav={participantNav(viewer, counts)} unread={counts.notifications} user={user}>
          {children}
          {can(viewer, "gamification.earn") ? <LevelUpGate userId={viewer.id} /> : null}
        </ParticipantShell>
      </ColorThemeScope>
    );
  }

  return (
    <ParticipantShell
      programName="Peer Navigation"
      nav={coachingNav(viewer, counts)}
      unread={counts.unreadMessages}
      bellHref="/coaching/messages"
      user={user}
    >
      {children}
    </ParticipantShell>
  );
}
