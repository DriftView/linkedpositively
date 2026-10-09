"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { END_OF_TURN_SILENCE_MS, HANDS_FREE_IDLE_MS, MAX_RECORDING_SECONDS } from "../constants";
import { recognitionClass, recordingMimeType, transcribeRecording, type Recognition } from "./use-voice-input";

/**
 * listening: waiting for the member to talk. hearing: they are talking.
 * transcribing: turning their words into text. waiting: the coach is
 * thinking or speaking (the member can talk over it to interrupt).
 */
export type HandsFreePhase = "off" | "listening" | "hearing" | "transcribing" | "waiting";

const TICK_MS = 50;
/** Speech this long starts the member's turn (shorter blips are noise). */
const SPEECH_START_MS = 150;
/** Talking over the coach this long interrupts it. */
const BARGE_IN_MS = 350;
/** Without speech, the recording restarts this often so it never grows large. */
const RECORDER_RESET_MS = 30_000;

type Options = {
  serverTranscription: boolean;
  onUtterance: (text: string) => void;
  onBargeIn: () => void;
  onError: (message: string) => void;
  onTimeout: () => void;
};

/**
 * Hands-free voice chat: an open microphone with voice activity detection.
 * The member just talks; a pause ends their turn, the words are sent, and
 * when the coach has finished speaking it listens again. Talking over the
 * coach interrupts it. Audio leaves the device only for transcription after
 * speech is detected (ElevenLabs), or goes to the browser's own speech
 * recognition. The mic turns itself off after a long silence.
 */
