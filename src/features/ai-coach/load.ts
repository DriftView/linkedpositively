import "server-only";
import { getSettings } from "@/features/admin/settings";
import { type Viewer } from "@/server/auth/session";
import { videoConfigured } from "./avatar";
import { aiConfigured } from "./claude";
import { getConversationMessages, getPreferences, listConversations } from "./queries";
import { voiceConfigured } from "./speech";
import type { AiCoachData } from "./types";

/** The floating coach picks up the latest conversation when it is this recent; otherwise it starts a new one. */
const RESUME_WITHIN_MS = 12 * 60 * 60 * 1000;

/**
 * Everything the coach needs to open, shared by the AI Coach page and the
 * floating coach (GET /api/ai/coach). Null when the coach is switched off.
 * `conversation`: an id to open, "latest" to resume a recent one, or null for a new one.
 */
export async function loadCoach(viewer: Viewer, conversation: string | "latest" | null): Promise<AiCoachData | null> {
  const settings = await getSettings();
  if (!settings.aiCoachEnabled) return null;

  const [preferences, conversations] = await Promise.all([getPreferences(viewer.id), listConversations(viewer.id)]);
  let requested = conversation;
  if (requested === "latest") {
    const latest = conversations[0];
    requested =
      latest && Date.now() - new Date(latest.lastMessageAt).getTime() < RESUME_WITHIN_MS ? latest.id : null;
  }
  const messages = requested ? await getConversationMessages(viewer.id, requested) : null;
  const conversationId = messages ? requested : null;

  return {
    conversationId,
    title: conversations.find((item) => item.id === conversationId)?.title ?? null,
    initialMessages: messages ?? [],
    conversations,
    preferences,
    voiceEnabled: settings.aiVoiceEnabled,
    serverVoice: voiceConfigured(),
    videoAvailable: settings.aiVoiceEnabled && settings.aiVideoEnabled && voiceConfigured() && videoConfigured(),
    aiAvailable: aiConfigured(),
    timezone: viewer.timezone,
    firstName: viewer.name.split(" ")[0] ?? "",
  };
}
