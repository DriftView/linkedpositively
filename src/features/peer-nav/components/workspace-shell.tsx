"use client";

import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Two-column coach workspace: participant list + selected participant.
 * On narrow screens only one column shows: the list at /coach, the
 * participant once one is open.
 */
export function WorkspaceShell({ list, children }: { list: React.ReactNode; children: React.ReactNode }) {
  const { participantId } = useParams<{ participantId?: string }>();
  const open = Boolean(participantId);
  return (
    <div className="grid gap-6 lg:grid-cols-[15.5rem_minmax(0,1fr)] 2xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside
        className={cn(
          "lg:sticky lg:top-20 lg:flex lg:h-[calc(100dvh-7rem)] lg:flex-col",
          open ? "max-lg:hidden" : "",
        )}
      >
        {list}
      </aside>
      <section className={cn("min-w-0", open ? "" : "max-lg:hidden")}>{children}</section>
    </div>
  );
}
