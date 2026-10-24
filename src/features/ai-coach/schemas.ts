import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";
import {
  AI_ALERT_STATUSES,
  AI_COACH_IDS,
  AI_COACH_TONES,
  AI_COACH_VOICES,
  AI_REPLY_LENGTHS,
  AI_TOPICS,
} from "@/server/db/schema/ai";
import { BACKCHANNELS } from "./coach-design";
import { MAX_MESSAGE_LENGTH } from "./constants";

/** Body of POST /api/ai/chat. */
export const chatRequestSchema = z.object({
  conversationId: uuidSchema.nullable().optional(),
  text: z
    .string()
    .trim()
    .min(1, "Write a message first")
    .max(MAX_MESSAGE_LENGTH, `Keep messages under ${MAX_MESSAGE_LENGTH} characters`),
  /** Device location for this message, "lat,lng", only when the member shared it. */
  near: z
    .string()
    .regex(/^-?\d{1,2}(\.\d+)?,-?\d{1,3}(\.\d+)?$/)
    .nullable()
    .optional(),
  viaVoice: z.boolean().optional(),
  /** Hands-free talk mode (for usage stats). */
  handsFree: z.boolean().optional(),
  /** Stream the reply as speech too (sentence by sentence, see AiStreamEvent "speech"). */
  speak: z.boolean().optional(),
});

export const conversationIdSchema = z.object({ conversationId: uuidSchema });

export const feedbackSchema = z.object({
  messageId: uuidSchema,
  value: z.union([z.literal(1), z.literal(-1), z.null()]),
});

export const preferencesSchema = z.object({
  personalize: z.boolean(),
  autoSpeak: z.boolean(),
});

/** The coach picker: one of the fixed coaches, plus how it talks. */
export const coachDesignSchema = z.object({
  coachId: z.enum(AI_COACH_IDS),
  tone: z.enum(AI_COACH_TONES),
  replyLength: z.enum(AI_REPLY_LENGTHS),
});

export const AI_CLIENT_EVENTS = ["handoff_sent", "voice_output"] as const;
export const clientEventSchema = z.object({ event: z.enum(AI_CLIENT_EVENTS) });

/** Body of POST /api/ai/speech: a reply of the member's to read aloud, or a voice to preview in the coach picker. */
export const speechRequestSchema = z.union([
  z.object({ messageId: uuidSchema }),
  z.object({ preview: z.enum(AI_COACH_VOICES) }),
  /** BACKCHANNELS[backchannel] in the member's coach voice. */
  z.object({ backchannel: z.number().int().min(0).max(BACKCHANNELS.length - 1) }),
]);

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
