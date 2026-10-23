"use client";

import { useEffect, useRef } from "react";
import { TalkOverDetector } from "../voice-lib";

const TICK_MS = 50;
/** The quietest mic reading that counts as speech when the room is quiet. */
const SPEECH_FLOOR = 0.03;

/**
 * Lets the member stop the coach by talking, outside hands-free voice chat
 * (replies to mic messages, "Read replies aloud", replaying a reply). While
 * `active` (the coach is speaking), the mic is open and its loudness is
 * checked on the device; nothing is recorded or sent. Only when the member
 * has already allowed the microphone, so a reply never brings up a
 * permission prompt.
 */
export function useTalkOver({ active, onTalk }: { active: boolean; onTalk: () => void }) {
  const onTalkRef = useRef(onTalk);
  useEffect(() => {
    onTalkRef.current = onTalk;
  }, [onTalk]);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    void (async () => {
      if (!(await micAllowed()) || cancelled) return;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
      } catch {
        return;
      }
      const Context =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (cancelled || !Context) return stop();
      context = new Context();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const detector = new TalkOverDetector();
      timer = setInterval(() => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) sum += ((sample - 128) / 128) ** 2;
        if (detector.push(Math.sqrt(sum / data.length), TICK_MS, SPEECH_FLOOR)) {
          stop();
          onTalkRef.current();
        }
      }, TICK_MS);
    })();

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      void context?.close().catch(() => undefined);
      context = null;
    }

    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);
}

/** True when the microphone is already allowed for this site (never prompts). */
async function micAllowed() {
  try {
    const status = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return status.state === "granted";
  } catch {
    return false; // can't tell without asking
  }
}
