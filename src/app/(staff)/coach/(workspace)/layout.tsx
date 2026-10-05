import { ParticipantList } from "@/features/peer-nav/components/participant-list";
import { WorkspaceShell } from "@/features/peer-nav/components/workspace-shell";
import { listParticipants } from "@/features/peer-nav/queries";
import { can, requirePermission } from "@/server/auth/session";

/** Coach dashboard (legacy /dashboard): participant list + selected participant workspace. */
export default async function CoachWorkspaceLayout({ children }: LayoutProps<"/coach">) {
  const viewer = await requirePermission("peernav.coach");
  const participants = await listParticipants(viewer);
  const all = can(viewer, "peernav.allParticipants");
  return (
    <WorkspaceShell list={<ParticipantList participants={participants} showCoach={all} scopeLabel={all ? "in the program" : "assigned to you"} />}>
      {children}
    </WorkspaceShell>
  );
}
