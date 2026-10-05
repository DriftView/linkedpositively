"use client";

import { AnimatePresence, motion } from "motion/react";
import { CheckCheck, RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TipCard } from "@/features/tips/components/tip-card";
import { loadFeed } from "../actions";
import type { FeedItem } from "../feed";
import type { PostDTO, ViewerDTO } from "../types";
import { PostCard } from "./post-card";
import { PostComposer } from "./post-composer";

/**
 * The wall: optional composer, then posts (and Thrive Tips) newest first,
 * loading older pages as you scroll. New posts you write appear at the top
 * straight away.
 */
export function Feed({
  initialItems,
  initialCursor,
  viewer,
  query = {},
  since = null,
  canPost = false,
  empty,
  endLabel = "You're all caught up",
}: {
  initialItems: FeedItem[];
  initialCursor: string | null;
  viewer: ViewerDTO;
  query?: { authorId?: string; tag?: string };
  /** Previous wall visit (ISO), to mark newer posts as "New". */
  since?: string | null;
  canPost?: boolean;
  empty?: React.ReactNode;
  endLabel?: string;
}) {
  const [items, setItems] = useState(initialItems);
  const [fresh, setFresh] = useState<PostDTO[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const sentinel = useRef<HTMLDivElement>(null);
  const loading = useRef(false);

  const loadMore = useCallback(async () => {
    if (!cursor || loading.current) return;
    loading.current = true;
    setStatus("loading");
    const result = await loadFeed({ cursor, authorId: query.authorId, tag: query.tag, since });
    loading.current = false;
    if (!result?.data) {
      setStatus("error");
      return;
    }
    const seen = new Set(items.map((item) => (item.type === "post" ? `p${item.post.id}` : `t${item.tip.id}`)));
    const next = result.data.items.filter((item) => !seen.has(item.type === "post" ? `p${item.post.id}` : `t${item.tip.id}`));
    setItems((current) => [...current, ...next]);
    setCursor(result.data.nextCursor);
    setStatus("idle");
  }, [cursor, items, query.authorId, query.tag, since]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || status === "error") return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), {
      rootMargin: "900px 0px",
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, loadMore, status]);

  const lastNewIndex = items.reduce((last, item, index) => (item.type === "post" && item.post.isNew ? index : last), -1);
  const showDivider = lastNewIndex >= 0 && lastNewIndex < items.length - 1;
  const nothing = !items.length && !fresh.length;

  return (
    <div className="space-y-4">
      {canPost ? <PostComposer viewer={viewer} onDone={(post) => setFresh((list) => [post, ...list])} /> : null}

      <AnimatePresence initial={false}>
        {fresh.map((post) => (
          <motion.div
            key={post.id}
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <PostCard post={post} viewer={viewer} />
          </motion.div>
        ))}
      </AnimatePresence>

      {nothing ? empty : null}

      {items.map((item, index) => (
        <div key={item.type === "post" ? item.post.id : `tip-${item.tip.id}`} className="space-y-4">
          {item.type === "post" ? <PostCard post={item.post} viewer={viewer} /> : <TipCard tip={item.tip} variant="feed" />}
          {showDivider && index === lastNewIndex ? (
            <div className="flex items-center gap-3 py-1 text-xs font-semibold text-muted-foreground" role="separator">
              <span className="h-px flex-1 bg-border" />
              <span className="flex items-center gap-1.5">
                <CheckCheck className="size-4 text-success" /> You&apos;re up to date. Earlier posts
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          ) : null}
        </div>
      ))}

      <div ref={sentinel} aria-hidden className="h-px" />
      {status === "loading" ? <PostSkeleton /> : null}
      {status === "error" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">We couldn&apos;t load older posts.</p>
          <Button variant="outline" className="rounded-full" onClick={() => void loadMore()}>
            <RotateCw /> Try again
          </Button>
        </div>
      ) : null}
      {!cursor && !nothing ? (
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <span className="h-px w-8 bg-border" />
          {endLabel}
          <span className="h-px w-8 bg-border" />
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {status === "loading" ? "Loading older posts" : ""}
      </p>
    </div>
  );
}

export function PostSkeleton() {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5" aria-hidden>
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-11/12" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-8 w-14 rounded-full" />
        <Skeleton className="h-8 w-14 rounded-full" />
      </div>
    </div>
  );
}
