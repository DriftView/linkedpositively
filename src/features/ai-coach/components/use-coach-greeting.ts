"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { recordClientEventAction } from "../actions";
import { audioPrimed } from "../audio-unlock";
import { coachVoice, type Coach } from "../coach-design";
import { greetingFor, shouldGreet, type Greeting } from "../greeting";
import type { SpeechChunkDTO } from "../types";
import { voiceGenderFor } from "../voice-lib";
import { greetingState, localDay, markGreeted } from "./greeting-storage";
import { useCoachVoice } from "./use-coach-voice";

/** The page settles first (and anything it opens, like a survey, gets its turn). */
const SHOW_AFTER_MS = 1200;
/** While a dialog is open or the tab is hidden, check again this often, this many times. */
const RETRY_MS = 1000;
const MAX_RETRIES = 30;
/** The greeting goes away by itself this long after it was said, or after it was shown if it never was. */
const HIDE_AFTER_SPOKEN_MS = 8000;
const HIDE_UNHEARD_MS = 30_000;

/** Marks controls that must not count as "the first tap" (the greeting's own close button, the coach bubble). */
export const NO_GREETING_GESTURE = "data-no-greeting-gesture";

function dayOfYear(date: Date) {
  return Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/** A dialog the page opened (a survey, a level-up): the greeting waits for it. */
function dialogOpen() {
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'));
}

/**
 * The floating coach's hello when a member opens the app: once a session and
 * once a day (greeting-storage.ts), a speech bubble with a short fixed line
 * (greeting.ts) and, with voice on, the coach saying it. Browsers only allow
 * sound after the member has tapped or pressed a key on the page (and opening
 * the app after signing in is a new page), so the coach speaks at once only
 * when sound is already allowed, and otherwise on the member's first tap or
 * key press anywhere. It never greets while `blocked` (the panel is open, the
 * AI Coach page), never during staff impersonation, and steps aside for open
 * dialogs.
 */
export function useCoachGreeting({
  coach,
  firstName,
  voiceEnabled,
  serverVoice,
  impersonating,
  blocked,
  paused,
}: {
  coach: Pick<Coach, "name" | "pronouns" | "voice">;
  firstName: string | null;
  voiceEnabled: boolean;
  serverVoice: boolean;
  impersonating: boolean;
  blocked: boolean;
  /** The member is pointing at or focused on the greeting: it doesn't go away by itself meanwhile. */
  paused: boolean;
}) {
  const [greeting, setGreeting] = useState<Greeting | null>(null);
  const [played, setPlayed] = useState(false);
  const greetingRef = useRef<Greeting | null>(null);
  const playedRef = useRef(false);
  const audioRef = useRef<Promise<SpeechChunkDTO | null> | null>(null);
  const disarmRef = useRef<() => void>(() => undefined);
  const armRef = useRef<() => void>(() => undefined);
  // The browser wouldn't play it (that tap didn't count): offer it again on the next one.
  const onStall = useCallback(() => {
    playedRef.current = false;
    setPlayed(false);
    armRef.current();
  }, []);
  const voice = useCoachVoice({
    pitch: coachVoice(coach.voice).pitch,
    gender: voiceGenderFor(coach.pronouns),
    onStall,
  });
  const settings = useRef({ coach, firstName, voiceEnabled, serverVoice, impersonating, blocked });
  useEffect(() => {
    settings.current = { coach, firstName, voiceEnabled, serverVoice, impersonating, blocked };
  }, [coach, firstName, voiceEnabled, serverVoice, impersonating, blocked]);

  const { begin, enqueue, end, unlock, stop } = voice;

  /** Says the greeting (from a tap, a key press, or when sound is already allowed). */
  const play = useCallback(() => {
    const current = greetingRef.current;
    if (!current || playedRef.current || !settings.current.voiceEnabled) return;
    playedRef.current = true;
    setPlayed(true);
    disarmRef.current();
    unlock(); // in the tap's own call stack: what lets the browser play the audio that follows
    begin("greeting");
    const audio = audioRef.current;
    if (!audio) {
      enqueue({ text: current.spoken }); // the browser's voice, said at once (iOS needs it inside the tap)
      end();
    } else
      void audio.then((chunk) => {
        if (greetingRef.current !== current) return;
        enqueue(chunk?.audio ? chunk : { text: current.spoken });
        end();
      });
    void recordClientEventAction({ event: "greeting_heard" });
  }, [begin, end, enqueue, unlock]);

  const dismiss = useCallback(() => {
    disarmRef.current();
    stop();
    greetingRef.current = null;
    setGreeting(null);
  }, [stop]);

  // Once, when the app opens.
  useEffect(() => {
    const initial = settings.current;
    const state = greetingState();
    if (initial.blocked || !shouldGreet({ ...state, impersonating: initial.impersonating, today: localDay() })) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const arm = () => {
      const onGesture = (event: Event) => {
        if (event.target instanceof Element && event.target.closest(`[${NO_GREETING_GESTURE}]`)) return;
        play();
      };
      // Taps count once the finger lifts ("click"), not on touch down: only then does the browser allow sound.
      window.addEventListener("click", onGesture, true);
      window.addEventListener("keydown", onGesture, true);
      disarmRef.current = () => {
        window.removeEventListener("click", onGesture, true);
        window.removeEventListener("keydown", onGesture, true);
        disarmRef.current = () => undefined;
      };
    };
    armRef.current = () => {
      disarmRef.current();
      if (greetingRef.current) arm();
    };

    const show = (attempt: number) => {
      if (cancelled) return;
      const now = settings.current;
      if (now.blocked) return;
      if (document.visibilityState !== "visible" || dialogOpen()) {
        if (attempt < MAX_RETRIES) timer = setTimeout(() => show(attempt + 1), RETRY_MS);
        return;
      }
      const date = new Date();
      const next = greetingFor({
        coachName: now.coach.name,
        firstName: now.firstName,
        hour: date.getHours(),
        seed: dayOfYear(date),
      });
      markGreeted(localDay(date));
      greetingRef.current = next;
      setGreeting(next);
      void recordClientEventAction({ event: "greeting_shown" });
      if (!now.voiceEnabled) return;
      if (now.serverVoice)
        audioRef.current = fetch("/api/ai/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ greeting: next.index, hour: date.getHours() }),
        })
          .then((response) => (response.ok ? (response.json() as Promise<SpeechChunkDTO>) : null))
          .catch(() => null);
      // Sound already allowed (unlocked by the login button, or the member has used this page): speak now.
      // Otherwise on their first tap or key.
      const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
      if (audioPrimed() || activation?.hasBeenActive) play();
      else arm();
    };

    timer = setTimeout(() => show(0), SHOW_AFTER_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      disarmRef.current();
    };
  }, [play]);

  // The panel opened (or the AI Coach page): the coach is here in full, so the greeting steps aside.
  useEffect(() => {
    if (blocked && greetingRef.current) dismiss();
  }, [blocked, dismiss]);

  // Goes away by itself: a while after it was said, or if it's never heard.
  const speaking = Boolean(voice.speakingId || voice.loadingId);
  useEffect(() => {
    if (!greeting || speaking || paused) return;
    const timer = setTimeout(dismiss, played ? HIDE_AFTER_SPOKEN_MS : HIDE_UNHEARD_MS);
    return () => clearTimeout(timer);
  }, [greeting, played, speaking, paused, dismiss]);

  return { greeting, speaking, played, face: voice.face, play, dismiss };
}
