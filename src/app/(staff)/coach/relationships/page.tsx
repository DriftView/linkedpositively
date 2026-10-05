import { PageHeader } from "@/components/app/page-header";
import { assignmentHistory, listAssignments } from "@/features/peer-nav/assignments";
import { AssignmentBoard } from "@/features/peer-nav/components/assignment-board";
import { listCoaches } from "@/features/peer-nav/queries";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Coach assignments" };

/** Coordinator-only: pair participants with peer navigators (legacy /create-relationship). */
export default async function CoachAssignmentsPage() {
  const viewer = await requirePermission("peernav.assignCoach");
  const [rows, coaches, history] = await Promise.all([listAssignments(), listCoaches(), assignmentHistory()]);
  return (
    <div className="animate-rise">
      <PageHeader
        title="Coach assignments"
        description="Choose each participant's peer navigator. Both people are notified, and the new coach can open the participant right away."
      />
      <AssignmentBoard rows={rows} coaches={coaches} history={history} timezone={viewer.timezone} />
    </div>
  );
}
