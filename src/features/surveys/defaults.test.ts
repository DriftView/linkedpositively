import { describe, expect, it } from "vitest";
import { promptMessage, promptStage, surveyLink } from "./defaults";

describe("promptStage", () => {
  it("follows the legacy midpoint windows", () => {
    expect(promptStage(9, 63, 10, 11)).toBeNull();
    expect(promptStage(10, 64, 10, 11)).toBe("ready");
    expect(promptStage(11, 71, 10, 11)).toBe("reminder");
    expect(promptStage(11, 77, 10, 11)).toBe("last");
    expect(promptStage(12, 78, 10, 11)).toBeNull();
  });

  it("handles one-week windows", () => {
    expect(promptStage(24, 162, 24, 24)).toBe("ready");
    expect(promptStage(24, 168, 24, 24)).toBe("last");
  });
});

describe("surveyLink", () => {
  it("appends the study id as ?ID=", () => {
    expect(surveyLink("https://umn.qualtrics.com/jfe/form/SV_x", "LP-104")).toBe("https://umn.qualtrics.com/jfe/form/SV_x?ID=LP-104");
    expect(surveyLink("https://q.example/form?lang=en", "A 1")).toBe("https://q.example/form?lang=en&ID=A+1");
  });

  it("rejects missing or invalid URLs", () => {
    expect(surveyLink("", "x")).toBeNull();
    expect(surveyLink("not a url", "x")).toBeNull();
  });
});

describe("promptMessage", () => {
  it("uses the survey title", () => {
    expect(promptMessage("ready", "Sam", "Midpoint survey")).toContain("your midpoint survey is ready");
  });
});
