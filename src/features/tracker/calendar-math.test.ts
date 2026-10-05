import { describe, expect, it } from "vitest";
import { countableDays, monthGrid, mostCommon, shiftMonth, streaks } from "./calendar-math";

describe("monthGrid", () => {
  it("pads to whole Sunday-first weeks", () => {
    const grid = monthGrid("2026-09"); // Sep 1 2026 is a Tuesday
    expect(grid[0]).toEqual([null, null, "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(30);
    expect(grid.every((week) => week.length === 7)).toBe(true);
  });
});

describe("shiftMonth", () => {
  it("crosses years", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
  });
});

describe("countableDays", () => {
  it("counts up to today in the current month", () => {
    expect(countableDays("2026-09", "2026-09-29")).toBe(29);
    expect(countableDays("2026-08", "2026-09-29")).toBe(31);
    expect(countableDays("2026-10", "2026-09-29")).toBe(0);
  });
});

describe("streaks", () => {
  it("counts back from today, or from yesterday while today is open", () => {
    const days = ["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28"];
    expect(streaks(days, "2026-09-28").current).toBe(4);
    expect(streaks(days, "2026-09-29").current).toBe(4);
    expect(streaks(days, "2026-09-30").current).toBe(0);
  });

  it("finds the longest run", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-10", "2026-09-11"];
    expect(streaks(days, "2026-09-11")).toEqual({ current: 2, longest: 3 });
  });
});

describe("mostCommon", () => {
  it("returns the most frequent value", () => {
    expect(mostCommon([5, 1, 5, 2])).toBe(5);
    expect(mostCommon([])).toBeNull();
  });
});
