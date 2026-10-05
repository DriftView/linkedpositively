"use client";

import Link from "next/link";
import { FileSearch, Heart, ImageIcon, Lightbulb, MessageCircle, PlayCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TimeAgo } from "@/features/community/components/content-menu";
import { postHref } from "@/features/community/links";
import { TipCard } from "@/features/tips/components/tip-card";
import type { TipCardData } from "@/features/tips/types";
import { moreResults } from "../actions";
import type { Segment } from "../text";
import type { PostHit } from "../types";

type List<T> = { items: T[]; total: number; pageCount: number };

function Marked({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.hit ? (
          <mark key={index} className="rounded-sm bg-brand-apricot/45 px-0.5 text-foreground dark:bg-brand-apricot/30">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function PostHitCard({ hit }: { hit: PostHit }) {
  return (
    <Link
      href={hit.comment ? `${postHref(hit.id)}#comments` : postHref(hit.id)}
      className="group block rounded-2xl border bg-card p-4 shadow-soft transition hover:shadow-lift focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-center gap-2.5">
        <UserAvatar userId={hit.author.id} name={hit.author.name} size="sm" />
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold">{hit.author.name}</span>
          <span className="text-muted-foreground">
            {hit.tipComment ? " on a thrive tip" : ""} · <TimeAgo iso={hit.createdAt} />
          </span>
        </div>
      </div>
      {hit.headline ? (
        <p className="mt-2.5 flex items-center gap-2 rounded-lg bg-warning/10 px-2.5 py-1.5 text-sm font-semibold">
          <TriangleAlert className="size-4 shrink-0 text-warning-foreground dark:text-warning" aria-hidden />
          <span className="sr-only">Content warning: </span>
          {hit.headline}
        </p>
      ) : hit.excerpt.length ? (
        <p className="mt-2.5 line-clamp-3 text-[0.95rem] leading-relaxed text-foreground/90">
          <Marked segments={hit.excerpt} />
        </p>
      ) : null}
      {hit.comment ? (
        <div className="mt-2.5 rounded-xl bg-muted/60 px-3 py-2 text-sm">
          <p className="text-xs font-semibold text-muted-foreground">Comment by {hit.comment.author.name}</p>
          <p className="mt-0.5 line-clamp-2">
            <Marked segments={hit.comment.excerpt} />
          </p>
        </div>
      ) : null}
      <div className="mt-3 flex items-center gap-4 text-xs font-medium text-muted-foreground">
        {hit.hasPhoto ? (
          <span className="inline-flex items-center gap-1">
            <ImageIcon className="size-3.5" /> Photo
          </span>
        ) : null}
        {hit.hasVideo ? (
          <span className="inline-flex items-center gap-1">
            <PlayCircle className="size-3.5" /> Video
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1">
          <Heart className="size-3.5" /> {hit.reactionCount}
        </span>
        <span className="inline-flex items-center gap-1">
          <MessageCircle className="size-3.5" /> {hit.commentCount}
        </span>
      </div>
    </Link>
  );
}

function SeeAll({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" className="mt-2 h-9 rounded-full px-3 font-semibold text-primary" onClick={onClick}>
      {label}
    </Button>
  );
}

function NoMatches({ q, what }: { q: string; what: string }) {
  return (
    <Empty className="rounded-2xl border bg-card/60 py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-11 rounded-full bg-secondary text-primary">
          <FileSearch className="size-5" />
        </EmptyMedia>
        <EmptyTitle className="text-base">No {what} match &ldquo;{q}&rdquo;</EmptyTitle>
        <EmptyDescription>Try fewer or different words, or check the spelling.</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Results for ?q=: "N results", tabs All / Posts / Tips, "Show more" per list. */
export function SearchResults({
  q,
  posts: initialPosts,
  tips: initialTips,
  showTips,
}: {
  q: string;
  posts: List<PostHit>;
  tips: List<TipCardData>;
  showTips: boolean;
}) {
  const [posts, setPosts] = useState(initialPosts.items);
  const [tips, setTips] = useState(initialTips.items);
  const [pages, setPages] = useState({ posts: 1, tips: 1 });
  const [loading, setLoading] = useState<"posts" | "tips" | null>(null);
  const [tab, setTab] = useState("all");
  const total = initialPosts.total + (showTips ? initialTips.total : 0);

  async function more(kind: "posts" | "tips") {
    setLoading(kind);
    const page = pages[kind] + 1;
    const result = await moreResults({ q, kind, page });
    setLoading(null);
    if (!result?.data) {
      toast.error("Couldn't load more results.");
      return;
    }
    setPages((current) => ({ ...current, [kind]: page }));
    if (kind === "posts") setPosts((list) => [...list, ...result.data!.posts]);
    else setTips((list) => [...list, ...result.data!.tips]);
  }

  const postList = (limit?: number) =>
    posts.length ? (
      <div className="space-y-3">
        {(limit ? posts.slice(0, limit) : posts).map((hit) => (
          <PostHitCard key={hit.id} hit={hit} />
        ))}
        {!limit && pages.posts < initialPosts.pageCount ? (
          <div className="flex justify-center pt-1">
            <Button variant="outline" className="rounded-full" onClick={() => void more("posts")} disabled={loading === "posts"}>
              {loading === "posts" ? <Spinner /> : null} Show more posts
            </Button>
          </div>
        ) : null}
      </div>
    ) : (
      <NoMatches q={q} what="posts" />
    );

  const tipList = (limit?: number) =>
    tips.length ? (
      <div className="space-y-3">
        {(limit ? tips.slice(0, limit) : tips).map((tip) => (
          <TipCard key={tip.id} tip={tip} variant="compact" />
        ))}
        {!limit && pages.tips < initialTips.pageCount ? (
          <div className="flex justify-center pt-1">
            <Button variant="outline" className="rounded-full" onClick={() => void more("tips")} disabled={loading === "tips"}>
              {loading === "tips" ? <Spinner /> : null} Show more tips
            </Button>
          </div>
        ) : null}
      </div>
    ) : (
      <NoMatches q={q} what="tips" />
    );

  if (!total) {
    return (
      <Empty className="rounded-2xl border bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12 rounded-full bg-secondary text-primary">
            <FileSearch className="size-5" />
          </EmptyMedia>
          <EmptyTitle className="text-base">Nothing matches &ldquo;{q}&rdquo;</EmptyTitle>
          <EmptyDescription>Try fewer or different words. Searching for a hashtag? Start with #, like #selfcare.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        <span className="font-semibold text-foreground tabular-nums">{total}</span> {total === 1 ? "result" : "results"} for
        &ldquo;{q}&rdquo;
      </p>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="posts">
            Posts <span className="ml-1 text-muted-foreground tabular-nums">{initialPosts.total}</span>
          </TabsTrigger>
          {showTips ? (
            <TabsTrigger value="tips">
              Tips <span className="ml-1 text-muted-foreground tabular-nums">{initialTips.total}</span>
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="all" className="space-y-7">
          {initialPosts.total ? (
            <section aria-label="Posts">
              <h2 className="mb-2.5 flex items-center gap-2 text-base font-semibold">
                <MessageCircle className="size-4 text-primary" /> Posts
              </h2>
              {postList(3)}
              {initialPosts.total > 3 ? <SeeAll label={`See all ${initialPosts.total} posts`} onClick={() => setTab("posts")} /> : null}
            </section>
          ) : null}
          {showTips && initialTips.total ? (
            <section aria-label="Tips">
              <h2 className="mb-2.5 flex items-center gap-2 text-base font-semibold">
                <Lightbulb className="size-4 text-primary" /> Tips
              </h2>
              {tipList(3)}
              {initialTips.total > 3 ? <SeeAll label={`See all ${initialTips.total} tips`} onClick={() => setTab("tips")} /> : null}
            </section>
          ) : null}
        </TabsContent>
        <TabsContent value="posts">{postList()}</TabsContent>
        {showTips ? <TabsContent value="tips">{tipList()}</TabsContent> : null}
      </Tabs>
    </div>
  );
}
