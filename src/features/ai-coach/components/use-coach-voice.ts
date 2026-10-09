"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordClientEventAction } from "../actions";
import { speakableText } from "../prompt";
import type { SpeechChunkDTO } from "../types";
import { textToVisemes, visemeAt, type VisemeTrack } from "../voice-lib";
import { newFace, type CoachFace } from "./coach-avatar";

type Chunk = { text: string; audio: Promise<AudioBuffer | null> | null; visemes: VisemeTrack | null };

function audioContextClass() {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ??
    null
  );
}

function base64ToBuffer(base64: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Speaks the coach's replies and drives the avatar's face.
 *
 * A reply arrives as a queue of chunks (sentences): `begin(id)`, then
 * `enqueue()` each chunk as it streams in, then `end()`. Chunks with
 * ElevenLabs audio play through the Web Audio API (one context, unlocked on
 * the member's first tap, which also makes iOS play later chunks), with the
 * mouth following the audio's visemes and loudness. Chunks without audio are
 * read by the browser's own voice, with estimated mouth shapes per word.
 * `speak(id, text)` replays a saved reply the same way.
 */
export function useCoachVoice({ pitch = 1, onIdle }: { pitch?: number; onIdle?: () => void } = {}) {
  const face = useRef<CoachFace>(newFace());
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);

  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const queueRef = useRef<Chunk[]>([]);
  const endedRef = useRef(true);
  const playingRef = useRef(false);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const frameRef = useRef(0);
  const tokenRef = useRef(0);
  const idRef = useRef<string | null>(null);
  const reportedRef = useRef(false);
  const pitchRef = useRef(pitch);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    pitchRef.current = pitch;
    onIdleRef.current = onIdle;
  }, [pitch, onIdle]);

  /** Creates or resumes the audio context. Call from a tap or key press (browsers only allow audio after one). */
  const unlock = useCallback(() => {
    const Context = audioContextClass();
    if (!Context) return null;
    if (!contextRef.current) {
      const context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.connect(context.destination);
      contextRef.current = context;
      analyserRef.current = analyser;
    }
    if (contextRef.current.state === "suspended") void contextRef.current.resume().catch(() => undefined);
    return contextRef.current;
  }, []);

  const silence = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    face.current.level = 0;
    face.current.viseme = "rest";
    try {
      sourceRef.current?.stop();
    } catch {
      // already stopped
    }
    sourceRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const finish = useCallback(() => {
    silence();
    playingRef.current = false;
    idRef.current = null;
    setSpeakingId(null);
    setLoadingId(null);
    setCaption(null);
    onIdleRef.current?.();
  }, [silence]);

  const stop = useCallback(() => {
    const wasActive = idRef.current !== null;
    tokenRef.current++;
    queueRef.current = [];
    endedRef.current = true;
    silence();
    playingRef.current = false;
    idRef.current = null;
    setSpeakingId(null);
    setLoadingId(null);
    setCaption(null);
    return wasActive;
  }, [silence]);

  useEffect(() => () => void stop(), [stop]);

  const playBuffer = useCallback((buffer: AudioBuffer, visemes: VisemeTrack | null, token: number) => {
    return new Promise<void>((resolve) => {
      const context = contextRef.current;
      const analyser = analyserRef.current;
      if (!context || !analyser || tokenRef.current !== token) return resolve();
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(analyser);
      sourceRef.current = source;
      const data = new Uint8Array(analyser.fftSize);
      const startedAt = context.currentTime;
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) sum += ((sample - 128) / 128) ** 2;
        face.current.level = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
        const ms = (context.currentTime - startedAt) * 1000;
        face.current.viseme = visemes?.length
          ? visemeAt(visemes, ms)
          : face.current.level > 0.45
            ? "A"
            : face.current.level > 0.15
              ? "L"
              : "rest";
        frameRef.current = requestAnimationFrame(tick);
      };
      source.onended = () => {
        cancelAnimationFrame(frameRef.current);
        face.current.level = 0;
        face.current.viseme = "rest";
        resolve();
      };
      source.start();
      frameRef.current = requestAnimationFrame(tick);
    });
  }, []);

  const speakWithBrowser = useCallback((text: string, token: number) => {
    return new Promise<void>((resolve) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window) || tokenRef.current !== token)
        return resolve();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.pitch = pitchRef.current;
      const voices = window.speechSynthesis.getVoices();
      const preferred =
        voices.find((voice) => /en[-_]US/i.test(voice.lang) && /natural|neural|samantha|google/i.test(voice.name)) ??
        voices.find((voice) => /^en/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;
      let track: VisemeTrack = [];
      let wordStart = performance.now();
      utterance.onboundary = (event) => {
        // The browser only says where each word starts: estimate its mouth shapes.
        const word = text.slice(
          event.charIndex,
          event.charIndex + (event.charLength || text.slice(event.charIndex).search(/\s|$/)),
        );
        wordStart = performance.now();
        track = textToVisemes(word, 75);
      };
      const tick = () => {
        const ms = performance.now() - wordStart;
        face.current.viseme = visemeAt(track, ms);
        face.current.level = face.current.viseme === "rest" ? 0 : 0.55;
        frameRef.current = requestAnimationFrame(tick);
      };
      utterance.onstart = () => {
        frameRef.current = requestAnimationFrame(tick);
      };
      const done = () => {
        cancelAnimationFrame(frameRef.current);
        face.current.level = 0;
        face.current.viseme = "rest";
        resolve();
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.speak(utterance);
      if (!reportedRef.current) {
        reportedRef.current = true;
        void recordClientEventAction({ event: "voice_output" });
      }
    });
  }, []);

  const pump = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    const token = tokenRef.current;
    while (tokenRef.current === token) {
      const chunk = queueRef.current.shift();
      if (!chunk) break;
      setCaption(chunk.text);
      const buffer = chunk.audio ? await chunk.audio : null;
      if (tokenRef.current !== token) return;
      setLoadingId(null);
      setSpeakingId(idRef.current);
      if (buffer) await playBuffer(buffer, chunk.visemes, token);
      else await speakWithBrowser(chunk.text, token);
    }
    if (tokenRef.current !== token) return;
    playingRef.current = false;
    if (endedRef.current) finish();
  }, [finish, playBuffer, speakWithBrowser]);

  /** Starts speaking a reply that is still streaming. */
  const begin = useCallback(
    (id: string) => {
      stop();
      unlock();
      idRef.current = id;
      endedRef.current = false;
      reportedRef.current = false;
      setLoadingId(id);
    },
    [stop, unlock],
  );

  /** Adds a chunk: ElevenLabs audio, or text for the browser's voice. */
  const enqueue = useCallback(
    (chunk: Pick<SpeechChunkDTO, "text"> & Partial<Pick<SpeechChunkDTO, "audio" | "visemes">>) => {
      if (idRef.current === null) return;
      const context = contextRef.current;
      const audio =
        chunk.audio && context ? context.decodeAudioData(base64ToBuffer(chunk.audio)).catch(() => null) : null;
      queueRef.current.push({ text: chunk.text, audio, visemes: chunk.visemes ?? null });
      void pump();
    },
    [pump],
  );

  /** No more chunks for this reply; goes idle once the queue has played. */
  const end = useCallback(() => {
    if (idRef.current === null) return;
    endedRef.current = true;
    if (!playingRef.current && !queueRef.current.length) finish();
  }, [finish]);

  /** The reply's id changed (the streamed placeholder was saved). */
  const rename = useCallback((from: string, to: string) => {
    if (idRef.current !== from) return;
    idRef.current = to;
    setSpeakingId((current) => (current === from ? to : current));
    setLoadingId((current) => (current === from ? to : current));
  }, []);

  /** Reads a saved reply aloud, or plays a voice preview (`body`) in the designer. */
  const speak = useCallback(
    async (id: string, text: string, body: object = { messageId: id }) => {
      begin(id);
      const token = tokenRef.current;
      try {
        const response = await fetch("/api/ai/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(String(response.status));
        const chunk = (await response.json()) as SpeechChunkDTO;
        if (tokenRef.current !== token) return;
        enqueue(chunk);
      } catch {
        if (tokenRef.current !== token) return;
        // ElevenLabs unavailable: the browser's voice reads it.
        enqueue({ text: speakableText(text) });
      }
      if (tokenRef.current === token) end();
    },
    [begin, end, enqueue],
  );

  return { face, speakingId, loadingId, caption, unlock, begin, enqueue, end, rename, speak, stop };
}

export type CoachVoice = ReturnType<typeof useCoachVoice>;
