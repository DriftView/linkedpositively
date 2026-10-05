"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { MessageCircle } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { cn } from "@/lib/utils";
import { deleteComment, reportContent } from "../actions";
import { commentAnchor, profileHref } from "../links";
import type { CommentDTO, CommentTarget, ReactionSummary, ViewerDTO } from "../types";
import { CommentComposer, type CommentComposerHandle, type PendingComment } from "./comment-composer";
import { ContentMenu, TimeAgo } from "./content-menu";
import { PostPhoto, YouTubeEmbed } from "./media";
import { ReactionBar } from "./reaction-bar";
import { richTextClass } from "./rich-text-styles";

export type CommentThreadHandle = { focusComposer: () => void; expand: () => void };

type Pending = { key: string; pending: PendingComment };

/**
 * A flat comment thread (oldest first) with its comment box. Used under wall
 * posts (variant "feed": shows the latest two, "View all N comments") and on
 * full pages for posts, tips and resources (variant "page": everything).
 */
export const CommentThread = forwardRef<
  CommentThreadHandle,
  {
    target: CommentTarget;
    initialComments: CommentDTO[];
    viewer: ViewerDTO;
    canComment: boolean;
    variant?: "feed" | "page";
    onCountChange?: (count: number) => void;
    className?: string;
  }
>(function CommentThread({ target, initialComments, viewer, canComment, variant = "page", onCountChange, className }, ref) {
  const [comments, setComments] = useState(initialComments);
  const [pending, setPending] = useState<Pending[]>([]);
  const [expanded, setExpanded] = useState(variant === "page");
  const [composerOpen, setComposerOpen] = useState(variant === "page");
  const [focusRequest, setFocusRequest] = useState(0);
  const composerRef = useRef<CommentComposerHandle>(null);

  useImperativeHandle(
    ref,
    () => ({
      focusComposer: () => {
        setComposerOpen(true);
        setFocusRequest((value) => value + 1);
      },
      expand: () => setExpanded(true),
    }),
    [],
  );

  useEffect(() => {
    if (focusRequest) composerRef.current?.focus();
  }, [focusRequest]);

  // Deep links (/posts/x#comment-y) highlight the comment.
  const [highlight, setHighlight] = useState<string | null>(null);
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash.startsWith("comment-")) return;
    const id = hash.slice("comment-".length);
    if (!initialComments.some((comment) => comment.id === id)) return;
    const frame = requestAnimationFrame(() => {
      setExpanded(true);
      setHighlight(id);
      document.getElementById(hash)?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
    const timer = window.setTimeout(() => setHighlight(null), 2600);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [initialComments]);

  function update(next: CommentDTO[]) {
    setComments(next);
    onCountChange?.(next.length);
  }

  const hidden = variant === "feed" && !expanded ? Math.max(0, comments.length - 2) : 0;
  const visible = hidden ? comments.slice(-2) : comments;

  return (
    <div className={cn("space-y-3", className)}>
      {hidden ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <MessageCircle className="size-4" /> View {hidden === 1 ? "1 earlier comment" : `all ${comments.length} comments`}
        </button>
      ) : null}

      {visible.length || pending.length ? (
        <ul className="space-y-3">
          <AnimatePresence initial={false}>
            {visible.map((comment) => (
              <motion.li
                key={comment.id}
                id={commentAnchor(comment.id)}
                layout="position"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0, marginTop: 0 }}
                transition={{ duration: 0.22 }}
                className="scroll-mt-24"
              >
                <CommentItem
                  comment={comment}
                  viewer={viewer}
                  highlighted={highlight === comment.id}
                  onChange={(next) => update(comments.map((item) => (item.id === next.id ? next : item)))}
                  onDeleted={() => update(comments.filter((item) => item.id !== comment.id))}
                />
              </motion.li>
            ))}
            {pending.map((item) => (
              <motion.li key={item.key} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <PendingItem viewer={viewer} pending={item.pending} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      ) : variant === "page" ? (
        <p className="rounded-2xl bg-muted/50 px-4 py-5 text-center text-sm text-muted-foreground">
          No comments yet.{canComment ? " Start the conversation." : ""}
        </p>
      ) : null}

      {canComment && composerOpen ? (
        <CommentComposer
          ref={composerRef}
          target={target}
          viewer={viewer}
          onSubmitting={(item) => setPending((list) => [...list, { key: `p${Date.now()}`, pending: item }])}
          onDone={(comment) => {
            setPending((list) => list.slice(1));
            if (comment) {
              setExpanded(true);
              update([...comments, comment]);
            }
          }}
        />
      ) : null}
    </div>
  );
});

