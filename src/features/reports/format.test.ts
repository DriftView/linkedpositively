import { describe, expect, it } from "vitest";
import {
  bucketByWeek,
  clockDuration,
  csvField,
  daysBetween,
  flatText,
  legacyDateTime,
  legacyDotDate,
  legacyDuration,
  legacySlashDate,
  median,
  percent,
  sessionSeconds,
  stripTags,
  studyDayOf,
  studyWeekOfDay,
  toCsv,
  weekKey,
} from "./format";

describe("legacy date formats (Eastern)", () => {
  it("prints m.d.Y H:i:s in the old server's timezone", () => {
    // 2026-09-30 02:10:09 UTC is 22:10:09 the evening before in New York (EDT).
    expect(legacyDateTime("2026-09-30T02:10:09Z")).toBe("09.29.2026 22:10:09");
    expect(legacyDateTime(null)).toBe("");
  });
  it("prints m/d/Y and m.d.Y", () => {
    expect(legacySlashDate("2026-01-05T15:00:00Z")).toBe("01/05/2026");
    expect(legacyDotDate("2026-07-25T04:00:00Z")).toBe("07.25.2026");
  });
});

describe("session durations", () => {
  it("is null without a sign-out (shown as Incomplete, not a 1970 diff)", () => {
    expect(sessionSeconds("2026-09-01T10:00:00Z", null)).toBeNull();
    expect(legacyDuration(null)).toBe("Incomplete");
    expect(clockDuration(null)).toBe("Incomplete");
  });
  it("rejects sign-outs before the sign-in", () => {
    expect(sessionSeconds("2026-09-01T10:00:00Z", "2026-09-01T09:59:00Z")).toBeNull();
  });
  it("keeps hours past a day and zero components (legacy bugs 1 and 2)", () => {
    expect(legacyDuration(3605)).toBe("1 hours 0 minutes 5 seconds"); // old: "5 seconds"
    expect(legacyDuration(240)).toBe("4 minutes 0 seconds"); // old: "0 seconds"
    expect(legacyDuration(26 * 3600 + 61)).toBe("26 hours 1 minutes 1 seconds"); // old: wrapped to 2 hours
    expect(legacyDuration(12)).toBe("12 seconds");
  });
  it("formats a clock duration", () => {
    expect(clockDuration(3909)).toBe("1:05:09");
    expect(clockDuration(sessionSeconds("2026-09-01T10:00:00Z", "2026-09-01T10:04:00.900Z"))).toBe("0:04:00");
  });
});

describe("CSV", () => {
  it("quotes commas, quotes and line breaks (RFC 4180)", () => {
    expect(csvField('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(true)).toBe("1");
  });
  it("defuses spreadsheet formulas but not numbers", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("-3")).toBe("-3");
    expect(csvField(-3)).toBe("-3");
    expect(csvField("LP-1001")).toBe("LP-1001");
  });
  it("writes CRLF rows and allows ragged rows", () => {
    expect(toCsv([["Participant SID", "Count", "Comments"], ["LP-1", 2, "a, b", "c"]])).toBe('Participant SID,Count,Comments\r\nLP-1,2,"a, b",c\r\n');
  });
  it("flattens and strips text like the legacy exports", () => {
    expect(flatText("Mozilla/5.0 (KHTML, like Gecko)\r\nx")).toBe("Mozilla/5.0 (KHTML like Gecko) x");
    expect(stripTags("<p>Hi &amp; bye</p><br/>ok")).toBe("Hi & bye  ok");
  });
});

describe("numbers and days", () => {
  it("computes medians and percentages", () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(percent(1, 3)).toBe("33%");
    expect(percent(1, 0)).toBe("—");
  });
  it("rounds whole days like the study-management view", () => {
    expect(daysBetween("2026-09-01T00:00:00Z", "2026-09-03T11:00:00Z")).toBe(2);
    expect(daysBetween("2026-09-01T00:00:00Z", "2026-09-03T13:00:00Z")).toBe(3);
  });
  it("counts study days and weeks from the start day", () => {
    expect(studyDayOf("2026-09-01", "2026-09-01")).toBe(1);
    expect(studyDayOf("2026-09-01", "2026-09-08")).toBe(8);
    expect(studyWeekOfDay(7)).toBe(1);
    expect(studyWeekOfDay(8)).toBe(2);
    expect(studyWeekOfDay(0)).toBe(0);
  });
});

describe("weekly buckets", () => {
  it("uses Monday weeks in Eastern time", () => {
    // Monday 2026-09-28 01:00 UTC is still Sunday evening in New York.
    expect(weekKey("2026-09-28T01:00:00Z")).toBe("2026-09-21");
    expect(weekKey("2026-09-28T12:00:00Z")).toBe("2026-09-28");
  });
  it("fills quiet weeks and counts each series", () => {
    const data = bucketByWeek(
      [
        { week: "2026-09-07", series: "a" },
        { week: "2026-09-07", series: "b" },
        { week: "2026-09-21", series: "a" },
      ],
      ["a", "b"] as const,
    );
    expect(data.map((d) => [d.week, d.a, d.b])).toEqual([
      ["2026-09-07", 1, 1],
      ["2026-09-14", 0, 0],
      ["2026-09-21", 1, 0],
    ]);
  });
  it("widens to the filter bounds and returns nothing without items", () => {
    expect(bucketByWeek([], ["a"] as const, { from: "2026-09-01" })).toEqual([]);
    const data = bucketByWeek([{ week: "2026-09-14", series: "a" }], ["a"] as const, { from: "2026-09-01", to: "2026-09-20" });
    expect(data.map((d) => d.week)).toEqual(["2026-08-31", "2026-09-07", "2026-09-14"]);
  });
});
