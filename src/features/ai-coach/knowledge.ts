import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { releasedTipFor } from "@/features/tips/queries";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { aiKnowledgeArticles, glossaryTerms, pages, tips } from "@/server/db/schema";
import { toPlainText } from "@/server/services/sanitize";
import { anyWordQuery, clip } from "./lib";

/**
 * The AI Coach's approved knowledge base: every published Thrive Tip
 * (regardless of the member's release day), published member-facing pages,
 * the glossary, and staff-approved AI knowledge articles. Postgres full-text
 * search ranks them; the best few go to Claude with a link the member can
 * open (only when they can open it).
 */

export type KnowledgeHit = {
  kind: "tip" | "page" | "glossary" | "article";
  id: string;
  title: string;
  text: string;
  href: string | null;
  rank: number;
};

const SNIPPET_CHARS = 1800;

export async function searchKnowledge(viewer: Viewer, query: string, limit = 6): Promise<KnowledgeHit[]> {
  const q = anyWordQuery(query);
  if (!q) return [];
  const tsq = sql`websearch_to_tsquery('english', ${q})`;
  const pageVector = sql`(setweight(to_tsvector('english', coalesce(${pages.title}, '')), 'A') || setweight(to_tsvector('english', coalesce(${pages.summary}, '')), 'B') || setweight(to_tsvector('english', regexp_replace(${pages.bodyHtml}, '<[^>]+>', ' ', 'g')), 'D'))`;
  const glossaryVector = sql`(setweight(to_tsvector('english', ${glossaryTerms.name}), 'A') || setweight(to_tsvector('english', ${glossaryTerms.definitionText}), 'D'))`;

  const [tipRows, pageRows, glossaryRows, articleRows] = await Promise.all([
    db
      .select({
        id: tips.id,
        title: tips.title,
        text: tips.searchText,
        rank: sql<number>`ts_rank(${tips.searchVector}, ${tsq})`.mapWith(Number),
      })
      .from(tips)
      .where(and(eq(tips.published, true), sql`${tips.searchVector} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${tips.searchVector}, ${tsq})`))
      .limit(limit),
    db
      .select({
        id: pages.id,
        slug: pages.slug,
        title: pages.title,
        summary: pages.summary,
        html: pages.bodyHtml,
        rank: sql<number>`ts_rank(${pageVector}, ${tsq})`.mapWith(Number),
      })
      .from(pages)
      .where(and(eq(pages.status, "published"), eq(pages.audience, "everyone"), sql`${pageVector} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${pageVector}, ${tsq})`))
      .limit(limit),
    db
      .select({
        id: glossaryTerms.id,
        slug: glossaryTerms.slug,
        title: glossaryTerms.name,
        text: glossaryTerms.definitionText,
        rank: sql<number>`ts_rank(${glossaryVector}, ${tsq})`.mapWith(Number),
      })
      .from(glossaryTerms)
      .where(sql`${glossaryVector} @@ ${tsq}`)
      .orderBy(desc(sql`ts_rank(${glossaryVector}, ${tsq})`))
      .limit(limit),
    db
      .select({
        id: aiKnowledgeArticles.id,
        title: aiKnowledgeArticles.title,
        text: aiKnowledgeArticles.body,
        rank: sql<number>`ts_rank(${aiKnowledgeArticles.searchVector}, ${tsq})`.mapWith(Number),
      })
      .from(aiKnowledgeArticles)
      .where(and(eq(aiKnowledgeArticles.published, true), sql`${aiKnowledgeArticles.searchVector} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${aiKnowledgeArticles.searchVector}, ${tsq})`))
      .limit(limit),
  ]);

  const lp = can(viewer, "lp.access");
  const hits: KnowledgeHit[] = [
    // Articles are written for the coach: rank them a little higher than general content.
    ...articleRows.map((row) => ({
      kind: "article" as const,
      id: row.id,
      title: row.title,
      text: row.text,
      href: null,
      rank: row.rank * 1.5,
    })),
    ...tipRows.map((row) => ({
      kind: "tip" as const,
      id: row.id,
      title: row.title,
      text: row.text,
      href: null,
      rank: row.rank,
    })),
    ...pageRows.map((row) => ({
      kind: "page" as const,
      id: row.id,
      title: row.title,
      text: [row.summary, toPlainText(row.html)].filter(Boolean).join(" "),
      href: lp ? `/pages/${row.slug}` : null,
      rank: row.rank,
    })),
    ...glossaryRows.map((row) => ({
      kind: "glossary" as const,
      id: row.id,
      title: row.title,
      text: row.text,
      href: lp ? `/glossary#${row.slug}` : null,
      rank: row.rank,
    })),
  ]
    .sort((a, b) => b.rank - a.rank)
    .slice(0, limit)
    .map((hit) => ({ ...hit, text: clip(hit.text, SNIPPET_CHARS) }));

  // A tip only gets a link when the member can open it (it has been released to them).
  if (can(viewer, "tips.view")) {
    await Promise.all(
      hits
        .filter((hit) => hit.kind === "tip")
        .map(async (hit) => {
          if ((await releasedTipFor(viewer, hit.id))?.released) hit.href = `/tips/${hit.id}`;
        }),
    );
  }
  return hits;
}
