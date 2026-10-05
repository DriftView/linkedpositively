"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, Lightbulb, MessageCircle, TriangleAlert } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { deletePost, openContentWarning, reportContent } from "../actions";
import { postHref, profileHref } from "../links";
import type { PostDTO, ViewerDTO } from "../types";
import { CommentThread, type CommentThreadHandle } from "./comment-thread";
import { ContentMenu, TimeAgo } from "./content-menu";
import { PostPhoto, YouTubeEmbed } from "./media";
import { PostComposer } from "./post-composer";
import { ReactionBar } from "./reaction-bar";
import { richTextClass } from "./rich-text-styles";

/**
 * A wall post: author, text (with a folded content warning when it has a
 * headline), photo or YouTube video, reactions, and its comments.
 */
export function PostCard({
  post: initial,
  viewer,
  variant = "feed",
  onDeleted,
  defaultEditing = false,
  className,
}: {
  post: PostDTO;
  viewer: ViewerDTO;
  variant?: "feed" | "page";
  onDeleted?: (id: string) => void;
  /** Open straight in edit mode (legacy /post/{nid}/edit links). */
  defaultEditing?: boolean;
  className?: string;
}) {
  const [post, setPost] = useState(initial);
  const [editing, setEditing] = useState(defaultEditing && initial.canEdit);
  const [removed, setRemoved] = useState(false);
  const [reported, setReported] = useState(initial.reported);
  const [commentCount, setCommentCount] = useState(initial.comments.length || initial.commentCount);
  const threadRef = useRef<CommentThreadHandle>(null);
  const moderatorDelete = post.canDelete && post.author.id !== viewer.id;

  async function remove() {
    const result = await deletePost({ id: post.id });
    if (result?.data?.deleted) {
      toast.success("Post deleted");
      setRemoved(true);
      onDeleted?.(post.id);
      return true;
    }
    toast.error(result?.serverError ?? "Couldn't delete that post.");
    return false;
  }

  async function report() {
    const result = await reportContent({ type: "post", id: post.id });
    if (result?.data?.reported) {
      setReported(true);
      toast.success("Thanks for letting us know. The study team will take a look.");
      return true;
    }
    toast.error(result?.serverError ?? "Couldn't send your report.");
    return false;
  }

  return (
    <AnimatePresence initial={false}>
      {removed ? null : (
        <motion.article
          layout="position"
          exit={{ opacity: 0, scale: 0.97, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.25 }}
          aria-labelledby={`post-${post.id}-author`}
          className={cn("overflow-hidden rounded-2xl border bg-card shadow-soft", className)}
        >
          {post.tipComment ? (
            <Link
              href={post.tipComment.href}
              className="group flex items-center gap-3 border-b bg-secondary/60 px-4 py-2.5 text-sm transition-colors hover:bg-secondary"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-apricot/30 text-foreground">
                <Lightbulb className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-muted-foreground">
                  <span className="font-semibold text-foreground">{post.author.name}</span> commented on a thrive tip
                </span>
                {post.tipComment.tipTitle ? (
                  <span className="block truncate font-semibold text-secondary-foreground">{post.tipComment.tipTitle}</span>
                ) : null}
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-primary">
                <span className="hidden sm:inline">See the tip</span>
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : null}

          <div className="p-4 sm:p-5">
            <header className="flex items-start gap-3">
              <Link href={profileHref(post.author)} className="shrink-0 rounded-full" tabIndex={-1} aria-hidden>
                <UserAvatar userId={post.author.id} name={post.author.name} size="md" />
              </Link>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Link
                    id={`post-${post.id}-author`}
                    href={profileHref(post.author)}
                    className="truncate font-semibold hover:underline"
                  >
                    {post.author.name}
                  </Link>
                  {post.isNew ? (
                    <span className="rounded-full bg-brand-magenta/10 px-2 py-px text-[0.7rem] font-bold tracking-wide text-brand-magenta uppercase dark:bg-brand-magenta/20">
                      New
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  {variant === "feed" ? (
                    <Link href={postHref(post.id)} className="hover:underline">
                      <TimeAgo iso={post.createdAt} />
                    </Link>
                  ) : (
                    <TimeAgo iso={post.createdAt} />
                  )}
                  {post.editedAt ? <span>· edited</span> : null}
                </div>
              </div>
              <ContentMenu
                noun="post"
                className="-mt-1 -mr-2"
                canEdit={post.canEdit && !editing}
                canDelete={post.canDelete}
                canReport={post.canReport}
                reported={reported}
                moderatorDelete={moderatorDelete}
                onEdit={() => setEditing(true)}
                onDelete={remove}
                onReport={report}
              />
            </header>

            <div className="mt-3">
              {editing ? (
                <PostComposer
                  viewer={viewer}
                  mode="edit"
                  post={post}
                  className="border-primary/20 bg-background p-3 shadow-none sm:p-3"
                  onCancel={() => setEditing(false)}
                  onDone={(next) => {
                    setPost({ ...next, comments: post.comments, isNew: post.isNew });
                    setEditing(false);
                  }}
                />
              ) : (
                <PostContent post={post} />
              )}
            </div>

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
              <ReactionBar summary={post.reactions} />
              {post.canComment || commentCount ? (
                <Button
                  variant="ghost"
                  className="h-9 gap-1.5 rounded-full px-3 font-semibold text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    threadRef.current?.expand();
                    if (post.canComment) threadRef.current?.focusComposer();
                  }}
                >
                  <MessageCircle className="size-[1.1rem]" />
                  {commentCount ? (commentCount === 1 ? "1 comment" : `${commentCount} comments`) : "Comment"}
                </Button>
              ) : post.tipComment ? (
                <Button asChild variant="ghost" className="h-9 gap-1.5 rounded-full px-3 font-semibold text-muted-foreground">
                  <Link href={post.tipComment.href}>
                    <MessageCircle className="size-[1.1rem]" /> Join the conversation
                  </Link>
                </Button>
              ) : null}
            </div>

            {post.kind === "post" ? (
              <CommentThread
                ref={threadRef}
                target={{ type: "post", id: post.id }}
                initialComments={post.comments}
                viewer={viewer}
                canComment={post.canComment}
                variant={variant}
                onCountChange={setCommentCount}
                className={cn(post.comments.length || variant === "page" ? "mt-4 border-t pt-4" : "mt-0 [&:not(:empty)]:mt-4 [&:not(:empty)]:border-t [&:not(:empty)]:pt-4")}
              />
            ) : null}
          </div>
        </motion.article>
      )}
    </AnimatePresence>
  );
}

/** Body, photo and video. With a headline (content warning), all of it stays folded until opened. */
export function PostContent({ post }: { post: Pick<PostDTO, "id" | "html" | "headline" | "photo" | "video" | "author"> }) {
  const [open, setOpen] = useState(false);
  const body = (
    <div className="space-y-3">
      {post.html ? <div className={richTextClass} dangerouslySetInnerHTML={{ __html: post.html }} /> : null}
      {post.photo ? <PostPhoto photo={post.photo} alt={`Photo shared by ${post.author.name}`} /> : null}
      {post.video ? <YouTubeEmbed video={post.video} title={`Video shared by ${post.author.name}`} /> : null}
    </div>
  );
  if (!post.headline) return body;

  const hasMore = Boolean(post.html || post.photo || post.video);
  return (
    <div className="overflow-hidden rounded-xl border border-warning/40 bg-warning/10">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-warning/25 text-warning-foreground dark:text-warning">
          <TriangleAlert className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.7rem] font-bold tracking-wide text-warning-foreground/80 uppercase dark:text-warning/90">Content warning</p>
          <p className="font-semibold text-foreground">{post.headline}</p>
        </div>
      </div>
      {hasMore ? (
        <>
          <AnimatePresence initial={false}>
            {open ? (
              <motion.div
                key="body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
                className="overflow-hidden"
                id={`cw-${post.id}`}
              >
                <div className="border-t border-warning/30 bg-card px-3.5 py-3">{body}</div>
              </motion.div>
            ) : null}
          </AnimatePresence>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={`cw-${post.id}`}
            onClick={() => {
              setOpen((value) => !value);
              if (!open) void openContentWarning({ id: post.id });
            }}
            className="flex h-11 w-full items-center justify-center gap-1.5 border-t border-warning/30 text-sm font-semibold text-foreground/80 transition-colors hover:bg-warning/15"
          >
            {open ? "Fold it away" : "Read more"}
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        </>
      ) : null}
    </div>
  );
}
