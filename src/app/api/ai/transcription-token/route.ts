import { getSettings } from "@/features/admin/settings";
import { createRealtimeTranscriptionToken } from "@/features/ai-coach/speech";
import { AuthError, assertPermission } from "@/server/auth/session";

/**
 * A single-use token for live transcription during voice chat (ElevenLabs
 * real-time speech to text): the words are ready as soon as the member stops
 * talking. 503 means "upload each turn instead" (POST /api/ai/transcribe).
 */
export async function POST() {
  try {
    await assertPermission("ai.chat");
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.message : "Please sign in again." },
      { status: 403 },
    );
  }
  const settings = await getSettings();
  if (!settings.aiCoachEnabled || !settings.aiVoiceEnabled)
    return Response.json({ error: "Voice is switched off." }, { status: 403 });

  const token = await createRealtimeTranscriptionToken();
  if (!token) return Response.json({ error: "Live transcription unavailable." }, { status: 503 });
  return Response.json({ token }, { headers: { "cache-control": "private, no-store" } });
}
