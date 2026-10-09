import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";
import {
  AI_ALERT_STATUSES,
  AI_COACH_EARRINGS,
  AI_COACH_FACIAL_HAIR,
  AI_COACH_GLASSES,
  AI_COACH_HAIR_COLORS,
  AI_COACH_HAIRS,
  AI_COACH_LOOKS,
  AI_COACH_OUTFIT_COLORS,
  AI_COACH_OUTFITS,
  AI_COACH_PRONOUNS,
  AI_COACH_SKINS,
  AI_COACH_TONES,
  AI_COACH_VOICES,
  AI_REPLY_LENGTHS,
  AI_TOPICS,
} from "@/server/db/schema/ai";
import { COACH_NAME_PATTERN } from "./coach-design";
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

export const appearanceSchema = z.object({
  skin: z.enum(AI_COACH_SKINS),
  hair: z.enum(AI_COACH_HAIRS),
  hairColor: z.enum(AI_COACH_HAIR_COLORS),
  facialHair: z.enum(AI_COACH_FACIAL_HAIR),
  glasses: z.enum(AI_COACH_GLASSES),
  earrings: z.enum(AI_COACH_EARRINGS),
  outfit: z.enum(AI_COACH_OUTFITS),
  outfitColor: z.enum(AI_COACH_OUTFIT_COLORS),
});

/** The coach designer. Fixed choices only; the name is letters and spaces (it goes into the coach's instructions). */
export const coachDesignSchema = z.object({
  look: z.enum(AI_COACH_LOOKS),
  name: z
    .string()
    .trim()
    .max(20, "Keep the name under 20 characters")
    .regex(COACH_NAME_PATTERN, "Use letters and spaces only")
    .nullable()
    .or(z.literal("").transform(() => null)),
  pronouns: z.enum(AI_COACH_PRONOUNS).nullable(),
  appearance: appearanceSchema.nullable(),
  voice: z.enum(AI_COACH_VOICES).nullable(),
  tone: z.enum(AI_COACH_TONES),
  replyLength: z.enum(AI_REPLY_LENGTHS),
});

export const AI_CLIENT_EVENTS = ["handoff_sent", "voice_output"] as const;
export const clientEventSchema = z.object({ event: z.enum(AI_CLIENT_EVENTS) });

/** Body of POST /api/ai/speech: a reply of the member's to read aloud, or a voice to preview in the designer. */
export const speechRequestSchema = z.union([
  z.object({ messageId: uuidSchema }),
  z.object({ preview: z.enum(AI_COACH_VOICES) }),
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
