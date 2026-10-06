import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";
import { AI_ALERT_STATUSES, AI_COACH_LOOKS, AI_TOPICS } from "@/server/db/schema/ai";
import { MAX_MESSAGE_LENGTH } from "./constants";

/** Body of POST /api/ai/chat. */
export const chatRequestSchema = z.object({
  conversationId: uuidSchema.nullable().optional(),
  text: z.string().trim().min(1, "Write a message first").max(MAX_MESSAGE_LENGTH, `Keep messages under ${MAX_MESSAGE_LENGTH} characters`),
  /** Device location for this message, "lat,lng", only when the member shared it. */
  near: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
    .nullable()
    .optional(),
  viaVoice: z.boolean().optional(),
});

export const conversationIdSchema = z.object({ conversationId: uuidSchema });

export const feedbackSchema = z.object({ messageId: uuidSchema, value: z.union([z.literal(1), z.literal(-1), z.null()]) });

export const preferencesSchema = z.object({
  personalize: z.boolean(),
  autoSpeak: z.boolean(),
  look: z.enum(AI_COACH_LOOKS),
});

export const AI_CLIENT_EVENTS = ["handoff_sent", "voice_output"] as const;
export const clientEventSchema = z.object({ event: z.enum(AI_CLIENT_EVENTS) });

/** Body of POST /api/ai/speech. */
export const speechRequestSchema = z.object({ messageId: uuidSchema });

export const alertUpdateSchema = z.object({
  id: uuidSchema,
  status: z.enum(AI_ALERT_STATUSES),
  staffNote: z.string().trim().max(4000).default(""),
});

export const articleFormSchema = z.object({
  id: uuidSchema.nullable(),
  title: z.string().trim().min(3, "Add a title").max(200),
  topic: z.enum(AI_TOPICS),
  body: z.string().trim().min(20, "Write the approved information (at least a sentence or two)").max(20_000),
  sourceUrl: z.union([z.literal(""), z.url("Enter a full https:// link").max(1000)]),
  published: z.boolean(),
  /** Ticked by a reviewer to record that the study team approved this text. */
  approved: z.boolean(),
});
export type ArticleFormInput = z.input<typeof articleFormSchema>;

export const articleIdSchema = z.object({ id: uuidSchema });
