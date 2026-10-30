import "server-only";
import { env } from "@/env";
import type { AiCoachVoice } from "@/server/db/schema/ai";
import { logger } from "@/server/logger";
import { coachVoice } from "./coach-design";
import { MAX_SPOKEN_CHARS } from "./constants";
import { JsonLineReader } from "./lib";
import { STREAM_FORMAT, STREAM_SAMPLE_RATE } from "./pcm";
import { elevenLabsDown, reportElevenLabsFailure, reportElevenLabsSuccess } from "./voice-status";
import { alignmentToVisemes, type VisemeTrack } from "./voice-lib";

/**
 * Voice through ElevenLabs: text to speech for the coach's replies (with
 * per-character timing for lip sync), and speech to text for members who talk
 * instead of typing. When ElevenLabs is not configured (or fails) callers get
 * null and the browser falls back to its own speech features. While ElevenLabs
 * is out of credits or down (voice-status.ts), speech is skipped at once.
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

/** Speaker boost is off: it adds latency for little difference on phone speakers. */
const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: false };

/** One piece of a streamed sentence: PCM (base64, STREAM_FORMAT) and the mouth shapes for it, timed from the sentence's start. */
export type StreamedAudio = { audio: string; visemes: VisemeTrack };

/**
 * Speaks `text` as a stream: each piece of audio is handed to `onAudio` as
 * soon as ElevenLabs makes it, instead of after the whole sentence is done
 * (`stream/with-timestamps`, raw PCM so the browser plays it without
 * decoding). Resolves to whether any audio came; false means "use the
 * browser's voice" (not configured, out of credits, or the request failed
 * before any audio). A failure partway ends the sentence early.
 */
export async function streamSpeech(
  text: string,
  voice: AiCoachVoice | null,
  onAudio: (piece: StreamedAudio) => void,
  context: { previousText?: string; nextText?: string; signal?: AbortSignal } = {},
): Promise<boolean> {
  if (!env.ELEVENLABS_API_KEY || !text.trim() || elevenLabsDown()) return false;
  const voiceId = voice ? coachVoice(voice).elevenLabsId : env.ELEVENLABS_VOICE_ID;
  let pieces = 0;
  try {
    const response = await fetch(
      `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}/stream/with-timestamps?output_format=${STREAM_FORMAT}`,
      {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, MAX_SPOKEN_CHARS),
          model_id: env.ELEVENLABS_MODEL_ID,
          voice_settings: VOICE_SETTINGS,
          ...(context.previousText ? { previous_text: context.previousText.slice(-500) } : {}),
          ...(context.nextText ? { next_text: context.nextText.slice(0, 500) } : {}),
        }),
        signal: context.signal
          ? AbortSignal.any([context.signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok || !response.body) {
      logger.warn({ status: response.status }, "elevenlabs tts stream failed");
      await reportElevenLabsFailure(response);
      return false;
    }
    reportElevenLabsSuccess();
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    const lines = new JsonLineReader();
    // Seconds of audio handed on so far, and where the last piece's characters ended: placing each
    // piece's mouth shapes on the sentence's timeline.
    let offset = 0;
    let lastEnd = 0;
    // Whether timings count from the sentence's start or from each piece's: decided on the second piece that has any.
    let relative: boolean | null = null;
    // 16-bit samples must not be split between pieces: a stray byte waits for the next piece.
    let carry: Buffer | null = null;
    const handle = (line: unknown) => {
      const data = line as TimestampResponse;
      if (!data.audio_base64) return;
      let bytes = Buffer.from(data.audio_base64, "base64");
      if (carry) bytes = Buffer.concat([carry, bytes]);
      carry = bytes.length % 2 ? bytes.subarray(bytes.length - 1) : null;
      if (carry) bytes = bytes.subarray(0, bytes.length - 1);
      if (!bytes.length) return;
      const seconds = bytes.length / 2 / STREAM_SAMPLE_RATE;
      const alignment = data.alignment;
      let visemes: VisemeTrack = [];
      if (alignment?.characters.length) {
        const first = alignment.character_start_times_seconds[0] ?? 0;
        if (pieces > 0 && relative === null) relative = first + 0.05 < lastEnd;
        const shift = relative ? offset : 0;
        lastEnd = (alignment.character_end_times_seconds.at(-1) ?? first) + shift;
        const track = alignmentToVisemes(
          alignment.characters,
          alignment.character_start_times_seconds.map((time) => time + shift),
          alignment.character_end_times_seconds.map((time) => time + shift),
        );
        visemes = pieces > 0 ? track.slice(1) : track; // only the first piece starts at rest
      }
      offset += seconds;
      pieces++;
      onAudio({ audio: bytes.toString("base64"), visemes });
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const line of lines.push(value)) handle(line);
    }
    for (const line of lines.flush()) handle(line);
    return pieces > 0;
  } catch (error) {
    if (context.signal?.aborted) return pieces > 0;
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "elevenlabs tts stream failed");
    if (!pieces) await reportElevenLabsFailure(null);
    return pieces > 0;
  }
}

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
  if (!env.ELEVENLABS_API_KEY || !text.trim() || elevenLabsDown()) return null;
  const voiceId = voice ? coachVoice(voice).elevenLabsId : env.ELEVENLABS_VOICE_ID;
  try {
    const response = await fetch(
      `${BASE}/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_22050_32`,
      {
        method: "POST",
        headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({
          text: text.slice(0, MAX_SPOKEN_CHARS),
          model_id: env.ELEVENLABS_MODEL_ID,
          voice_settings: VOICE_SETTINGS,
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
      await reportElevenLabsFailure(response);
      return null;
    }
    reportElevenLabsSuccess();
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
    await reportElevenLabsFailure(null);
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
      await reportElevenLabsFailure(response);
      return null;
    }
    reportElevenLabsSuccess();
    const data = (await response.json()) as { text?: string };
    return typeof data.text === "string" ? data.text.trim() : null;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "elevenlabs stt failed");
    await reportElevenLabsFailure(null);
    return null;
  }
}

/**
 * A single-use token (15 minutes, one connection) for ElevenLabs' real-time
 * transcription, so the browser can stream a voice chat's audio while the
 * member talks without seeing the API key. Null when unavailable.
 */
export async function createRealtimeTranscriptionToken(): Promise<string | null> {
  if (!env.ELEVENLABS_API_KEY) return null;
  try {
    const response = await fetch(`${BASE}/single-use-token/realtime_scribe`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "elevenlabs realtime token failed");
      await reportElevenLabsFailure(response);
      return null;
    }
    const data = (await response.json()) as { token?: string };
    return data.token ?? null;
  } catch (error) {
    logger.warn({ err: error instanceof Error ? error.message : String(error) }, "elevenlabs realtime token failed");
    return null;
  }
}
