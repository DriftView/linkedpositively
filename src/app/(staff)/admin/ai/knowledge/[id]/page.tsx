import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { ArticleForm } from "@/features/ai-coach/components/admin/article-form";
import { getArticle } from "@/features/ai-coach/queries";
import type { ArticleFormDTO } from "@/features/ai-coach/types";
import { requirePermission } from "@/server/auth/session";

export const metadata: Metadata = { title: "AI Coach article" };

const EMPTY: ArticleFormDTO = {
  id: null,
  title: "",
  topic: "other",
  body: "",
  sourceUrl: "",
  published: false,
  needsReview: true,
  reviewedByName: null,
  reviewedAt: null,
};

export default async function AiArticlePage(props: PageProps<"/admin/ai/knowledge/[id]">) {
  await requirePermission("content.manage");
  const { id } = await props.params;
  const article = id === "new" ? EMPTY : await getArticle(id);
  if (!article) notFound();
  return (
    <div className="mx-auto max-w-3xl animate-rise">
      <Link href="/admin/ai/knowledge" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden className="size-4" /> AI Coach knowledge
      </Link>
      <PageHeader title={article.id ? "Edit article" : "New article"} description="Keep it factual, plain and kind. The coach quotes and paraphrases this text." />
      <ArticleForm key={article.id ?? "new"} article={article} />
    </div>
  );
}
