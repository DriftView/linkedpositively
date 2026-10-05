import "server-only";
import { MessageSquareText } from "lucide-react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { can, type Viewer } from "@/server/auth/session";
import { buildFeed } from "../feed";
import { Feed } from "./feed";

/**
 * <UserPostList userId={string} viewer={viewer} name?={string} />
 *
 * Server component for profile pages: that person's wall posts (newest
 * first, infinite scroll) with the usual reactions and comments. On your own
 * profile it also shows the "What's on your mind?" composer. Renders
 * nothing for viewers without community access.
 */
export async function UserPostList({ userId, viewer, name }: { userId: string; viewer: Viewer; name?: string }) {
  if (!can(viewer, "community.post")) return null;
  const own = userId === viewer.id;
  const { items, nextCursor } = await buildFeed(viewer, { authorId: userId });
  return (
    <Feed
      initialItems={items}
      initialCursor={nextCursor}
      viewer={{ id: viewer.id, name: viewer.name, username: viewer.username }}
      query={{ authorId: userId }}
      canPost={own && can(viewer, "community.post")}
      endLabel="That's every post"
      empty={
        <Empty className="rounded-2xl border bg-card/60">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="size-11 rounded-full bg-secondary text-primary">
              <MessageSquareText className="size-5" />
            </EmptyMedia>
            <EmptyTitle className="text-base">{own ? "You haven't posted yet" : "No posts yet"}</EmptyTitle>
            <EmptyDescription>
              {own
                ? "Share how you're doing. Your posts appear here and on the wall."
                : `When ${name ?? "they"} share${name ? "s" : ""} something on the wall, it'll show up here.`}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      }
    />
  );
}
