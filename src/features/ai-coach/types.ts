import type {
  AiAlertCategory,
  AiAlertLevel,
  AiAlertSource,
  AiAlertStatus,
  AiCards,
  AiOutcome,
  AiRiskLevel,
  AiTopic,
} from "@/server/db/schema/ai";
import type { AiCoachId } from "@/server/db/schema/ai";
import type { CoachDesign } from "./coach-design";
import type { VisemeTrack } from "./voice-lib";

/** Client-safe DTOs and the chat stream protocol of the AI Coach. */

export type { AiCards };

export type ConversationSummaryDTO = { id: string; title: string; lastMessageAt: string; messageCount: number };

export type ChatMessageDTO = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: AiCards | null;
  feedback: 1 | -1 | null;
  outcome: AiOutcome | null;
  createdAt: string;
};

export type AiPreferencesDTO = { personalize: boolean; autoSpeak: boolean; design: CoachDesign };

/**
 * One spoken piece of a reply: audio (base64) with its lip-sync track, or null
 * audio = use the browser's voice for `text`. Saved replies, previews and
 * backchannels are one MP3 each. A streamed reply sends each sentence (`seq`)
 * as several pieces of raw PCM (`format` "pcm", see pcm.ts STREAM_FORMAT) as
 * ElevenLabs makes them: `part` 0, 1, 2…, the last one with `last` true. A
 * piece's visemes are timed from the start of its sentence.
 */
export type SpeechChunkDTO = {
  seq: number;
  text: string;
  audio: string | null;
  visemes: VisemeTrack | null;
  format?: "mp3" | "pcm";
  part?: number;
  last?: boolean;
};

/**
 * Events streamed from POST /api/ai/chat, one JSON object per line (NDJSON).
 * `timing` (development only) reports how long the server took for each step.
 * `text` deltas build the reply; `cards` merge into it; `done` carries the
 * stored reply. When the request asked to `speak`, `speech` events carry the
 * reply as audio, sentence by sentence, in order, then `spoken` (no more
 * audio for this reply), all before `done`. `spoken` can come well before
 * `done`, which waits for the safety review and the saves.
 */
export type AiStreamEvent =
  | { type: "start"; conversationId: string; userMessageId: string; title: string }
  | { type: "text"; delta: string }
  | { type: "status"; label: string }
  | { type: "cards"; cards: AiCards }
  | { type: "safety"; level: "elevated" | "urgent"; category: string }
  | ({ type: "speech" } & SpeechChunkDTO)
  | { type: "spoken" }
  | { type: "timing"; ms: Record<string, number> }
  | { type: "done"; message: ChatMessageDTO }
  | { type: "error"; message: string };

export type AlertRowDTO = {
  id: string;
  level: AiAlertLevel;
  category: AiAlertCategory;
  source: AiAlertSource;
  status: AiAlertStatus;
  reason: string;
  member: { id: string; name: string; username: string };
  conversationId: string | null;
  handledByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlertDetailDTO = AlertRowDTO & {
  staffNote: string;
  messageId: string | null;
  coachName: string | null;
  transcript: { id: string; role: "user" | "assistant"; text: string; risk: AiRiskLevel; createdAt: string }[];
};

export type ArticleRowDTO = {
  id: string;
  title: string;
  topic: AiTopic;
  published: boolean;
  needsReview: boolean;
  updatedAt: string;
};

export type ArticleFormDTO = {
  id: string | null;
  title: string;
  topic: AiTopic;
  body: string;
  sourceUrl: string;
  published: boolean;
  needsReview: boolean;
  reviewedByName: string | null;
  reviewedAt: string | null;
};

export type AiStatsDTO = {
  days: number;
  members: number;
  conversations: number;
  memberMessages: number;
  voiceMessages: number;
  helpful: number;
  notHelpful: number;
  fallbacks: number;
  alerts: { open: number; total: number; urgent: number };
  handoffsShown: number;
  handoffsSent: number;
  resourcesShown: number;
  resolvedWithoutHuman: number;
  avgLatencyMs: number | null;
  tokens: { input: number; output: number };
  daily: { day: string; messages: number; members: number }[];
};

/** What the coach opens with (load.ts): the AI Coach page and the floating coach. */
export type AiCoachData = {
  conversationId: string | null;
  title: string | null;
  initialMessages: ChatMessageDTO[];
  conversations: ConversationSummaryDTO[];
  preferences: AiPreferencesDTO;
  voiceEnabled: boolean;
  serverVoice: boolean;
  /** The video coach (Anam) is available: it plays the coach in voice chat, and the coach's photo shows elsewhere. */
  videoAvailable: boolean;
  aiAvailable: boolean;
  timezone: string;
  firstName: string;
  /** The coaches members can choose now (coach-availability.ts). */
  coachIds: AiCoachId[];
};
