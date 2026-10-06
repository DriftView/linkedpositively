import { and, eq } from "drizzle-orm";
import { getSettings } from "@/features/admin/settings";
import { speakableText } from "@/features/ai-coach/prompt";
import { speechRequestSchema } from "@/features/ai-coach/schemas";
import { synthesizeSpeech } from "@/features/ai-coach/speech";
import { AuthError, assertPermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { aiMessages } from "@/server/db/schema";
import { trackUsage } from "@/server/services/usage";

/**
 * The coach's reply as speech (MP3). Only the member's own replies can be
 * read. 503 means "use the browser's voice instead".
 */
export async function POST(request: Request) {
  let viewer;
  try {
    viewer = await assertPermission("ai.chat");
  } catch (error) {
    return Response.json({ error: error instanceof AuthError ? error.message : "Please sign in again." }, { status: 403 });
  }
  if (!(await getSettings()).aiVoiceEnabled) return Response.json({ error: "Voice is switched off." }, { status: 403 });

  const parsed = speechRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request." }, { status: 400 });
  const [message] = await db
    .select({ text: aiMessages.text })
    .from(aiMessages)
    .where(and(eq(aiMessages.id, parsed.data.messageId), eq(aiMessages.userId, viewer.id), eq(aiMessages.role, "assistant")))
    .limit(1);
  if (!message) return Response.json({ error: "That reply isn't available." }, { status: 404 });

  const audio = await synthesizeSpeech(speakableText(message.text));
  if (!audio) return Response.json({ error: "Voice service unavailable." }, { status: 503 });
  await trackUsage(viewer.id, "ai_voice_output", { provider: "elevenlabs" });
  return new Response(audio, { headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=3600" } });
}
