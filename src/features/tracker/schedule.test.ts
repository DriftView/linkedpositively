import { describe, expect, it } from "vitest";
import { describeSchedule, dueSlot, formatTime } from "./schedule";
import type { ReminderSchedule } from "./types";

const base: ReminderSchedule = { enabled: true, channel: "sms", frequency: "daily", weekday: 1, hour: 20, minute: 0 };
const NY = "America/New_York";

describe("formatTime", () => {
  it("uses a 12-hour clock", () => {
    expect(formatTime(0, 0)).toBe("12:00 AM");
    expect(formatTime(12, 30)).toBe("12:30 PM");
    expect(formatTime(20, 0)).toBe("8:00 PM");
  });
});

describe("describeSchedule", () => {
  it("summarises daily, weekly and off", () => {
    expect(describeSchedule(base)).toBe("Every day at 8:00 PM, by text message");
    expect(describeSchedule({ ...base, frequency: "weekly", weekday: 3, minute: 30, channel: "in_app" })).toBe(
      "Wednesdays at 8:30 PM, in the app",
    );
    expect(describeSchedule({ ...base, enabled: false })).toBe("Reminders are off");
  });
});

describe("dueSlot", () => {
  // 2026-09-29 is a Tuesday. 20:00 in New York (EDT, UTC-4) = 00:00 UTC next day.
  const at = (iso: string) => new Date(iso);

  it("is due from the scheduled time until the grace period ends", () => {
    expect(dueSlot(base, at("2026-09-29T23:59:00Z"), NY)).toBeNull(); // 19:59 local
    expect(dueSlot(base, at("2026-09-30T00:00:00Z"), NY)).toBe("2026-09-29");
    expect(dueSlot(base, at("2026-09-30T01:44:00Z"), NY)).toBe("2026-09-29"); // a late run still sends
    expect(dueSlot(base, at("2026-09-30T02:00:00Z"), NY)).toBeNull(); // 2h later: too late
  });

  it("honours the :30 slot and the participant's own timezone", () => {
    const halfPast = { ...base, hour: 9, minute: 30 as const };
    expect(dueSlot(halfPast, at("2026-09-29T13:29:00Z"), NY)).toBeNull();
    expect(dueSlot(halfPast, at("2026-09-29T13:30:00Z"), NY)).toBe("2026-09-29");
    expect(dueSlot(halfPast, at("2026-09-29T16:30:00Z"), "America/Los_Angeles")).toBe("2026-09-29");
  });

  it("only fires on the chosen weekday for weekly reminders", () => {
    const weekly = { ...base, frequency: "weekly" as const, weekday: 2, hour: 9 };
    expect(dueSlot(weekly, at("2026-09-29T13:15:00Z"), NY)).toBe("2026-09-29"); // Tuesday
    expect(dueSlot({ ...weekly, weekday: 3 }, at("2026-09-29T13:15:00Z"), NY)).toBeNull();
  });

  it("keeps a late-evening slot due just after midnight", () => {
    const late = { ...base, hour: 23, minute: 30 as const };
    // 00:15 local on Sep 30 → still the Sep 29 slot.
    expect(dueSlot(late, at("2026-09-30T04:15:00Z"), NY)).toBe("2026-09-29");
    expect(dueSlot(late, at("2026-09-30T04:15:00Z"), NY, { includePreviousDay: false })).toBeNull();
  });

  it("does nothing when reminders are off", () => {
    expect(dueSlot({ ...base, enabled: false }, at("2026-09-30T00:00:00Z"), NY)).toBeNull();
  });

  it("lets in-app reminders stay due for the rest of the day", () => {
    const opts = { graceMinutes: 24 * 60, includePreviousDay: false };
    expect(dueSlot({ ...base, hour: 8 }, at("2026-09-30T03:30:00Z"), NY, opts)).toBe("2026-09-29"); // 23:30 local
  });
});
