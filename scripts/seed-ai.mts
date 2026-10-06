/**
 * Seeds draft AI Coach knowledge articles (never run against production).
 * Articles are created unpublished and flagged "needs review" so the study
 * team approves them in /admin/ai/knowledge. Safe to re-run: existing titles
 * are left alone.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-ai.mts
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-ai.mts --publish   # local testing only
 */
import { eq } from "drizzle-orm";
import { SEED_AI_ARTICLES } from "@/features/ai-coach/seed-data";
import { db, pgClient } from "@/server/db/client";
import { aiKnowledgeArticles } from "@/server/db/schema/ai";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

const publish = process.argv.includes("--publish");

for (const article of SEED_AI_ARTICLES) {
  const [existing] = await db.select({ id: aiKnowledgeArticles.id }).from(aiKnowledgeArticles).where(eq(aiKnowledgeArticles.title, article.title)).limit(1);
  if (existing) {
    if (publish) await db.update(aiKnowledgeArticles).set({ published: true, needsReview: false }).where(eq(aiKnowledgeArticles.id, existing.id));
    console.log(`exists  ${article.title}${publish ? " (published)" : ""}`);
    continue;
  }
  await db.insert(aiKnowledgeArticles).values({ ...article, published: publish, needsReview: !publish });
  console.log(`created ${article.title}${publish ? " (published)" : " (draft, needs review)"}`);
}
await pgClient.end();
process.exit(0);
