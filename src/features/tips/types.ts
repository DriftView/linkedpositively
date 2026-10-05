/**
 * Client-safe DTOs for tips. `TipCardData` is the contract other areas use
 * (wall feed, search): build it with `feedTips` / `searchTips` in queries.ts
 * and render it with `<TipCard>` from components/tip-card.tsx.
 */
export type TipTypeName = "html" | "video" | "pdf" | "offsite";

export type TipTagData = { id: string; name: string; slug: string };

export type TipCardData = {
  id: string;
  title: string;
  type: TipTypeName;
  /** Legacy layout template (text_blockquote, video_text…) or null. */
  template: string | null;
  /** Sanitized staff HTML. */
  html: string;
  /** Plain-text short description (video/pdf/offsite tips). */
  description: string;
  pullquote: string | null;
  video: { url: string; embedUrl: string | null; thumbnailUrl: string | null } | null;
  /** True when a PDF is attached; open it through `/tips/{id}/pdf`. */
  hasPdf: boolean;
  pdfName: string | null;
  link: string | null;
  tags: TipTagData[];
  category: TipTagData | null;
  /** Matches the viewer's tailoring rule ("Recommended for you"). */
  recommended: boolean;
  favorited: boolean;
  /** Released after the viewer last opened Your Tips. */
  isNew: boolean;
  /** When this tip reached the viewer (ISO), for feed ordering. Null in staff preview. */
  releasedAt: string | null;
  /** Study day it was released on, e.g. 12. */
  studyDay: number | null;
  /** Plain-text excerpt (≈180 chars) for compact cards and search. */
  excerpt: string;
  href: string;
  /** False for staff previews and people who can't earn points. */
  canEarnPoints: boolean;
};

export type TipPage<T> = { items: T[]; total: number; page: number; pageCount: number };
