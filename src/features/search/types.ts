import type { AuthorDTO } from "@/features/community/types";
import type { Segment } from "./text";

/** A wall post in search results (client-safe). */
export type PostHit = {
  id: string;
  author: AuthorDTO;
  createdAt: string;
  headline: string | null;
  excerpt: Segment[];
  hasPhoto: boolean;
  hasVideo: boolean;
  commentCount: number;
  reactionCount: number;
  tipComment: boolean;
  /** Set when only a comment matched. */
  comment: { author: AuthorDTO; excerpt: Segment[] } | null;
};
