import { describe, expect, it } from "vitest";
import { formatInZone, studyWeek } from "@/lib/dates";
import { cycleKey, planProgram, startOfLocalDay, weeklySendTime, welcomeSendTime } from "./schedule";
import { DEFAULT_TEMPLATES, legacyLinkPath, renderSmsBody } from "./program";
import { normalizePhone } from "./phone";
import { smsSegments, straightenPunctuation } from "./segments";

const TZ = "America/Chicago";

describe("weeklySendTime", () => {
  it("is deterministic per user, cycle and week", () => {
    expect(weeklySendTime("u1", "2026-03-02", 5, TZ)).toEqual(weeklySendTime("u1", "2026-03-02", 5, TZ));
  });

  it("differs between participants", () => {
    const times = new Set(
      Array.from({ length: 40 }, (_, i) => weeklySendTime(`user-${i}`, "2026-03-02", 3, TZ).getTime()),
    );
    expect(times.size).toBeGreaterThan(10);
  });

  it("stays within 7:00–21:00 local on the first days of each week", () => {
    const start = "2026-03-02";
    const startDate = new Date("2026-03-02T06:00:00Z"); // midnight in Chicago (CST)
    for (let i = 0; i < 60; i++) {
      for (let week = 1; week <= 24; week++) {
        const at = weeklySendTime(`u${i}`, start, week, TZ);
        const hour = Number(formatInZone(at, "H", TZ));
        expect(hour).toBeGreaterThanOrEqual(7);
        expect(hour).toBeLessThanOrEqual(21);
        expect(formatInZone(at, "mm", TZ)).toBe("00");
        expect(studyWeek(startDate, at, TZ)).toBe(week);
        const dayInWeek = (Math.round((at.getTime() - startDate.getTime()) / 86_400_000 - 0.5) + 7) % 7;
        if (week === 1) expect([1, 2]).toContain(dayInWeek);
        else expect([0, 1, 2]).toContain(dayInWeek);
      }
    }
  });

  it("keeps local hours across a daylight-saving change", () => {
    // 2026-03-08 is the US spring-forward date.
    const at = weeklySendTime("dst-user", "2026-03-02", 2, TZ);
    const hour = Number(formatInZone(at, "H", TZ));
    expect(hour).toBeGreaterThanOrEqual(7);
  });
});

describe("planProgram", () => {
  it("plans WELCOME plus 24 weeks", () => {
    const plan = planProgram({ userId: "u", cycle: "2026-01-05", timezone: TZ, roleChangedAt: new Date("2026-01-05T15:15:00Z") });
    expect(plan).toHaveLength(25);
    expect(plan[0].flag).toBe("WELCOME");
    expect(plan.at(-1)?.flag).toBe("WEEK-24");
  });

  it("omits WELCOME without a randomization time", () => {
    expect(planProgram({ userId: "u", cycle: "2026-01-05", timezone: TZ })).toHaveLength(24);
  });
});

describe("welcome and cycle helpers", () => {
  it("sends WELCOME 15 minutes after randomization, on the minute", () => {
    expect(welcomeSendTime(new Date("2026-01-05T15:02:41Z")).toISOString()).toBe("2026-01-05T15:17:00.000Z");
  });

  it("uses the participant's local day", () => {
    const lateEvening = new Date("2026-01-06T04:30:00Z"); // 22:30 on Jan 5 in Chicago
    expect(cycleKey(startOfLocalDay(lateEvening, TZ), TZ)).toBe("2026-01-05");
  });
});

describe("program texts", () => {
  it("has 25 messages with the legacy link routing", () => {
    expect(DEFAULT_TEMPLATES).toHaveLength(25);
    expect(legacyLinkPath(1)).toBe("/profile");
    expect(legacyLinkPath(12)).toBe("/resources");
    expect(legacyLinkPath(20)).toBe("/tracker");
    expect(legacyLinkPath(14)).toBe("/tips");
    expect(legacyLinkPath(5)).toBe("/");
    expect(DEFAULT_TEMPLATES[23].linkPath).toBe("");
  });

  it("replaces or drops the link token", () => {
    expect(renderSmsBody("Go <link>", "https://x/r/abc")).toBe("Go https://x/r/abc");
    expect(renderSmsBody("Go <link>", null)).toBe("Go");
    expect(renderSmsBody("No link", "https://x")).toBe("No link");
  });
});

describe("normalizePhone", () => {
  it("follows the legacy rules", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhone("12345")).toBeNull();
  });
});

describe("smsSegments", () => {
  it("counts GSM-7 messages", () => {
    expect(smsSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsSegments("a".repeat(161))).toMatchObject({ encoding: "GSM-7", segments: 2 });
    expect(smsSegments("[]")).toMatchObject({ units: 4 });
  });

  it("switches to UCS-2 for curly quotes", () => {
    const info = smsSegments("it’s " + "a".repeat(70));
    expect(info.encoding).toBe("UCS-2");
    expect(info.unicodeChars).toEqual(["’"]);
    expect(info.segments).toBe(2);
  });

  it("straightens typographic punctuation", () => {
    expect(smsSegments(straightenPunctuation("it’s “fine”")).encoding).toBe("GSM-7");
  });
});
