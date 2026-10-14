import type { Viseme } from "../voice-lib";

/**
 * How the coach moves (the SVG avatar in coach-avatar.tsx): breathing, a
 * slow head sway, natural blinks and glances, nods while the member talks,
 * brows that lift with emphasis, and a mouth that follows the voice's visemes
 * and loudness. `step` is called once per animation frame and returns a pose;
 * each renderer only draws it. Units are the SVG's (a 200 × 200 view box).
 */

export type CoachState = "idle" | "listening" | "thinking" | "speaking";

/**
 * What the voice tells the face, written every frame by the voice player
 * (never through React state):
 * `level` is the loudness of the coach's voice (0–1), `viseme` its current
 * mouth shape.
 */
export type CoachFace = { level: number; viseme: Viseme };

export function newFace(): CoachFace {
  return { level: 0, viseme: "rest" };
}

/** Mouth shapes: half width, upper lip lift and lower lip drop, in SVG units. */
export const MOUTH: Record<Viseme, [number, number, number]> = {
  rest: [13, 0, 0],
  A: [12, 4, 13],
  E: [15, 2.5, 7],
  O: [8, 5, 10],
  U: [6, 3, 5],
  M: [13, 0, 0.4],
  F: [13, 1.5, 4],
  L: [12, 2.5, 7],
};

export type CoachPose = {
  /** Mouth half width, upper lip lift and lower lip drop. */
  mouth: { w: number; up: number; down: number };
  /** Eyelid opening: 1 open, 0.1 mid-blink (lids close fast and open a little slower). */
  lid: number;
  /** Where the pupils sit, offset from center (+x right, +y down). */
  eyes: { x: number; y: number };
  /** Head roll in degrees (clockwise on screen), nod depth and brow offset (negative = raised). */
  roll: number;
  nod: number;
  brow: number;
  /** Head turn in degrees (+ toward the coach's left, the viewer's right): small, slow shifts of attention. */
  turn: number;
  /** Breathing: the body's vertical offset. */
  bob: number;
  /** Seconds since start, for renderers that add their own slow motion. */
  t: number;
};

const random = (min: number, max: number) => min + Math.random() * (max - min);

/** A blink `ms` in: the lids close in 70 ms, rest, then open over 120 ms. */
export function blinkLid(ms: number) {
  if (ms < 0 || ms >= 220) return 1;
  if (ms < 70) return 1 - 0.9 * (ms / 70) ** 2;
  if (ms < 100) return 0.1;
  const t = (ms - 100) / 120;
  return 0.1 + 0.9 * (1 - (1 - t) ** 2);
}

export function createCoachMotion({ reduced }: { reduced: boolean }) {
  const pose: CoachPose = {
    mouth: { w: MOUTH.rest[0], up: 0, down: 0 },
    lid: 1,
    eyes: { x: 0, y: 0 },
    roll: 0,
    nod: 0,
    brow: 0,
    turn: 0,
    bob: 0,
    t: 0,
  };
  let level = 0;
  let listen = 0;
  let nextBlink = -1;
  let blinkAt = -Infinity;
  let nextGlance = -1;
  let gaze = { x: 0, y: 0 };
  let nextTurn = -1;
  let turn = 0;

  return {
    pose,
    step(now: number, state: CoachState, face: CoachFace | undefined, listenLevel: number): CoachPose {
      if (nextBlink < 0) {
        nextBlink = now + random(1500, 4000);
        nextGlance = now + random(1200, 3000);
        nextTurn = now + random(2000, 5000);
      }
      const speaking = state === "speaking";
      level += ((speaking ? (face?.level ?? 0) : 0) - level) * 0.3;
      listen += ((state === "listening" ? listenLevel : 0) - listen) * 0.15;

      // Mouth: the viseme's shape, opened further by loudness.
      const viseme: Viseme = speaking ? (face?.viseme ?? "rest") : "rest";
      const [tw, tup, tdown] = MOUTH[viseme];
      const scale = viseme === "rest" || viseme === "M" ? 1 : Math.min(1.2, 0.55 + level * 0.8);
      const { mouth } = pose;
      mouth.w += (tw - mouth.w) * 0.4;
      mouth.up += (tup * scale - mouth.up) * 0.4;
      mouth.down += (tdown * scale - mouth.down) * 0.4;

      if (reduced) return pose;
      const t = now / 1000;
      pose.t = t;

      // Blinks at irregular intervals, sometimes twice.
      if (now >= nextBlink) {
        blinkAt = now;
        nextBlink = now + (Math.random() < 0.15 ? 280 : random(2200, 6000));
      }
      pose.lid = blinkLid(now - blinkAt);

      // Glances: small saccades; looks up and aside while thinking, at the member while listening.
      if (now >= nextGlance) {
        nextGlance = now + random(state === "listening" ? 2500 : 1200, 4200);
        gaze =
          state === "thinking"
            ? { x: random(1.5, 3), y: random(-3.5, -2) }
            : state === "listening"
              ? { x: random(-0.6, 0.6), y: 0 }
              : { x: random(-2.2, 2.2), y: random(-1.2, 1) };
      }
      if (state === "thinking" && gaze.y > -1.5) gaze = { x: 2.5, y: -3 };
      pose.eyes.x += (gaze.x - pose.eyes.x) * 0.35;
      pose.eyes.y += (gaze.y - pose.eyes.y) * 0.35;

      // Head: a slow sway, emphasis on loud syllables, and nods while the member talks.
      const sway = Math.sin(t * 0.55) * 1.4 + Math.sin(t * 0.9 + 1) * 0.6;
      const nod = speaking ? level * 2.2 : state === "listening" ? listen * Math.max(0, Math.sin(t * 5)) * 3 : 0;
      const tilt = state === "listening" ? 3 : state === "thinking" ? -2 : 0;
      // Small turns of the head, now and then, which the eyes lead.
      if (now >= nextTurn) {
        nextTurn = now + random(2500, 6500);
        turn = state === "listening" ? random(-1.5, 1.5) : state === "thinking" ? random(4, 7) : random(-5, 5);
      }
      pose.turn += (turn + pose.eyes.x * 0.8 - pose.turn) * 0.03;
      pose.nod = nod;
      pose.roll = sway + tilt + nod * 0.4;

      pose.brow =
        state === "listening" ? -2.5 : state === "thinking" ? -1.5 : speaking ? -Math.max(0, level - 0.5) * 6 : 0;
      pose.bob = Math.sin(t * 1.4) * 0.9;
      return pose;
    },
  };
}
