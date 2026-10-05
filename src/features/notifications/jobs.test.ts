import { describe, expect, it } from "vitest";
import { timeOnSiteMessages } from "./jobs";

describe("time on site messages", () => {
  const messages = timeOnSiteMessages("Sam");

  it("covers the legacy milestones", () => {
    expect(messages.map((message) => message.week)).toEqual([3, 6, 9, 12, 15, 18, 21, 23, 24]);
  });

  it("counts remaining weeks correctly (the old week-6 text said 8)", () => {
    expect(messages[0].text).toBe("Hello Sam. You have been on the LinkPositively site for 3 weeks. You have 21 weeks remaining!");
    expect(messages[1].text).toContain("You have 18 weeks remaining!");
    expect(messages[5].text).toContain("You have 6 weeks remaining!");
  });

  it("uses the closing texts at the end", () => {
    expect(messages.at(-1)?.text).toContain("Your time in the study is now at a close. Time to get in that final post!");
    expect(messages[6].text).toContain("Time to start wrapping things up!");
  });
});
