import { History } from "lucide-react";
import { requireParticipantAccess } from "@/features/peer-nav/access";
import { StatusPill } from "@/features/peer-nav/components/bits";
import { SessionPlanEditor } from "@/features/peer-nav/components/session-plan-editor";
import { getSessionPlan } from "@/features/peer-nav/queries";
import { formatInZone } from "@/lib/dates";
import { requirePermission } from "@/server/auth/session";

export const metadata = { title: "Sessions" };

export default async function ParticipantSessionsPage({ params }: PageProps<"/coach/[participantId]/sessions">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId } = await params;
  await requireParticipantAccess(viewer, participantId);
  const { plan, legacy } = await getSessionPlan(participantId);

  return (
    <div className="space-y-8">
      <SessionPlanEditor participantId={participantId} sessions={plan} timezone={viewer.timezone} />

      {legacy.length ? (
        <details className="group rounded-2xl border bg-muted/40 p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <History aria-hidden className="size-4 text-muted-foreground" />
            Earlier program sessions ({legacy.length})
            <span className="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">Show</span>
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">
            These sessions belong to the curriculum used before 2021. They&apos;re kept as read-only history.
          </p>
          <ul className="mt-3 divide-y rounded-xl border bg-card">
            {legacy.map((s) => (
              <li key={s.serial} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium">Session {s.serial}</span>
                <StatusPill status={s.status} className="h-5 px-1.5 text-[0.7rem]" />
                <span className="ml-auto text-xs text-muted-foreground">
                  {s.completedAt
                    ? `Completed ${formatInZone(s.completedAt, "MMM d, yyyy", viewer.timezone)}`
                    : s.startedAt
                      ? `Started ${formatInZone(s.startedAt, "MMM d, yyyy", viewer.timezone)}`
                      : "Not started"}
                  {s.revisionCount ? ` · ${s.revisionCount} ${s.revisionCount === 1 ? "save" : "saves"}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
