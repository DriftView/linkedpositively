import "server-only";
import { MessageCircle } from "lucide-react";
import { can, type Viewer } from "@/server/auth/session";
import { listComments } from "../queries";
import type { CommentTarget } from "../types";
import { CommentThread } from "./comment-thread";

/**
 * <CommentSection target={{ type: "post" | "tip" | "resource", id }} viewer={viewer} title? className? />
 *
 * Server component: loads every comment on the item (oldest first) and
 * renders the interactive thread with a comment box (for people with
 * `community.post`). Comments support text with @mentions/#hashtags, one
 * photo or YouTube link, edit/delete by the author (delete also by
 * moderators), reactions and "Report as inappropriate". Deep links to
 * `#comment-<id>` scroll to and highlight the comment. Commenting on a tip
 * also puts "X commented on a thrive tip" on the wall.
 */
export async function CommentSection({
  target,
  viewer,
  title = "Comments",
  className,
}: {
  target: CommentTarget;
  viewer: Viewer;
  title?: string | null;
  className?: string;
}) {
  const comments = await listComments(target, viewer);
  return (
    <section aria-label={title ?? "Comments"} className={className} id="comments">
      {title ? (
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <MessageCircle className="size-5 text-primary" aria-hidden />
          {title}
          {comments.length ? (
            <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-semibold text-muted-foreground tabular-nums">
              {comments.length}
            </span>
          ) : null}
        </h2>
      ) : null}
      <CommentThread
        target={target}
        initialComments={comments}
        viewer={{ id: viewer.id, name: viewer.name, username: viewer.username }}
        canComment={can(viewer, "community.post")}
        variant="page"
      />
    </section>
  );
}
