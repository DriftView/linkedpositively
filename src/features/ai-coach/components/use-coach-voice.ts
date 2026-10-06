"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordClientEventAction } from "../actions";
import { speakableText } from "../prompt";

/**
 * Plays the coach's replies aloud and drives the avatar's mouth.
 * ElevenLabs audio (via /api/ai/speech) is analysed with the Web Audio API so
 * the mouth follows the real loudness of the voice. Without ElevenLabs, the
 * browser's own speech synthesis reads the reply and the mouth moves with
 * each spoken word.
 */
export function useCoachVoice() {
  const level = useRef(0);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef(0);
  const urlRef = useRef<string | null>(null);
  const tokenRef = useRef(0);

  const cleanup = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    level.current = 0;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  const stop = useCallback(() => {
    tokenRef.current++;
    cleanup();
    setSpeakingId(null);
    setLoadingId(null);
  }, [cleanup]);

  useEffect(() => stop, [stop]);

  const speakWithBrowser = useCallback(
    (id: string, text: string, token: number) => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return false;
      const utterance = new SpeechSynthesisUtterance(speakableText(text));
      utterance.rate = 1;
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find((voice) => /en[-_]US/i.test(voice.lang) && /natural|neural|samantha|google/i.test(voice.name)) ?? voices.find((voice) => /^en/i.test(voice.lang));
      if (preferred) utterance.voice = preferred;
      let wordAt = 0;
      utterance.onboundary = () => {
        wordAt = performance.now();
      };
      utterance.onstart = () => {
        if (tokenRef.current !== token) return;
        setLoadingId(null);
        setSpeakingId(id);
        const tick = () => {
          // Open on each word, then close: a simple, readable mouth movement.
          const since = performance.now() - wordAt;
          level.current = since < 260 ? 0.25 + 0.6 * Math.sin((since / 260) * Math.PI) : 0.12 * (1 + Math.sin(performance.now() / 90));
          frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
      };
      const done = () => {
        if (tokenRef.current !== token) return;
        cleanup();
        setSpeakingId(null);
      };
      utterance.onend = done;
      utterance.onerror = done;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
      void recordClientEventAction({ event: "voice_output" });
      return true;
    },
    [cleanup],
  );

  const speak = useCallback(
    async (id: string, text: string) => {
      stop();
      const token = ++tokenRef.current;
      setLoadingId(id);
      try {
        const response = await fetch("/api/ai/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ messageId: id }),
        });
        if (tokenRef.current !== token) return;
        if (!response.ok) throw new Error(String(response.status));
        const blob = await response.blob();
        if (tokenRef.current !== token) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;

        const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          contextRef.current ??= new AudioContextClass();
          const context = contextRef.current;
          if (context.state === "suspended") await context.resume().catch(() => undefined);
          const source = context.createMediaElementSource(audio);
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          analyser.connect(context.destination);
          const data = new Uint8Array(analyser.fftSize);
          const tick = () => {
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (const sample of data) sum += ((sample - 128) / 128) ** 2;
            level.current = Math.min(1, Math.sqrt(sum / data.length) * 4.5);
            frameRef.current = requestAnimationFrame(tick);
          };
          audio.onplay = () => {
            frameRef.current = requestAnimationFrame(tick);
          };
        }
        audio.onended = () => {
          if (tokenRef.current !== token) return;
          cleanup();
          setSpeakingId(null);
        };
        await audio.play();
        if (tokenRef.current !== token) return;
        setLoadingId(null);
        setSpeakingId(id);
      } catch {
        if (tokenRef.current !== token) return;
        cleanup();
        // ElevenLabs unavailable (or playback blocked): use the browser's voice.
        if (!speakWithBrowser(id, text, token)) {
          setLoadingId(null);
          setSpeakingId(null);
        }
      }
    },
    [cleanup, speakWithBrowser, stop],
  );

  return { level, speakingId, loadingId, speak, stop };
}
