import "server-only";
import { Sparkles } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { can, type Viewer } from "@/server/auth/session";
import { buildFeed } from "../feed";
import { Feed } from "./feed";

/** The home wall: composer + everyone's posts with Thrive Tips woven in. */
export async function WallFeed({ viewer, since }: { viewer: Viewer; since: Date | null }) {
  const { items, nextCursor } = await buildFeed(viewer, { lastVisit: since, withTips: true });
  const canPost = can(viewer, "community.post");
  return (
    <Feed
      initialItems={items}
      initialCursor={nextCursor}
      viewer={{ id: viewer.id, name: viewer.name, username: viewer.username }}
      since={since?.toISOString() ?? null}
      canPost={canPost}
      empty={
        <Empty className="rounded-2xl border bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-12 rounded-full bg-secondary text-primary">
              <Sparkles className="size-5" />
            </EmptyMedia>
            <EmptyTitle className="text-base">The wall is quiet right now</EmptyTitle>
            <EmptyDescription>
              {canPost
                ? "Be the first to share something. A thought, a win, a question: it all counts."
                : "Posts from the community will show up here."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