export function useHandsFree({ serverTranscription, onUtterance, onBargeIn, onError, onTimeout }: Options) {
  const [phase, setPhaseState] = useState<HandsFreePhase>("off");
  const [muted, setMutedState] = useState(false);
  const [supported, setSupported] = useState(false);

  /** Loudness of the member's voice (0–1), for the avatar's listening nods. */
  const listenLevel = useRef(0);
  const phaseRef = useRef<HandsFreePhase>("off");
  const mutedRef = useRef(false);
  const coachSpeakingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recorderRef = useRef<{ recorder: MediaRecorder; chunks: Blob[]; startedAt: number; send: boolean } | null>(
    null,
  );
  const recognitionRef = useRef<Recognition | null>(null);
  const vad = useRef({ noise: 0.01, speechMs: 0, silenceMs: 0, bargeMs: 0, lastActivity: 0, heardAt: 0 });
  const callbacks = useRef({ onUtterance, onBargeIn, onError, onTimeout });
  useEffect(() => {
    callbacks.current = { onUtterance, onBargeIn, onError, onTimeout };
  }, [onUtterance, onBargeIn, onError, onTimeout]);

  useEffect(() => {
    // Feature detection has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(
      typeof window !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia) &&
        (serverTranscription ? "MediaRecorder" in window : Boolean(recognitionClass())),
    );
  }, [serverTranscription]);

  const setPhase = useCallback((next: HandsFreePhase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  // --- Capturing one turn ---------------------------------------------------

  const stopRecorder = useCallback((send: boolean) => {
    const current = recorderRef.current;
    if (!current) return;
    current.send = send;
    if (current.recorder.state === "recording") current.recorder.stop();
    recorderRef.current = null;
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onresult = null;
      recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // not started
      }
    }
  }, []);

  const deliver = useCallback(
    (text: string) => {
      setPhase("waiting");
      callbacks.current.onUtterance(text);
    },
    [setPhase],
  );

  // `listen`, `stop` and the recorder/recognition starters call each other; refs keep them stable.
  const listenRef = useRef<() => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);

  const startRecorder = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;
    const mimeType = recordingMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const entry = { recorder, chunks: [] as Blob[], startedAt: performance.now(), send: false };
    recorder.ondataavailable = (event) => {
      if (event.data.size) entry.chunks.push(event.data);
    };
    recorder.onstop = async () => {
      if (!entry.send || phaseRef.current === "off") return;
      const blob = new Blob(entry.chunks, { type: recorder.mimeType || "audio/webm" });
      if (blob.size < 1200) {
        listenRef.current();
        return;
      }
      setPhase("transcribing");
      try {
        const text = await transcribeRecording(blob);
        if (phaseRef.current !== "transcribing") return;
        if (text) deliver(text);
        else listenRef.current();
      } catch (error) {
        if (phaseRef.current !== "transcribing") return;
        callbacks.current.onError(error instanceof Error ? error.message : "Voice isn't working right now.");
        listenRef.current();
      }
    };
    recorder.start();
    recorderRef.current = entry;
  }, [deliver, setPhase]);

  const startRecognition = useCallback(() => {
    const Recognition = recognitionClass();
    if (!Recognition || mutedRef.current) return;
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    let heard = "";
    recognition.onresult = (event) => {
      heard = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
    };
    recognition.onerror = (event) => {
      if (event.error === "not-allowed") {
        callbacks.current.onError("Allow microphone access to talk to your coach.");
        stopRef.current();
      }
    };
    recognition.onend = () => {
      if (recognitionRef.current !== recognition) return;
      recognitionRef.current = null;
      if (phaseRef.current !== "listening" && phaseRef.current !== "hearing") return;
      if (heard) deliver(heard);
      else listenRef.current(); // nothing heard yet: keep listening
    };
    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
    }
  }, [deliver]);

  const listen = useCallback(() => {
    if (phaseRef.current === "off") return;
    stopRecorder(false);
    stopRecognition();
    Object.assign(vad.current, { speechMs: 0, silenceMs: 0, bargeMs: 0, lastActivity: performance.now() });
    setPhase("listening");
    if (serverTranscription) startRecorder();
    else startRecognition();
  }, [serverTranscription, setPhase, startRecognition, startRecorder, stopRecognition, stopRecorder]);
  useEffect(() => {
    listenRef.current = listen;
  }, [listen]);

  // --- Session --------------------------------------------------------------

  const stop = useCallback(() => {
    phaseRef.current = "off";
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    stopRecorder(false);
    stopRecognition();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => undefined);
    contextRef.current = null;
    analyserRef.current = null;
    mutedRef.current = false;
    setMutedState(false);
    setPhase("off");
  }, [setPhase, stopRecognition, stopRecorder]);

  useEffect(() => {
    stopRef.current = stop;
    return stop;
  }, [stop]);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) sum += ((sample - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    const state = vad.current;
    const now = performance.now();
    const current = phaseRef.current;
    const threshold = Math.min(0.12, Math.max(0.02, state.noise * 2.5 + 0.012));
    listenLevel.current = current === "listening" || current === "hearing" ? Math.min(1, rms * 8) : 0;

    if (mutedRef.current) {
      // Muted: ignore the mic (the quiet time still counts toward switching off).
    } else if (current === "listening") {
      if (rms > threshold) state.speechMs += TICK_MS;
      else {
        state.speechMs = Math.max(0, state.speechMs - TICK_MS / 2);
        state.noise = state.noise * 0.95 + rms * 0.05; // learn the room's background noise
      }
      if (state.speechMs >= SPEECH_START_MS) {
        state.silenceMs = 0;
        state.heardAt = now;
        state.lastActivity = now;
        setPhase("hearing");
      } else if (
        serverTranscription &&
        recorderRef.current &&
        now - recorderRef.current.startedAt > RECORDER_RESET_MS
      ) {
        stopRecorder(false);
        startRecorder();
      }
    } else if (current === "hearing") {
      state.lastActivity = now;
      state.silenceMs = rms > threshold * 0.8 ? 0 : state.silenceMs + TICK_MS;
      // With server transcription a pause ends the turn; browser recognition ends turns itself.
      if (
        serverTranscription &&
        (state.silenceMs >= END_OF_TURN_SILENCE_MS || now - state.heardAt > MAX_RECORDING_SECONDS * 1000)
      )
        stopRecorder(true);
    } else if (current === "waiting") {
      state.lastActivity = now;
      const loud = coachSpeakingRef.current && rms > Math.max(threshold * 2.5, 0.06);
      state.bargeMs = loud ? state.bargeMs + TICK_MS : 0;
      if (state.bargeMs >= BARGE_IN_MS) {
        state.bargeMs = 0;
        callbacks.current.onBargeIn();
        listen();
      }
    }

    if ((current === "listening" || current === "hearing") && now - state.lastActivity > HANDS_FREE_IDLE_MS) {
      stop();
      callbacks.current.onTimeout();
    }
  }, [listen, serverTranscription, setPhase, startRecorder, stop, stopRecorder]);

  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  const start = useCallback(async () => {
    if (phaseRef.current !== "off") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      callbacks.current.onError("Allow microphone access to talk to your coach.");
      return;
    }
    streamRef.current = stream;
    const Context =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Context) {
      const context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      contextRef.current = context;
      analyserRef.current = analyser;
    }
    vad.current.noise = 0.01;
    phaseRef.current = "listening";
    timerRef.current = setInterval(() => tickRef.current(), TICK_MS);
    listen();
  }, [listen]);

  /** The coach finished (or the turn failed): listen for the member again. */
  const resume = useCallback(() => {
    if (phaseRef.current === "waiting" || phaseRef.current === "transcribing") listen();
  }, [listen]);

  /** Lets talking over the coach interrupt it (only while it is actually speaking). */
  const setCoachSpeaking = useCallback((speaking: boolean) => {
    coachSpeakingRef.current = speaking;
  }, []);

  const setMuted = useCallback(
    (next: boolean) => {
      mutedRef.current = next;
      setMutedState(next);
      streamRef.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
      if (!serverTranscription && (phaseRef.current === "listening" || phaseRef.current === "hearing")) {
        if (next) stopRecognition();
        else startRecognition();
      }
      if (next && phaseRef.current === "hearing") listen();
    },
    [listen, serverTranscription, startRecognition, stopRecognition],
  );

  return {
    phase,
    active: phase !== "off",
    muted,
    supported,
    listenLevel,
    start,
    stop,
    resume,
    setMuted,
    setCoachSpeaking,
  };
}
