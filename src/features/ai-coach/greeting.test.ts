import { describe, expect, it } from "vitest";
import { GREETINGS, greetingFor, shouldGreet } from "./greeting";

describe("greetingFor", () => {
  it("fits the time of day and names the coach", () => {
    expect(greetingFor({ coachName: "Mina", hour: 8, seed: 0 }).spoken).toMatch(/^Good morning\. I'm Mina/);
    expect(greetingFor({ coachName: "Mina", hour: 14, seed: 0 }).spoken).toMatch(/^Good afternoon/);
    expect(greetingFor({ coachName: "Mina", hour: 21, seed: 0 }).spoken).toMatch(/^Good evening/);
    expect(greetingFor({ coachName: "Mina", hour: 2, seed: 0 }).spoken).toMatch(/^Hi there/);
  });

  it("adds the first name to the text only, so the audio can be shared", () => {
    const greeting = greetingFor({ coachName: "Mina", firstName: "Ada", hour: 9, seed: 1 });
    expect(greeting.text).toMatch(/^Good morning, Ada\./);
    expect(greeting.spoken).not.toMatch(/Ada/);
  });

  it("picks one of the fixed lines, the same for the same seed", () => {
    const a = greetingFor({ coachName: "Liam", hour: 10, seed: 5 });
    const b = greetingFor({ coachName: "Liam", hour: 10, seed: 5 });
    expect(a).toEqual(b);
    expect(a.index).toBeGreaterThanOrEqual(0);
    expect(a.index).toBeLessThan(GREETINGS.length);
  });
});

describe("shouldGreet", () => {
  const base = {
    enabled: true,
    impersonating: false,
    greetedThisSession: false,
    lastGreetedDay: null as string | null,
    today: "2026-10-30",
  };

  it("greets once a day, on the first page of a session", () => {
    expect(shouldGreet(base)).toBe(true);
    expect(shouldGreet({ ...base, greetedThisSession: true })).toBe(false);
    expect(shouldGreet({ ...base, lastGreetedDay: "2026-10-30" })).toBe(false);
    expect(shouldGreet({ ...base, lastGreetedDay: "2026-10-29" })).toBe(true);
  });

  it("never greets when switched off or while staff view as the member", () => {
    expect(shouldGreet({ ...base, enabled: false })).toBe(false);
    expect(shouldGreet({ ...base, impersonating: true })).toBe(false);
  });
});
