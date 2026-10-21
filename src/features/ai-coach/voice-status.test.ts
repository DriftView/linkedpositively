import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** ElevenLabs outage detection: what trips it, how long it lasts, and the credit check for the admin banner. */

vi.mock("@/env", () => ({ env: { ELEVENLABS_API_KEY: "key" } }));
vi.mock("@/server/logger", () => ({ logger: { warn: vi.fn() } }));

const {
  classifyFailure,
  elevenLabsDown,
  getVoiceHealth,
  reportElevenLabsFailure,
  reportElevenLabsSuccess,
  resetVoiceStatus,
} = await import("./voice-status");

const failure = (status: number, body = "") => new Response(body, { status });

beforeEach(() => {
  resetVoiceStatus();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("classifyFailure", () => {
  it("tells running out of credits from a rejected key", () => {
    expect(classifyFailure(401, '{"detail":{"status":"quota_exceeded"}}')).toBe("out_of_credits");
    expect(classifyFailure(402)).toBe("out_of_credits");
    expect(classifyFailure(401, '{"detail":{"status":"invalid_api_key"}}')).toBe("rejected_key");
  });

  it("treats server errors and network failures as possibly passing", () => {
    expect(classifyFailure(503)).toBe("transient");
    expect(classifyFailure(null)).toBe("transient");
  });

  it("ignores busy and bad requests (not outages)", () => {
    expect(classifyFailure(429)).toBe("ignore");
    expect(classifyFailure(400, "credits")).toBe("ignore");
  });
});

describe("outage", () => {
  it("skips ElevenLabs at once when it is out of credits, then tries again after the cooldown", async () => {
    await reportElevenLabsFailure(failure(401, "quota_exceeded"));
    expect(elevenLabsDown()).toBe(true);
    vi.advanceTimersByTime(10 * 60_000 + 1);
    expect(elevenLabsDown()).toBe(false);
  });

  it("needs two network failures in a row, and a success in between resets the count", async () => {
    await reportElevenLabsFailure(null);
    expect(elevenLabsDown()).toBe(false);
    reportElevenLabsSuccess();
    await reportElevenLabsFailure(null);
    expect(elevenLabsDown()).toBe(false);
    await reportElevenLabsFailure(failure(500));
    expect(elevenLabsDown()).toBe(true);
    vi.advanceTimersByTime(2 * 60_000 + 1);
    expect(elevenLabsDown()).toBe(false);
  });

  it("never trips on too-many-requests", async () => {
    for (let i = 0; i < 5; i++) await reportElevenLabsFailure(failure(429));
    expect(elevenLabsDown()).toBe(false);
  });
});

describe("getVoiceHealth", () => {
  it("reports credits and a current outage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          character_count: 9000,
          character_limit: 10000,
          next_character_count_reset_unix: 1_800_000_000,
          max_credit_limit_extension: 0,
        }),
      ),
    );
    await reportElevenLabsFailure(failure(402));
    const health = await getVoiceHealth();
    expect(health?.outage?.reason).toBe("out_of_credits");
    expect(health?.credits).toMatchObject({ used: 9000, limit: 10000, payAsYouGo: false });
    expect(health?.credits?.resetsAt?.getTime()).toBe(1_800_000_000_000);
  });
});
