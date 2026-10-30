"use client";

import { useEffect, useRef } from "react";
import { TalkOverDetector } from "../voice-lib";

const TICK_MS = 25;
/** The quietest mic reading that counts as speech when the room is quiet. */
const SPEECH_FLOOR = 0.03;

/**
 * Lets the member stop the coach by talking, outside hands-free voice chat
 * (replies to mic messages, "Read replies aloud", replaying a reply). While
 * `armed` (a reply is on its way to be heard, or being heard) the mic is open,
 * so it's ready the moment the coach starts; while `active` (the coach is
 * speaking) its loudness is checked on the device. Nothing is recorded or
 * sent. Only when the member has already allowed the microphone, so a reply
 * never brings up a permission prompt. On phones and tablets the mic opens
 * only while the coach speaks: an open mic there switches the phone to call
 * audio, which lowers the coach's voice.
 */
export function useTalkOver({ armed, active, onTalk }: { armed: boolean; active: boolean; onTalk: () => void }) {
  const onTalkRef = useRef(onTalk);
  const activeRef = useRef(active);
  useEffect(() => {
    onTalkRef.current = onTalk;
    activeRef.current = active;
  }, [onTalk, active]);

  const open = active || (armed && !touchDevice());
  useEffect(() => {
    if (!open || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
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
      void context.resume().catch(() => undefined); // may start suspended (Safari): it would read only silence
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      const detector = new TalkOverDetector();
      let wasActive = false;
      let last = performance.now();
      timer = setInterval(() => {
        const now = performance.now();
        const ms = Math.min(150, now - last); // timers run late when the page is busy
        last = now;
        const listening = activeRef.current;
        if (listening !== wasActive) {
          detector.restart(); // keeps the echo level learned on earlier replies
          wasActive = listening;
        }
        if (!listening) return;
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const sample of data) sum += ((sample - 128) / 128) ** 2;
        if (detector.push(Math.sqrt(sum / data.length), ms, SPEECH_FLOOR)) {
          detector.restart();
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
  }, [open]);
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

function touchDevice() {
  return typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
}
