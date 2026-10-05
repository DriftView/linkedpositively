import { describe, expect, it } from "vitest";
import { filterRange, filtersQuery, parseFilters } from "./filters";
import { smsColumnKey, SMS_WEEK_COLUMNS } from "./sms-weeks";

describe("report filters", () => {
  it("parses URL params with defaults and drops junk", () => {
    expect(parseFilters({ from: "2026-09-01", to: "nope", sid: " LP-1 ", arm: "hacker" })).toEqual({
      from: "2026-09-01",
      to: undefined,
      sid: "LP-1",
      arm: "participant",
    });
    expect(parseFilters(new URLSearchParams("arm=everyone"), "participant").arm).toBe("everyone");
    expect(parseFilters({}, "study").arm).toBe("study");
  });
  it("swaps a reversed range", () => {
    expect(parseFilters({ from: "2026-09-10", to: "2026-09-01" })).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-10",
    });
  });
  it("round-trips to a query string without defaults", () => {
    expect(filtersQuery({ arm: "participant" })).toBe("");
    expect(filtersQuery({ from: "2026-09-01", sid: "LP", arm: "control" })).toBe("?from=2026-09-01&sid=LP&arm=control");
  });
  it("includes the whole end day, in Eastern time (the old access report dropped it)", () => {
    const { start, end } = filterRange({ from: "2026-09-01", to: "2026-09-01" });
    expect(start?.toISOString()).toBe("2026-09-01T04:00:00.000Z");
    expect(end?.toISOString()).toBe("2026-09-02T04:00:00.000Z");
    expect(filterRange({})).toEqual({ start: undefined, end: undefined });
  });
});

describe("SMS engagement columns", () => {
  it("has 27 columns (as the legacy header) with the extra 19+4 message after week 19", () => {
    expect(SMS_WEEK_COLUMNS).toHaveLength(27);
    expect(SMS_WEEK_COLUMNS[19].header).toBe("SMS Engagement Message Clicked:Week-19+4days");
    expect(SMS_WEEK_COLUMNS[20].header).toBe("SMS Engagement Message Clicked:Week-20");
  });
  it("maps stored flags, including the URL-decoded legacy 'WEEK-19 4'", () => {
    expect(smsColumnKey("WEEK-19 4")).toBe("WEEK-19+4");
    expect(smsColumnKey("WEEK-19+FOUR")).toBe("WEEK-19+4");
    expect(smsColumnKey("week-3")).toBe("WEEK-3");
    expect(smsColumnKey("WEEK-27")).toBeNull();
    expect(smsColumnKey("WELCOME")).toBeNull();
  });
});
