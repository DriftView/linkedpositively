import "server-only";
import { and, arrayContains, asc, eq, inArray } from "drizzle-orm";
import { can, type Viewer } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { pages, users, type Page } from "@/server/db/schema";

export type PageDTO = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  bodyHtml: string;
  videoEmbed: string | null;
  status: "published" | "draft";
  audience: "everyone" | "staff";
  updatedAt: string;
};

export type PageLinkDTO = { slug: string; title: string; summary: string };

/** YouTube / Vimeo watch URL → privacy-friendly embed URL (Drupal field_video_link). */
export function videoEmbedUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${parsed.pathname.slice(1)}`;
    if (host.endsWith("youtube.com")) {
      const id = parsed.searchParams.get("v") ?? parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function toDTO(doc: Page): PageDTO {
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary ?? "",
    bodyHtml: doc.bodyHtml,
    videoEmbed: videoEmbedUrl(doc.videoUrl),
    status: doc.status,
    audience: doc.audience,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** A page for /pages/[slug]. Drafts and staff-only pages are visible to content staff only. */
export async function getPageForViewer(slug: string, viewer: Viewer): Promise<PageDTO | null> {
  const [doc] = await db.select().from(pages).where(eq(pages.slug, slug.toLowerCase().slice(0, 80))).limit(1);
  if (!doc) return null;
  const staff = can(viewer, "content.manage");
  if ((doc.status !== "published" || doc.audience === "staff") && !staff) return null;
  return toDTO(doc);
}

/** Pages listed on the "Help & info" index (the old About menu). */
export async function listMenuPages(viewer: Viewer): Promise<PageLinkDTO[]> {
  const docs = await db
    .select({ slug: pages.slug, title: pages.title, summary: pages.summary })
    .from(pages)
    .where(
      and(
        eq(pages.status, "published"),
        eq(pages.inMenu, true),
        can(viewer, "content.manage") ? inArray(pages.audience, ["everyone", "staff"]) : eq(pages.audience, "everyone"),
      ),
    )
    .orderBy(asc(pages.order), asc(pages.title), asc(pages.id));
  return docs.map((doc) => ({ slug: doc.slug, title: doc.title, summary: doc.summary ?? "" }));
}

/** For legacy redirects: an alias ("about/support") or a Drupal node id → current slug. */
export async function resolveLegacyPage(input: { alias?: string; nid?: number }) {
  const where =
    input.nid != null
      ? and(eq(pages.legacyId, input.nid), eq(pages.legacyTable, "node"))
      : input.alias != null
        ? arrayContains(pages.aliases, [input.alias])
        : null;
  if (!where) return null;
  const [doc] = await db.select({ slug: pages.slug }).from(pages).where(where).limit(1);
  return doc?.slug ?? null;
}

export type AdminPageRowDTO = {
  id: string;
  slug: string;
  title: string;
  status: "published" | "draft";
  audience: "everyone" | "staff";
  inMenu: boolean;
  order: number;
  needsReview: boolean;
  updatedAt: string;
  updatedByName: string | null;
};

export async function adminListPages(): Promise<AdminPageRowDTO[]> {
  const docs = await db
    .select({
      id: pages.id,
      slug: pages.slug,
      title: pages.title,
      status: pages.status,
      audience: pages.audience,
      inMenu: pages.inMenu,
      order: pages.order,
      needsReview: pages.needsReview,
      updatedAt: pages.updatedAt,
      updatedBy: pages.updatedBy,
      editorName: users.name,
      editorUsername: users.username,
    })
    .from(pages)
    .leftJoin(users, eq(users.id, pages.updatedBy))
    .orderBy(asc(pages.order), asc(pages.title), asc(pages.id));
  return docs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    status: doc.status,
    audience: doc.audience,
    inMenu: doc.inMenu,
    order: doc.order,
    needsReview: doc.needsReview,
    updatedAt: doc.updatedAt.toISOString(),
    updatedByName: doc.updatedBy && doc.editorName != null ? doc.editorName || doc.editorUsername || "Staff" : null,
  }));
}

export async function getPageForEdit(id: string) {
  if (!isUuid(id)) return null;
  const [doc] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
  if (!doc) return null;
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    summary: doc.summary ?? "",
    bodyHtml: doc.bodyHtml,
    videoUrl: doc.videoUrl ?? "",
    status: doc.status,
    audience: doc.audience,
    inMenu: doc.inMenu,
    order: doc.order,
    needsReview: doc.needsReview,
    aliases: doc.aliases,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
export type PageFormValues = NonNullable<Awaited<ReturnType<typeof getPageForEdit>>>;
