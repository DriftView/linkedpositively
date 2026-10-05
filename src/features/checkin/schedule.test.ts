import { describe, expect, it } from "vitest";
import { adherenceBand, checkinTiming, checkinWeek, feedbackBand, promptSequence } from "./schedule";

const TZ = "America/New_York";
const start = new Date("2026-01-05T05:00:00Z"); // Mon Jan 5, 00:00 New York

describe("checkinWeek", () => {
  it("covers the 7 study days of the week", () => {
    const w1 = checkinWeek(start, 1, TZ);
    expect(w1.dates).toEqual(["2026-01-05", "2026-01-06", "2026-01-07", "2026-01-08", "2026-01-09", "2026-01-10", "2026-01-11"]);
    expect(w1.opensAt.toISOString()).toBe("2026-01-12T05:00:00.000Z");
    expect(w1.closesAt.toISOString()).toBe("2026-01-19T05:00:00.000Z");
    expect(checkinWeek(start, 3, TZ).start).toBe("2026-01-19");
  });
});

describe("checkinTiming", () => {
  it("has nothing open before the study or during week 1", () => {
    expect(checkinTiming(null, new Date(), TZ).openWeek).toBeNull();
    expect(checkinTiming(start, new Date("2026-01-08T15:00:00Z"), TZ)).toMatchObject({ started: true, studyWeek: 1, openWeek: null });
  });

  it("opens the previous week's check-in", () => {
    const t = checkinTiming(start, new Date("2026-01-12T15:00:00Z"), TZ);
    expect(t).toMatchObject({ studyWeek: 2, openWeek: 1 });
    expect(t.nextOpensAt?.toISOString()).toBe("2026-01-19T05:00:00.000Z");
    expect(checkinTiming(start, new Date("2026-01-26T15:00:00Z"), TZ).openWeek).toBe(3);
  });
});

describe("rules", () => {
  it("rotates prompts every 10 weeks", () => {
    expect(promptSequence(1)).toBe(1);
    expect(promptSequence(10)).toBe(10);
    expect(promptSequence(11)).toBe(1);
    expect(promptSequence(23)).toBe(3);
  });

  it("maps Likert answers to feedback bands", () => {
    expect([1, 2, 3, 4, 5].map(feedbackBand)).toEqual(["low", "low", "medium", "high", "high"]);
  });

  it("gives adherence feedback from the second prompt on", () => {
    const all = Array(7).fill(true);
    expect(adherenceBand(1, all)).toBeNull();
    expect(adherenceBand(2, all)).toBe("more");
    expect(adherenceBand(2, [...all.slice(0, 6), null])).toBe("less");
    expect(adherenceBand(4, [])).toBe("less");
  });
});
