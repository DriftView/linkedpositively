import { describe, expect, it } from "vitest";
import { isTodaysTip, latestReleaseDay, studyClock, studyDayStart, tipDayInCycle } from "./schedule";
import { compareScore, describeRule, isRecommended } from "./tailoring";
import { videoEmbed } from "./video";

const TZ = "America/New_York";
const start = new Date("2026-01-05T05:00:00Z"); // Jan 5, 00:00 in New York

describe("studyClock", () => {
  it("is null before the start or without a start", () => {
    expect(studyClock(null, new Date(), TZ)).toBeNull();
    expect(studyClock(start, new Date("2026-01-04T12:00:00Z"), TZ)).toBeNull();
  });

  it("counts day 1 on the start date in the participant's timezone", () => {
    // 11pm Jan 5 in New York is already Jan 6 UTC — still day 1.
    expect(studyClock(start, new Date("2026-01-06T04:00:00Z"), TZ)).toMatchObject({ day: 1, cycle: 1, dayInCycle: 1 });
    expect(studyClock(start, new Date("2026-01-06T06:00:00Z"), TZ)).toMatchObject({ day: 2 });
  });

  it("rolls into cycle 2 after day 90 and keeps cycling", () => {
    const day91 = new Date(studyDayStart({ start, timezone: TZ }, 91).getTime() + 3600_000);
    expect(studyClock(start, day91, TZ)).toMatchObject({ day: 91, cycle: 2, dayInCycle: 1 });
    const day181 = new Date(studyDayStart({ start, timezone: TZ }, 181).getTime() + 3600_000);
    expect(studyClock(start, day181, TZ)).toMatchObject({ cycle: 3, dayInCycle: 1 });
  });
});

describe("release days", () => {
  const clock = (day: number) => ({ day, cycle: Math.floor((day - 1) / 90) + 1, dayInCycle: ((day - 1) % 90) + 1, start, timezone: TZ });

  it("uses displayDay in cycle 1 and displayDayTwo afterwards", () => {
    expect(tipDayInCycle({ displayDay: 4, displayDayTwo: 9 }, 1)).toBe(4);
    expect(tipDayInCycle({ displayDay: 4, displayDayTwo: 9 }, 2)).toBe(9);
    expect(tipDayInCycle({ displayDay: 4 }, 3)).toBe(4);
    expect(tipDayInCycle({}, 1)).toBeNull();
  });

  it("finds the latest release up to today", () => {
    const tip = { displayDay: 10, displayDayTwo: 3 };
    expect(latestReleaseDay(tip, clock(9))).toBeNull();
    expect(latestReleaseDay(tip, clock(10))).toBe(10);
    expect(latestReleaseDay(tip, clock(92))).toBe(10);
    expect(latestReleaseDay(tip, clock(93))).toBe(93);
    expect(latestReleaseDay({}, clock(50))).toBeNull();
  });

  it("knows today's tips", () => {
    expect(isTodaysTip({ displayDay: 5 }, clock(5))).toBe(true);
    expect(isTodaysTip({ displayDay: 5, displayDayTwo: 1 }, clock(91))).toBe(true);
    expect(isTodaysTip({ displayDay: 5, displayDayTwo: 1 }, clock(95))).toBe(false);
  });

  it("puts releases at local midnight", () => {
    expect(studyDayStart({ start, timezone: TZ }, 1).toISOString()).toBe("2026-01-05T05:00:00.000Z");
    expect(studyDayStart({ start, timezone: TZ }, 3).toISOString()).toBe("2026-01-07T05:00:00.000Z");
  });
});

describe("tailoring", () => {
  it("compares numerically", () => {
    expect(compareScore(3, "<", 5)).toBe(true);
    expect(compareScore(5, ">=", 5)).toBe(true);
    expect(compareScore(5, "!=", 5)).toBe(false);
    expect(compareScore(10, ">", 9)).toBe(true); // version_compare-style string compare would also pass; "10" < "9" lexically would not
    expect(compareScore(1, "~", 1)).toBe(false);
  });

  it("never recommends on missing scores", () => {
    const rule = { field: "b3", operator: "<", value: 4 };
    expect(isRecommended(rule, {})).toBe(false);
    expect(isRecommended(rule, { b3: null })).toBe(false);
    expect(isRecommended(rule, { b3: "" })).toBe(false);
    expect(isRecommended(rule, { b3: 2 })).toBe(true);
    expect(isRecommended(rule, { b3: "2" })).toBe(true);
    expect(isRecommended(null, { b3: 2 })).toBe(false);
  });

  it("describes rules for staff", () => {
    expect(describeRule({ field: "m2", operator: ">=", value: 4 })).toBe("M2 at least 4");
  });
});

describe("videoEmbed", () => {
  it("handles YouTube and Vimeo links", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.embedUrl).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(videoEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")?.id).toBe("dQw4w9WgXcQ");
    expect(videoEmbed("https://vimeo.com/76979871")?.embedUrl).toBe("https://player.vimeo.com/video/76979871?dnt=1");
  });

  it("rejects anything else", () => {
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
    expect(videoEmbed("https://example.com/video.mp4")).toBeNull();
    expect(videoEmbed("")).toBeNull();
  });
});
