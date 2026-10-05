import Link from "next/link";
import { Hash, Lightbulb } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Feed } from "@/features/community/components/feed";
import { buildFeed } from "@/features/community/feed";
import { tagHref } from "@/features/community/links";
import { countTagPosts, popularTags } from "@/features/community/queries";
import { searchPosts } from "@/features/search/queries";
import { SearchBox } from "@/features/search/components/search-box";
import { SearchResults } from "@/features/search/components/search-results";
import { TipCard } from "@/features/tips/components/tip-card";
import { searchTips } from "@/features/tips/queries";
import type { TipCardData } from "@/features/tips/types";
import { can, requirePermission, type Viewer } from "@/server/auth/session";
import { trackUsage } from "@/server/services/usage";

export async function generateMetadata({ searchParams }: PageProps<"/search">) {
  const { q, tag } = await searchParams;
  if (typeof tag === "string" && tag) return { title: `#${tag}` };
  return { title: typeof q === "string" && q ? `Search: ${q}` : "Search" };
}

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim().slice(0, 200) : "");

/** Site search over wall posts (and their comments) and Thrive Tips; ?tag= shows a hashtag's posts. */
export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const viewer = await requirePermission("community.post");
  const params = await searchParams;
  const tag = one(params.tag).replace(/^#/, "").toLowerCase();
  const q = one(params.q);

  if (tag) return <TagPage viewer={viewer} tag={tag} />;

  if (!q) {
    const tags = await popularTags(16);
    return (
      <div className="space-y-6">
        <PageHeader title="Search" description="Find posts from the community and Thrive Tips." className="mb-0" />
        <SearchBox autoFocus />
        {tags.length ? (
          <section aria-labelledby="popular-tags">
            <h2 id="popular-tags" className="mb-3 text-base font-semibold">
              Popular on the wall
            </h2>
            <ul className="flex flex-wrap gap-2">
              {tags.map((item) => (
                <li key={item.name}>
                  <Link
                    href={tagHref(item.name)}
                    className="inline-flex h-9 items-center gap-1 rounded-full border bg-card px-3.5 text-sm font-semibold text-brand-magenta shadow-soft transition hover:bg-secondary"
                  >
                    #{item.name}
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">{item.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    );
  }

  const showTips = can(viewer, "tips.view");
  const [posts, tips] = await Promise.all([
    searchPosts(viewer, q),
    showTips ? searchTips(viewer, q).catch(() => ({ items: [] as TipCardData[], total: 0, page: 1, pageCount: 0 })) : null,
  ]);
  await trackUsage(viewer.id, "search", { results: posts.total + (tips?.total ?? 0) });

  return (
    <div className="space-y-5">
      <PageHeader title="Search" className="mb-0" />
      <SearchBox key={q} initial={q} />
      <SearchResults
        key={`results-${q}`}
        q={q}
        posts={posts}
        tips={tips ?? { items: [], total: 0, pageCount: 0 }}
        showTips={showTips}
      />
    </div>
  );
}

async function TagPage({ viewer, tag }: { viewer: Viewer; tag: string }) {
  const [feed, count, tips] = await Promise.all([
    buildFeed(viewer, { tag }),
    countTagPosts(tag),
    can(viewer, "tips.view") ? searchTips(viewer, tag).catch(() => null) : null,
  ]);
  const tagTips = tips?.items.filter((tip) => tip.tags.some((item) => item.name.toLowerCase() === tag || item.slug === tag)) ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        className="mb-0"
        title={
          <span className="inline-flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-xl bg-brand-magenta/10 text-brand-magenta dark:bg-brand-magenta/20">
              <Hash className="size-5" aria-hidden />
            </span>
            {tag}
          </span>
        }
        description={count === 1 ? "1 post uses this hashtag." : `${count} posts use this hashtag.`}
      />
      <SearchBox initial={`#${tag}`} />
      {tagTips.length ? (
        <section aria-labelledby="tag-tips" className="space-y-2.5">
          <h2 id="tag-tips" className="flex items-center gap-2 text-base font-semibold">
            <Lightbulb className="size-4 text-primary" /> Tips about #{tag}
          </h2>
          {tagTips.slice(0, 3).map((tip) => (
            <TipCard key={tip.id} tip={tip} variant="compact" />
          ))}
        </section>
      ) : null}
      <Feed
        initialItems={feed.items}
        initialCursor={feed.nextCursor}
        viewer={{ id: viewer.id, name: viewer.name, username: viewer.username }}
        query={{ tag }}
        endLabel={`That's every #${tag} post`}
        empty={
          <Empty className="rounded-2xl border bg-card/60 py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="size-11 rounded-full bg-secondary text-brand-magenta">
                <Hash className="size-5" />
              </EmptyMedia>
              <EmptyTitle className="text-base">No posts with #{tag} yet</EmptyTitle>
              <EmptyDescription>Use #{tag} in a post on your wall and it will show up here.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
    </div>
  );
}
