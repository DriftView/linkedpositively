import "server-only";
import { env } from "@/env";
import { logger } from "@/server/logger";

/**
 * Voice through ElevenLabs: text to speech for the coach's replies, and
 * speech to text for members who talk instead of typing. When ElevenLabs is
 * not configured (or fails) the routes answer 503 and the browser falls back
 * to its own speech features.
 */

const BASE = "https://api.elevenlabs.io/v1";

export function voiceConfigured() {
  return Boolean(env.ELEVENLABS_API_KEY);
}

/** MP3 audio of `text`, or null. Text is capped so one reply can't run up the bill. */
export async function synthesizeSpeech(text: string): Promise<ReadableStream<Uint8Array> | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const response = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(env.ELEVENLABS_VOICE_ID)}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({
        text: text.slice(0, 2500),
        model_id: env.ELEVENLABS_MODEL_ID,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok || !response.body) {
      logger.warn({ status: response.status }, "elevenlabs tts failed");
      return null;
    }
    return response.body;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "elevenlabs tts failed");
    return null;
  }
}

/** The words in a recording, or null. */
export async function transcribeSpeech(audio: Blob): Promise<string | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const form = new FormData();
    form.append("model_id", "scribe_v1");
    form.append("file", audio, "recording");
    const response = await fetch(`${BASE}/speech-to-text`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      body: form,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "elevenlabs stt failed");
      return null;
    }
    const data = (await response.json()) as { text?: string };
    return typeof data.text === "string" ? data.text.trim() : null;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "elevenlabs stt failed");
    return null;
  }
}
