import { describe, expect, it } from "vitest";
import { levelForPoints, levelProgress } from "./levels";

describe("levelForPoints", () => {
  it("matches the legacy thresholds (200 is still level 1)", () => {
    expect(levelForPoints(0).level).toBe(1);
    expect(levelForPoints(200).level).toBe(1);
    expect(levelForPoints(201).level).toBe(2);
    expect(levelForPoints(499).level).toBe(2);
    expect(levelForPoints(500).level).toBe(3);
    expect(levelForPoints(900).level).toBe(4);
    expect(levelForPoints(1399).level).toBe(4);
    expect(levelForPoints(1400).level).toBe(5);
    expect(levelForPoints(2000).level).toBe(6);
    expect(levelForPoints(99999).level).toBe(6);
  });

  it("reports progress within a level", () => {
    expect(levelProgress(201)).toBe(0);
    expect(levelProgress(350)).toBeCloseTo((350 - 201) / (500 - 201));
    expect(levelProgress(5000)).toBe(1);
  });
});
