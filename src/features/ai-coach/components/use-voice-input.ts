"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_RECORDING_SECONDS } from "../constants";

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoiceInputState = "idle" | "recording" | "transcribing";

/**
 * Voice input for the message box. With ElevenLabs on the server
 * (`serverTranscription`), the browser records the message and the server
 * transcribes it; this works in every modern browser. Otherwise the browser's
 * own speech recognition is used where it exists. The words land in the
 * message box for the member to check before sending.
 */
export function useVoiceInput({ serverTranscription, onText, onError }: { serverTranscription: boolean; onText: (text: string) => void; onError: (message: string) => void }) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [supported, setSupported] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // Feature detection has to wait for the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(
      serverTranscription ? typeof window !== "undefined" && "MediaRecorder" in window && Boolean(navigator.mediaDevices?.getUserMedia) : Boolean(recognitionClass()),
    );
  }, [serverTranscription]);

  const release = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(
    () => () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      recognitionRef.current?.stop();
      release();
    },
    [release],
  );

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(async () => {
    if (state !== "idle") return;
    if (serverTranscription) {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        onError("Allow microphone access to talk to your coach.");
        return;
      }
      streamRef.current = stream;
      const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported?.(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onstop = async () => {
        release();
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (blob.size < 1200) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const form = new FormData();
          form.append("audio", blob, "voice-message");
          const response = await fetch("/api/ai/transcribe", { method: "POST", body: form });
          const data = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
          if (!response.ok) throw new Error(data.error ?? "We couldn't understand that recording.");
          if (data.text) onText(data.text);
          else onError("We didn't catch that. Try again, or type your message.");
        } catch (error) {
          onError(error instanceof Error ? error.message : "Voice isn't working right now. Please type your message.");
        } finally {
          setState("idle");
        }
      };
      recorder.start();
      setState("recording");
      timerRef.current = setTimeout(() => recorder.state === "recording" && recorder.stop(), MAX_RECORDING_SECONDS * 1000);
      return;
    }

    const Recognition = recognitionClass();
    if (!Recognition) return;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
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
      if (event.error === "not-allowed") onError("Allow microphone access to talk to your coach.");
      else if (event.error !== "no-speech" && event.error !== "aborted") onError("Voice isn't working right now. Please type your message.");
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setState("idle");
      if (heard) onText(heard);
    };
    recognition.start();
    setState("recording");
  }, [onError, onText, release, serverTranscription, state]);

  return { state, supported, start, stop };
}
