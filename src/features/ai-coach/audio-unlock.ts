"use client";

/**
 * Lets the coach speak the moment a member lands after signing in. Browsers
 * only allow sound after a tap or key press on the page, so the login button
 * "primes" an audio context inside its own click (a silent blip, which also
 * unlocks iOS), and the app then opens without a full page load, keeping it.
 * The coach's voice (use-coach-voice.ts) takes the primed context instead of
 * making its own. Unused, it's closed after a while (staff portal, no coach).
 */

const UNUSED_CLOSE_MS = 20_000;

let primed: AudioContext | null = null;
let closeTimer: ReturnType<typeof setTimeout> | null = null;

/** Call inside a tap or key press. Never throws. */
export function primeCoachAudio() {
  if (typeof window === "undefined" || primed) return;
  const Context =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return;
  try {
    const context = new Context();
    void context.resume().catch(() => undefined);
    const blip = context.createBufferSource();
    blip.buffer = context.createBuffer(1, 1, context.sampleRate);
    blip.connect(context.destination);
    blip.start();
    primed = context;
    closeTimer = setTimeout(() => {
      if (primed === context) primed = null;
      void context.close().catch(() => undefined);
    }, UNUSED_CLOSE_MS);
  } catch {
    // no audio here: the coach waits for a tap instead
  }
}

/** Whether sound is allowed already (a primed context that's running). */
export function audioPrimed() {
  return primed?.state === "running";
}

/** Hands over the primed context (once), or null. */
export function takePrimedAudio(): AudioContext | null {
  const context = primed;
  primed = null;
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
  return context && context.state !== "closed" ? context : null;
}
