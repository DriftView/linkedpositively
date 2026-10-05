/**
 * Seeds sample content for the resources, pages, glossary and journey areas
 * (never run against production). Safe to re-run: existing items are updated
 * by their natural key, nothing is duplicated.
 *
 *   npx tsx --env-file=.env --conditions=react-server scripts/seed-content.mts
 */
import { and, eq, isNotNull } from "drizzle-orm";
import { db, pgClient } from "@/server/db/client";
import { glossaryTerms, journeyCategories, journeyGoals, journeyMethods, pages } from "@/server/db/schema/content";
import { resources } from "@/server/db/schema/resources";
import { sanitizeStaffHtml, toPlainText } from "@/server/services/sanitize";
import { SEED_GLOSSARY } from "@/features/glossary/seed-data";
import { termLetter, termSlug } from "@/features/glossary/lib";
import { SEED_JOURNEY } from "@/features/journey/seed-data";
import { SEED_PAGES } from "@/features/pages/seed-data";
import { SEED_RESOURCES } from "@/features/resources/seed-data";
import { resolveTagIds } from "@/features/resources/service";

if (process.env.NODE_ENV === "production" || process.env.DELIVERY_MODE === "live") {
  console.error("Refusing to seed: this looks like a production environment.");
  process.exit(1);
}

// Resources
for (const item of SEED_RESOURCES) {
  const tagIds = await resolveTagIds(item.tags);
  const fields = {
    title: item.title,
    description: item.description,
    address: item.address,
    city: item.city,
    state: item.state,
    zip: item.zip,
    website: item.website ?? "",
    contact: item.contact,
    hours: item.hours,
    eligibility: item.eligibility ?? "",
    scheduling: item.scheduling ?? "",
    covidUpdates: item.covidUpdates ?? "",
    insuranceStatus: item.insuranceStatus ?? "",
    services: item.services ?? "",
    tagIds,
    lat: item.lat,
    lng: item.lng,
    geocodeStatus: "ok" as const,
    geocodeAt: new Date(),
    geocodeSource: "seed",
  };
  await db
    .insert(resources)
    .values({ ...fields, importGuid: item.guid, status: "published", publishedAt: new Date() })
    .onConflictDoUpdate({ target: resources.importGuid, targetWhere: isNotNull(resources.importGuid), set: fields });
}
console.log(`resources: ${SEED_RESOURCES.length}`);

// Pages
for (const page of SEED_PAGES) {
  await db
    .insert(pages)
    .values({
      slug: page.slug,
      title: page.title,
      summary: page.summary,
      bodyHtml: sanitizeStaffHtml(page.bodyHtml.trim()),
      status: "published",
      audience: "everyone",
      inMenu: page.inMenu,
      order: page.order,
      needsReview: true,
      aliases: page.aliases,
      ...(page.legacyNid ? { legacySite: "lp" as const, legacyTable: "node", legacyId: page.legacyNid } : {}),
    })
    .onConflictDoNothing();
}
console.log(`pages: ${SEED_PAGES.length}`);

// Glossary
for (const term of SEED_GLOSSARY) {
  const definitionHtml = sanitizeStaffHtml(term.definition);
  await db
    .insert(glossaryTerms)
    .values({
      slug: termSlug(term.name),
      name: term.name,
      letter: termLetter(term.name),
      definitionHtml,
      definitionText: toPlainText(definitionHtml),
    })
    .onConflictDoNothing({ target: glossaryTerms.slug });
}
console.log(`glossary terms: ${SEED_GLOSSARY.length}`);

// Journey
let goals = 0;
for (const [categoryIndex, category] of SEED_JOURNEY.entries()) {
  await db
    .insert(journeyCategories)
    .values({
      slug: category.slug,
      name: category.name,
      description: category.description,
      accent: category.accent,
      order: categoryIndex,
      published: true,
    })
    .onConflictDoNothing({ target: journeyCategories.slug });
  const [doc] = await db
    .select({ id: journeyCategories.id })
    .from(journeyCategories)
    .where(eq(journeyCategories.slug, category.slug))
    .limit(1);
  for (const [methodIndex, method] of category.methods.entries()) {
    // No unique key on (category, name): look up, then insert when missing.
    let [methodDoc] = await db
      .select({ id: journeyMethods.id })
      .from(journeyMethods)
      .where(and(eq(journeyMethods.categoryId, doc.id), eq(journeyMethods.name, method.name)))
      .limit(1);
    methodDoc ??= (
      await db
        .insert(journeyMethods)
        .values({ categoryId: doc.id, name: method.name, order: methodIndex })
        .returning({ id: journeyMethods.id })
    )[0];
    for (const [goalIndex, goal] of method.goals.entries()) {
      const [existing] = await db
        .select({ id: journeyGoals.id })
        .from(journeyGoals)
        .where(and(eq(journeyGoals.methodId, methodDoc.id), eq(journeyGoals.name, goal)))
        .limit(1);
      if (!existing) await db.insert(journeyGoals).values({ methodId: methodDoc.id, name: goal, order: goalIndex });
      goals++;
    }
  }
}
console.log(`journey: ${SEED_JOURNEY.length} categories, ${goals} goals`);

await pgClient.end();
process.exit(0);
