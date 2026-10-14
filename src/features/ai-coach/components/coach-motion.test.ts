import { describe, expect, it } from "vitest";
import { blinkLid, createCoachMotion, MOUTH, newFace } from "./coach-motion";

const run = (motion: ReturnType<typeof createCoachMotion>, ...args: Parameters<typeof motion.step>) => {
  const [start, ...rest] = args;
  let pose = motion.step(start, ...rest);
  for (let i = 1; i < 60; i++) pose = motion.step(start + i * 16, ...rest);
  return pose;
};

describe("coach motion", () => {
  it("opens the mouth to the voice's viseme while speaking", () => {
    const pose = run(createCoachMotion({ reduced: false }), 1000, "speaking", { level: 1, viseme: "A" }, 0);
    expect(pose.mouth.down).toBeGreaterThan(MOUTH.A[2]);
    expect(pose.mouth.w).toBeCloseTo(MOUTH.A[0], 1);
  });

  it("rests the mouth when not speaking, whatever the voice says", () => {
    const pose = run(createCoachMotion({ reduced: false }), 1000, "idle", { level: 1, viseme: "A" }, 0);
    expect(pose.mouth.up + pose.mouth.down).toBeLessThan(0.01);
  });

  it("looks up while thinking and raises its brows while listening", () => {
    const thinking = run(createCoachMotion({ reduced: false }), 1000, "thinking", newFace(), 0);
    expect(thinking.eyes.y).toBeLessThan(-1.5);
    const listening = run(createCoachMotion({ reduced: false }), 1000, "listening", newFace(), 0.5);
    expect(listening.brow).toBeLessThan(0);
  });

  it("keeps still under reduced motion but still lip-syncs", () => {
    const pose = run(createCoachMotion({ reduced: true }), 1000, "speaking", { level: 1, viseme: "O" }, 0);
    expect(pose.mouth.up).toBeGreaterThan(0);
    expect([pose.roll, pose.nod, pose.bob, pose.brow, pose.turn, pose.eyes.x, pose.eyes.y, pose.t]).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(pose.lid).toBe(1);
  });

  it("blinks smoothly: closes fast, opens slower", () => {
    expect(blinkLid(-1)).toBe(1);
    expect(blinkLid(35)).toBeGreaterThan(0.1);
    expect(blinkLid(35)).toBeLessThan(1);
    expect(blinkLid(80)).toBe(0.1);
    expect(blinkLid(160)).toBeGreaterThan(0.1);
    expect(blinkLid(160)).toBeLessThan(1);
    expect(blinkLid(400)).toBe(1);
  });
});
