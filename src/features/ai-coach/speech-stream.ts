import "server-only";
import type { AiCoachVoice } from "@/server/db/schema/ai";
import { MAX_SPOKEN_CHARS } from "./constants";
import { speakableText } from "./prompt";
import { streamSpeech, type StreamedAudio } from "./speech";
import type { AiStreamEvent } from "./types";
import { SpeechChunker } from "./voice-lib";

/** Sentences being voiced at once (ElevenLabs plans limit concurrency). */
const CONCURRENCY = 3;

/** A sentence's audio as it streams in: pieces so far, and whether it's complete. */
type Sentence = { text: string; pieces: StreamedAudio[]; done: boolean; ok: boolean; wake: (() => void) | null };

/**
 * Speaks a reply while it streams: text deltas are cut into sentences, each is
 * voiced by ElevenLabs as soon as it is complete, and its audio goes out as
 * `speech` events piece by piece, as ElevenLabs makes it, in order (a
 * sentence's pieces, then the next sentence's). Up to CONCURRENCY sentences
 * are voiced at once; later ones wait their turn to be sent. If ElevenLabs
 * fails before a sentence has any audio, that sentence and the rest go out
 * with null audio, and the browser reads them with its own voice.
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
  let anyAudio = false;

  function say(raw: string) {
    const room = MAX_SPOKEN_CHARS - spoken.length;
    const text = speakableText(raw).slice(0, Math.max(0, room));
    if (!text) return;
    const seq = synthesis.length;
    const previousText = spoken;
    spoken = `${spoken} ${text}`.trimStart();
    const sentence: Sentence = { text, pieces: [], done: false, ok: false, wake: null };
    const update = () => {
      sentence.wake?.();
      sentence.wake = null;
    };
    const waitTurn = synthesis[seq - CONCURRENCY]?.catch(() => undefined) ?? Promise.resolve();
    const voiced = waitTurn
      .then(() =>
        failed || signal?.aborted
          ? false
          : streamSpeech(
              text,
              voice,
              (piece) => {
                sentence.pieces.push(piece);
                update();
              },
              { previousText, signal },
            ),
      )
      .then((ok) => {
        sentence.ok = ok;
        sentence.done = true;
        update();
      });
    synthesis.push(voiced);
    // Sends this sentence's pieces as they come, once the sentences before it are out.
    emitted = emitted.then(async () => {
      let part = 0;
      let closed = false;
      for (;;) {
        while (part < sentence.pieces.length) {
          const piece = sentence.pieces[part]!;
          const last = sentence.done && part === sentence.pieces.length - 1;
          emit({ type: "speech", seq, part, last, text, audio: piece.audio, visemes: piece.visemes, format: "pcm" });
          part++;
          anyAudio = true;
          closed = last;
        }
        if (sentence.done) break;
        await new Promise<void>((resolve) => (sentence.wake = resolve));
      }
      if (!sentence.ok && part === 0) {
        failed = true; // keep one voice: once ElevenLabs fails, the browser reads the rest
        emit({ type: "speech", seq, part: 0, last: true, text, audio: null, visemes: null });
      } else if (part > 0 && !closed) {
        // The last piece went out before the sentence was known to be complete: close it.
        emit({ type: "speech", seq, part, last: true, text, audio: null, visemes: null, format: "pcm" });
      }
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
      return anyAudio && !failed;
    },
  };
}