function Bubble({
  author,
  createdAt,
  editedAt,
  html,
  children,
  highlighted,
  muted,
}: {
  author: { id: string; name: string; username?: string };
  createdAt?: string;
  editedAt?: string | null;
  html: string;
  children?: React.ReactNode;
  highlighted?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "inline-block max-w-full rounded-2xl rounded-tl-md bg-muted/70 px-3.5 py-2 transition-shadow duration-700",
        highlighted && "shadow-[0_0_0_3px_var(--ring)]",
        muted && "opacity-60",
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Link href={profileHref(author)} className="text-sm font-semibold hover:underline">
          {author.name}
        </Link>
        {createdAt ? <TimeAgo iso={createdAt} className="text-xs text-muted-foreground" /> : null}
        {editedAt ? <span className="text-xs text-muted-foreground">· edited</span> : null}
      </div>
      {html ? <div className={cn(richTextClass, "text-[0.925rem]")} dangerouslySetInnerHTML={{ __html: html }} /> : null}
      {children}
    </div>
  );
}

function CommentItem({
  comment,
  viewer,
  highlighted,
  onChange,
  onDeleted,
}: {
  comment: CommentDTO;
  viewer: ViewerDTO;
  highlighted: boolean;
  onChange: (comment: CommentDTO) => void;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [reported, setReported] = useState(comment.reported);
  const moderatorDelete = comment.canDelete && comment.author.id !== viewer.id;

  return (
    <div className="flex gap-2.5">
      <Link href={profileHref(comment.author)} className="mt-0.5 shrink-0 rounded-full" tabIndex={-1} aria-hidden>
        <UserAvatar userId={comment.author.id} name={comment.author.name} size="sm" />
      </Link>
      <div className="min-w-0 flex-1">
        {editing ? (
          <CommentComposer
            target={comment.target}
            viewer={viewer}
            comment={comment}
            onCancel={() => setEditing(false)}
            onDone={(next) => {
              if (next) {
                onChange({ ...next, reactions: comment.reactions });
                setEditing(false);
              }
            }}
          />
        ) : (
          <>
            <div className="flex items-start gap-1">
              <Bubble author={comment.author} createdAt={comment.createdAt} editedAt={comment.editedAt} html={comment.html} highlighted={highlighted}>
                {comment.photo ? (
                  <div className="mt-2">
                    <PostPhoto photo={comment.photo} alt={`Photo from ${comment.author.name}`} compact />
                  </div>
                ) : null}
                {comment.video ? (
                  <div className="mt-2">
                    <YouTubeEmbed video={comment.video} compact />
                  </div>
                ) : null}
              </Bubble>
              <ContentMenu
                noun="comment"
                className="-mt-0.5 size-8"
                canEdit={comment.canEdit}
                canDelete={comment.canDelete}
                canReport={comment.canReport}
                reported={reported}
                moderatorDelete={moderatorDelete}
                onEdit={() => setEditing(true)}
                onDelete={async () => {
                  const result = await deleteComment({ id: comment.id });
                  if (result?.data?.deleted) {
                    toast.success("Comment deleted");
                    onDeleted();
                    return true;
                  }
                  toast.error(result?.serverError ?? "Couldn't delete that comment.");
                  return false;
                }}
                onReport={async () => {
                  const result = await reportContent({ type: "comment", id: comment.id });
                  if (result?.data?.reported) {
                    setReported(true);
                    toast.success("Thanks for letting us know. The study team will take a look.");
                    return true;
                  }
                  toast.error(result?.serverError ?? "Couldn't send your report.");
                  return false;
                }}
              />
            </div>
            <ReactionBar summary={comment.reactions as ReactionSummary} size="sm" className="mt-1 ml-1" />
          </>
        )}
      </div>
    </div>
  );
}

function PendingItem({ viewer, pending }: { viewer: ViewerDTO; pending: PendingComment }) {
  return (
    <div className="flex gap-2.5" aria-busy>
      <UserAvatar userId={viewer.id} name={viewer.name} size="sm" className="mt-0.5" />
      <Bubble author={viewer} html={pending.html} muted>
        {pending.photoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview
          <img src={pending.photoPreview} alt="" className="mt-2 max-h-40 rounded-xl" />
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">Posting…</p>
      </Bubble>
    </div>
  );
}
