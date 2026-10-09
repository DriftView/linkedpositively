import { getSettings } from "@/features/admin/settings";
import { MAX_AUDIO_BYTES } from "@/features/ai-coach/constants";
import { transcribeSpeech } from "@/features/ai-coach/speech";
import { AuthError, assertPermission } from "@/server/auth/session";

export const maxDuration = 60;

/**
 * Turns a voice recording into text for the message box (the member reviews
 * it before sending). The audio is not stored. 503 means "use the browser's
 * speech recognition instead".
 */
export async function POST(request: Request) {
  try {
    await assertPermission("ai.chat");
  } catch (error) {
    return Response.json(
      { error: error instanceof AuthError ? error.message : "Please sign in again." },
      { status: 403 },
    );
  }
  if (!(await getSettings()).aiVoiceEnabled) return Response.json({ error: "Voice is switched off." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || !audio.size)
    return Response.json({ error: "No recording received." }, { status: 400 });
  if (audio.size > MAX_AUDIO_BYTES)
    return Response.json({ error: "That recording is too long. Try a shorter message." }, { status: 413 });
  if (audio.type && !/^(audio|video)\//.test(audio.type))
    return Response.json({ error: "That isn't an audio recording." }, { status: 415 });

  const text = await transcribeSpeech(audio);
  if (text === null) return Response.json({ error: "Voice service unavailable." }, { status: 503 });
  return Response.json({ text });
}
