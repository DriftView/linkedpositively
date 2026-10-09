import "server-only";
import { env } from "@/env";
import type { AiCoachVoice } from "@/server/db/schema/ai";
import { logger } from "@/server/logger";
import { coachVoice } from "./coach-design";
import { MAX_SPOKEN_CHARS } from "./constants";
import { alignmentToVisemes, type VisemeTrack } from "./voice-lib";

/**
 * Voice through ElevenLabs: text to speech for the coach's replies (with
 * per-character timing for lip sync), and speech to text for members who talk
 * instead of typing. When ElevenLabs is not configured (or fails) callers get
 * null and the browser falls back to its own speech features.
 */

const BASE = "https://api.elevenlabs.io/v1";

export function voiceConfigured() {
  return Boolean(env.ELEVENLABS_API_KEY);
}

export type SpokenAudio = { audio: string; visemes: VisemeTrack };

type TimestampResponse = {
  audio_base64?: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  } | null;
};

/**
 * MP3 audio of `text` (base64) in the member's chosen voice, with its
 * lip-sync track, or null. `previousText`/`nextText` let ElevenLabs keep the
 * intonation natural when a reply is spoken sentence by sentence.
 */
export async function synthesizeSpeech(
  text: string,
  voice: AiCoachVoice | null,
  context: { previousText?: string; nextText?: string; signal?: AbortSignal } = {},
): Promise<SpokenAudio | null> {
  if (!env.ELEVENLABS_API_KEY || !text.trim()) return null;
  const voiceId = voice ? coachVoice(voice).elevenLabsId : env.ELEVENLABS_VOICE_ID;
  try {
    const response = await fetch(
      `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, MAX_SPOKEN_CHARS),
          model_id: env.ELEVENLABS_MODEL_ID,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true },
          ...(context.previousText ? { previous_text: context.previousText.slice(-500) } : {}),
          ...(context.nextText ? { next_text: context.nextText.slice(0, 500) } : {}),
        }),
        signal: context.signal
          ? AbortSignal.any([context.signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      logger.warn({ status: response.status }, "elevenlabs tts failed");
      return null;
    }
    const data = (await response.json()) as TimestampResponse;
    if (!data.audio_base64) return null;
    const alignment = data.alignment;
    const visemes = alignment
      ? alignmentToVisemes(
          alignment.characters,
          alignment.character_start_times_seconds,
          alignment.character_end_times_seconds,
        )
      : [];
    return { audio: data.audio_base64, visemes };
  } catch (error) {
    if (context.signal?.aborted) return null;
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
    // Words only, no "(laughs)"-style sound tags: the text is sent to the coach as the member's message.
    form.append("tag_audio_events", "false");
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
