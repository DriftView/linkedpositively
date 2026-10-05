import { redirect } from "next/navigation";
import { ParticipantShell } from "@/components/app/participant-shell";
import { ColorThemeScope } from "@/features/gamification/components/color-theme-scope";
import { LevelUpGate } from "@/features/gamification/components/level-up-gate";
import { getColorThemeFor } from "@/features/gamification/queries";
import { SurveyPrompt } from "@/features/surveys/components/survey-prompt";
import { getShellCounts } from "@/features/notifications/counts";
import { can, requireViewer } from "@/server/auth/session";
import { participantNav } from "@/server/nav";

/** Link Positively participant app. Staff with app access can use it too. */
export default async function ParticipantLayout({ children }: LayoutProps<"/">) {
  const viewer = await requireViewer();
  if (!can(viewer, "lp.access")) {
    if (can(viewer, "peernav.participant")) redirect("/coaching");
    if (can(viewer, "peernav.coach")) redirect("/coach");
    if (can(viewer, "admin.access")) redirect("/admin");
  }

  const [counts, theme] = await Promise.all([getShellCounts(viewer), getColorThemeFor(viewer.id)]);
  return (
    <ColorThemeScope theme={theme}>
      <ParticipantShell
        programName="Link Positively"
        nav={participantNav(viewer, counts)}
        unread={counts.notifications}
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
        {can(viewer, "gamification.earn") ? <LevelUpGate userId={viewer.id} /> : null}
        <SurveyPrompt />
      </ParticipantShell>
    </ColorThemeScope>
  );
}
