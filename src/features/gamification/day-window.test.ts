import { describe, expect, it } from "vitest";
import { previousLocalDay } from "./day-window";

describe("previousLocalDay", () => {
  it("returns yesterday in the user's timezone", () => {
    // 2026-09-29 03:30 UTC is still Sep 28 (23:30) in New York.
    const window = previousLocalDay(new Date("2026-09-29T03:30:00Z"), "America/New_York");
    expect(window.key).toBe("2026-09-27");
    expect(window.start.toISOString()).toBe("2026-09-27T04:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-09-28T04:00:00.000Z");
  });

  it("handles a DST change (23-hour day)", () => {
    // US DST starts 2026-03-08; that day is 23 hours long in New York.
    const window = previousLocalDay(new Date("2026-03-09T12:00:00Z"), "America/New_York");
    expect(window.key).toBe("2026-03-08");
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it("uses a different day for a different timezone at the same instant", () => {
    const now = new Date("2026-09-29T05:00:00Z");
    expect(previousLocalDay(now, "America/Los_Angeles").key).toBe("2026-09-27");
    expect(previousLocalDay(now, "Europe/London").key).toBe("2026-09-28");
  });
});
