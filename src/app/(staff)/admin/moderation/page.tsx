import Link from "next/link";
import { PageHeader } from "@/components/app/page-header";
import { ModerationQueue } from "@/features/community/components/moderation-queue";
import { moderationCounts, moderationQueue } from "@/features/community/moderation";
import { requirePermission } from "@/server/auth/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Moderation" };

const VIEWS = [
  { key: "posts", label: "Reported posts" },
  { key: "comments", label: "Reported comments" },
  { key: "whitelist", label: "Whitelist" },
] as const;
type ViewKey = (typeof VIEWS)[number]["key"];

/**
 * Moderation queues (legacy "Wall Post Abuse" /admin/abuse-node and "Comment
 * Abuse" /admin/abuse-comment): delete, clear the reports, or whitelist.
 */
export default async function ModerationPage({ searchParams }: PageProps<"/admin/moderation">) {
  await requirePermission("moderation.review");
  const { view: raw } = await searchParams;
  const view: ViewKey = VIEWS.some((item) => item.key === raw) ? (raw as ViewKey) : "posts";

  const [counts, posts, comments, whitelistPosts, whitelistComments] = await Promise.all([
    moderationCounts(),
    view === "posts" ? moderationQueue("post") : [],
    view === "comments" ? moderationQueue("comment") : [],
    view === "whitelist" ? moderationQueue("post", "whitelisted") : [],
    view === "whitelist" ? moderationQueue("comment", "whitelisted") : [],
  ]);
  const badge: Partial<Record<ViewKey, number>> = { posts: counts.posts, comments: counts.comments };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Moderation"
        description="Posts and comments people reported as inappropriate. Nothing is hidden automatically: delete it, clear the reports, or whitelist it so new reports are ignored."
      />
      <nav aria-label="Moderation views" className="mb-4 flex gap-1 overflow-x-auto border-b">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={`/admin/moderation?view=${item.key}`}
            aria-current={view === item.key ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors",
              view === item.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {badge[item.key] ? (
              <span className="rounded-full bg-destructive/10 px-1.5 text-xs font-semibold text-destructive tabular-nums">
                {badge[item.key]}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      {view === "posts" ? (
        <ModerationQueue
          key="posts"
          items={posts}
          view="open"
          emptyTitle="No content has been reported"
          emptyText="Reported wall posts will show up here."
        />
      ) : null}
      {view === "comments" ? (
        <ModerationQueue
          key="comments"
          items={comments}
          view="open"
          emptyTitle="No comments have been reported"
          emptyText="Reported comments on posts, tips and resources will show up here."
        />
      ) : null}
      {view === "whitelist" ? (
        <div className="space-y-6">
          <section>
            <h2 className="mb-2 text-base font-semibold">Posts</h2>
            <ModerationQueue key="wl-posts" items={whitelistPosts} view="whitelisted" emptyTitle="No whitelisted posts" emptyText="Posts you whitelist appear here." />
          </section>
          <section>
            <h2 className="mb-2 text-base font-semibold">Comments</h2>
            <ModerationQueue
              key="wl-comments"
              items={whitelistComments}
              view="whitelisted"
              emptyTitle="No whitelisted comments"
              emptyText="Comments you whitelist appear here."
            />
          </section>
        </div>
      ) : null}
    </div>
  );
}
