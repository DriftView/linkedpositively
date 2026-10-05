import { describe, expect, it } from "vitest";
import { compactDuration, reportDateTime, sessionActionLabel, usageDateTime, usageDuration } from "./format";

describe("usageDuration", () => {
  const login = new Date("2026-03-01T10:00:00Z");
  const after = (s: number) => new Date(login.getTime() + s * 1000);

  it("is Incomplete without a logout or when logout precedes login", () => {
    expect(usageDuration(login, null)).toBe("Incomplete");
    expect(usageDuration(login, after(-5))).toBe("Incomplete");
  });
  it("formats like the legacy report", () => {
    expect(usageDuration(login, after(0))).toBe("0 seconds");
    expect(usageDuration(login, after(1))).toBe("1 second");
    expect(usageDuration(login, after(3605))).toBe("1 hour 5 seconds");
    expect(usageDuration(login, after(120))).toBe("2 minutes");
    expect(usageDuration(login, after(7200 + 60 + 2))).toBe("2 hours 1 minute 2 seconds");
  });
});

describe("report dates", () => {
  it("uses Y-m-d H:i:s T in the site timezone", () => {
    expect(reportDateTime(new Date("2026-07-04T16:05:09Z"), "America/New_York")).toBe("2026-07-04 12:05:09 EDT");
    expect(reportDateTime(new Date("2026-01-04T16:05:09Z"), "America/New_York")).toBe("2026-01-04 11:05:09 EST");
    expect(reportDateTime(null, "America/New_York")).toBe("");
  });
  it("uses m.d.Y H:i:s for usage", () => {
    expect(usageDateTime(new Date("2026-07-04T16:05:09Z"), "America/New_York")).toBe("07.04.2026 12:05:09");
  });
});

describe("labels", () => {
  it("maps status to Start / Resume / Completed", () => {
    expect(sessionActionLabel("not_started")).toBe("Start");
    expect(sessionActionLabel("in_progress")).toBe("Resume");
    expect(sessionActionLabel("complete")).toBe("Completed");
  });
  it("formats compact durations", () => {
    expect(compactDuration(0)).toBe("0m");
    expect(compactDuration(30)).toBe("under a minute");
    expect(compactDuration(3600 + 20 * 60)).toBe("1h 20m");
  });
});
