import "server-only";
import type { AiCoachVoice } from "@/server/db/schema/ai";
import { MAX_SPOKEN_CHARS } from "./constants";
import { speakableText } from "./prompt";
import { synthesizeSpeech } from "./speech";
import type { AiStreamEvent } from "./types";
import { SpeechChunker } from "./voice-lib";

/** Voice requests in flight at once (ElevenLabs plans limit concurrency). */
const CONCURRENCY = 2;

/**
 * Speaks a reply while it streams: text deltas are cut into sentences, each is
 * sent to ElevenLabs as soon as it is complete, and the audio is emitted as
 * `speech` events in order. If ElevenLabs fails, that chunk and the rest go
 * out with null audio, and the browser reads them with its own voice.
 */
export function createSpeechStream({
  voice,
  emit,
  signal,
}: {
  voice: AiCoachVoice;
  emit: (event: AiStreamEvent) => void;
  signal?: AbortSignal;
}) {
  const chunker = new SpeechChunker();
  const synthesis: Promise<unknown>[] = [];
  let emitted: Promise<void> = Promise.resolve();
  let spoken = "";
  let failed = false;

  function say(raw: string) {
    const room = MAX_SPOKEN_CHARS - spoken.length;
    const text = speakableText(raw).slice(0, Math.max(0, room));
    if (!text) return;
    const seq = synthesis.length;
    const previousText = spoken;
    spoken = `${spoken} ${text}`.trimStart();
    const waitTurn = synthesis[seq - CONCURRENCY]?.catch(() => undefined) ?? Promise.resolve();
    const audio = waitTurn.then(() =>
      failed || signal?.aborted ? null : synthesizeSpeech(text, voice, { previousText, signal }),
    );
    synthesis.push(audio);
    emitted = emitted.then(async () => {
      const result = await audio;
      if (!result) failed = true; // keep one voice: once ElevenLabs fails, the browser reads the rest
      emit({ type: "speech", seq, text, audio: result?.audio ?? null, visemes: result?.visemes ?? null });
    });
  }

  return {
    push(delta: string) {
      for (const chunk of chunker.push(delta)) say(chunk);
    },
    /** Speaks what's left and waits until every chunk has been emitted. Returns whether any audio came from ElevenLabs. */
    async finish() {
      const rest = chunker.flush();
      if (rest) say(rest);
      await emitted;
      return synthesis.length > 0 && !failed;
    },
  };
}
