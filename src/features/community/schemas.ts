import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";
import { COMMENT_TARGET_TYPES, HEADLINE_MAX, REACTION_KINDS, REACTION_TARGET_TYPES, REPORT_TARGET_TYPES } from "./types";

/** Editor HTML is capped generously; the plain-text length is checked after sanitizing. */
const editorHtml = z.string().max(40_000);
const videoUrl = z.string().trim().max(500).optional();
const uploadId = uuidSchema.optional();

export const commentTargetSchema = z.object({ type: z.enum(COMMENT_TARGET_TYPES), id: uuidSchema });
export const reactionTargetSchema = z.object({ type: z.enum(REACTION_TARGET_TYPES), id: uuidSchema });

export const createPostSchema = z.object({
  html: editorHtml,
  headline: z.string().trim().max(HEADLINE_MAX).optional(),
  uploadId,
  videoUrl,
});

export const updatePostSchema = createPostSchema.extend({
  id: uuidSchema,
  /** true = drop the current photo (a new uploadId replaces it anyway). */
  removePhoto: z.boolean().optional(),
});

export const createCommentSchema = z.object({
  target: commentTargetSchema,
  html: editorHtml,
  uploadId,
  videoUrl,
});

export const updateCommentSchema = z.object({
  id: uuidSchema,
  html: editorHtml,
  uploadId,
  removePhoto: z.boolean().optional(),
  videoUrl,
});

export const idSchema = z.object({ id: uuidSchema });

export const reactSchema = z.object({ target: reactionTargetSchema, kind: z.enum(REACTION_KINDS).nullable() });

export const reportSchema = z.object({ type: z.enum(REPORT_TARGET_TYPES), id: uuidSchema });

export const moderateSchema = z.object({
  type: z.enum(REPORT_TARGET_TYPES),
  id: uuidSchema,
  action: z.enum(["delete", "clear", "whitelist", "unwhitelist"]),
});

export const feedSchema = z.object({
  cursor: z.string().max(80).nullable(),
  authorId: uuidSchema.optional(),
  tag: z.string().max(60).optional(),
  since: z.string().max(40).nullable().optional(),
});
