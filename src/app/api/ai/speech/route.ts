import { and, eq } from "drizzle-orm";
import { getSettings } from "@/features/admin/settings";
import { resolveCoach, VOICE_PREVIEW_TEXT } from "@/features/ai-coach/coach-design";
import { speakableText } from "@/features/ai-coach/prompt";
import { getPreferences } from "@/features/ai-coach/queries";
import { speechRequestSchema } from "@/features/ai-coach/schemas";
import { synthesizeSpeech } from "@/features/ai-coach/speech";
import type { SpeechChunkDTO } from "@/features/ai-coach/types";
import { AuthError, assertPermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { aiMessages } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";

/**
 * Speech for the coach (JSON SpeechChunkDTO: MP3 as base64 plus its lip-sync
 * track). Reads one of the member's own replies in their coach's voice, or a
 * fixed sample sentence to preview a voice in the designer; nothing else, so
 * this can't be used to voice arbitrary text. 503 means "use the browser's
 * voice instead".
 */
export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await assertPermission("ai.chat");
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.message : "Please sign in again." },
      { status: 403 },
    );
  }
  if (!(await getSettings()).aiVoiceEnabled) return Response.json({ error: "Voice is switched off." }, { status: 403 });

  const parsed = speechRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });

  if ("preview" in parsed.data) {
    const spoken = await synthesizeSpeech(VOICE_PREVIEW_TEXT, parsed.data.preview);
    if (!spoken) return Response.json({ error: "Voice service unavailable." }, { status: 503 });
    const body: SpeechChunkDTO = { seq: 0, text: VOICE_PREVIEW_TEXT, ...spoken };
    return Response.json(body, { headers: { "cache-control": "private, max-age=86400" } });
  }

  const [message] = await db
    .select({ text: aiMessages.text })
    .from(aiMessages)
    .where(
      and(eq(aiMessages.id, parsed.data.messageId), eq(aiMessages.userId, viewer.id), eq(aiMessages.role, "assistant")),
    )
    .limit(1);
  if (!message) return Response.json({ error: "That reply isn't available." }, { status: 404 });

  const text = speakableText(message.text);
  const voice = resolveCoach((await getPreferences(viewer.id)).design).voice;
  const spoken = await synthesizeSpeech(text, voice);
  if (!spoken) return Response.json({ error: "Voice service unavailable." }, { status: 503 });
  await trackUsage(viewer.id, "ai_voice_output", { provider: "elevenlabs" });
  const body: SpeechChunkDTO = { seq: 0, text, ...spoken };
  return Response.json(body, { headers: { "cache-control": "private, no-store" } });
}
