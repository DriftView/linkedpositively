import "server-only";
import { asc, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { glossaryTerms } from "@/server/db/schema";

export type GlossaryTermDTO = {
  id: string;
  name: string;
  slug: string;
  letter: string;
  definitionHtml: string;
  definitionText: string;
  updatedAt: string;
};

/** Every term, A–Z (the glossary is small: ~80 entries). */
export async function listGlossaryTerms(): Promise<GlossaryTermDTO[]> {
  const rows = await db
    .select({
      id: glossaryTerms.id,
      name: glossaryTerms.name,
      slug: glossaryTerms.slug,
      letter: glossaryTerms.letter,
      definitionHtml: glossaryTerms.definitionHtml,
      definitionText: glossaryTerms.definitionText,
      updatedAt: glossaryTerms.updatedAt,
    })
    .from(glossaryTerms)
    .orderBy(sql`lower(${glossaryTerms.name})`, asc(glossaryTerms.id));
  return rows
    .map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }))
    .sort((a, b) => (a.letter === "#" ? -1 : b.letter === "#" ? 1 : 0) || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}
