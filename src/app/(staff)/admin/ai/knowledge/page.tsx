import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { TOPIC_LABEL } from "@/features/ai-coach/components/admin/labels";
import { listArticles } from "@/features/ai-coach/queries";
import { friendlyDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "AI Coach knowledge" };

export default async function AiKnowledgePage() {
  const viewer = await requirePermission("content.manage");
  const articles = await listArticles();
  return (
    <div className="animate-rise">
      <PageHeader
        title="AI Coach knowledge"
        description="Approved information the coach answers from, on top of Thrive Tips, help pages and the glossary. Only approved, published articles are used."
        actions={
          <Button asChild>
            <Link href="/admin/ai/knowledge/new">
              <Plus aria-hidden /> New article
            </Link>
          </Button>
        }
      />
      {articles.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">No articles yet.</p>
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-soft">
          {articles.map((article) => (
            <li key={article.id}>
              <Link href={`/admin/ai/knowledge/${article.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50">
                <span className="hidden w-32 shrink-0 text-xs font-medium text-muted-foreground sm:block">{TOPIC_LABEL[article.topic]}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{article.title}</span>
                {article.needsReview ? <span className="shrink-0 rounded-full bg-warning/20 px-2 py-0.5 text-xs font-medium">Needs review</span> : null}
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    article.published ? "bg-success/15 text-success" : "bg-muted text-muted-foreground",
                  )}
                >
                  {article.published ? "Published" : "Draft"}
                </span>
                <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground md:block">{friendlyDate(article.updatedAt, viewer.timezone)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
