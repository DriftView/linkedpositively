import Link from "next/link";
import { ChevronLeft, Video } from "lucide-react";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { requireParticipantAccess } from "@/features/peer-nav/access";
import { ProgressRing } from "@/features/peer-nav/components/bits";
import { EditParticipantDialog } from "@/features/peer-nav/components/edit-participant-dialog";
import { ParticipantTabs, type ParticipantTab } from "@/features/peer-nav/components/participant-tabs";
import { getOwnZoomLink, getParticipantDetail, listParticipants, participantTabCounts } from "@/features/peer-nav/queries";
import { can, requirePermission } from "@/server/auth/session";
import { notFound } from "next/navigation";

export default async function ParticipantWorkspaceLayout({ children, params }: LayoutProps<"/coach/[participantId]">) {
  const viewer = await requirePermission("peernav.coach");
  const { participantId } = await params;
  const access = await requireParticipantAccess(viewer, participantId);
  const [detail, counts, zoomLink, participants] = await Promise.all([
    getParticipantDetail(access),
    participantTabCounts(viewer.id, participantId),
    getOwnZoomLink(viewer.id),
    listParticipants(viewer),
  ]);
  if (!detail) notFound();
  const listItem = participants.find((p) => p.id === participantId);
  const completed = listItem?.completed ?? 0;
  const unread = listItem?.unread ?? 0;

  const tabs: ParticipantTab[] = [
    { key: "details", label: "Details" },
    { key: "sessions", label: "Sessions", count: completed || undefined },
    { key: "files", label: "Files", count: counts.files || undefined },
    { key: "notes", label: "Notes", count: counts.notes || undefined },
  ];
  if (can(viewer, "peernav.messages") && (access.isAssignedCoach || counts.hasThreads)) {
    tabs.push({ key: "messages", label: "Messages", count: unread || undefined, highlight: unread > 0 });
  }
  tabs.push({ key: "tracker", label: "Tracker" });

  return (
    <div className="@container animate-rise">
      <Link
        href="/coach"
        className="mb-3 inline-flex items-center gap-1 rounded-md text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 lg:hidden"
      >
        <ChevronLeft aria-hidden className="size-4" />
        All participants
      </Link>
      <header className="rounded-2xl border bg-card px-5 pt-5 shadow-soft">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <UserAvatar userId={detail.id} name={detail.name} size="lg" version={detail.avatarVersion ?? undefined} />
          <div className="min-w-[12rem] flex-1">
            <h1 className="flex flex-wrap items-baseline gap-x-2 text-2xl font-semibold">
              {detail.name}
              {detail.pronouns ? <span className="font-sans text-sm font-normal text-muted-foreground">{detail.pronouns}</span> : null}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span>@{detail.username}</span>
              <span aria-hidden>·</span>
              <span>{detail.coach ? (access.isAssignedCoach ? "Your participant" : `Coach: ${detail.coach.name}`) : "No coach assigned"}</span>
              {detail.blocked ? <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">Blocked</span> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 @2xl:gap-3">
            <div className="flex items-center gap-2 pr-1 max-sm:hidden @max-3xl:hidden">
              <ProgressRing value={completed} total={6} size={38}>
                <span className="text-[0.65rem] font-semibold tabular-nums">{completed}/6</span>
              </ProgressRing>
              <span className="text-xs leading-tight text-muted-foreground">
                sessions
                <br />
                complete
              </span>
            </div>
            {zoomLink ? (
              <Button asChild variant="secondary" size="lg">
                <a href={zoomLink} target="_blank" rel="noopener noreferrer">
                  <Video aria-hidden />
                  Launch Zoom
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Button>
            ) : null}
            {can(viewer, "peernav.editParticipant") ? <EditParticipantDialog participant={detail} /> : null}
          </div>
        </div>
        <div className="mt-4">
          <ParticipantTabs participantId={participantId} tabs={tabs} />
        </div>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}
