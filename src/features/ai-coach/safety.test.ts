import { describe, expect, it } from "vitest";
import { detectKeywordRisk, maxRisk } from "./safety";

describe("detectKeywordRisk", () => {
  it.each([
    ["I want to kill myself", "suicide"],
    ["honestly I don’t want to be alive anymore", "suicide"],
    ["Everyone would be better off without me", "suicide"],
    ["i think i overdosed", "overdose"],
    ["I took too many pills", "overdose"],
    ["I'm gonna hurt someone tonight", "violence"],
    ["I can't breathe and have chest pain", "medical"],
  ])("flags %j as urgent %s", (text, category) => {
    expect(detectKeywordRisk(text)).toEqual({ level: "urgent", category });
  });

  it.each([
    ["I've been cutting myself again", "self_harm"],
    ["my boyfriend hits me when he's drunk", "abuse"],
    ["I'm not safe at home", "abuse"],
  ])("flags %j as elevated %s", (text, category) => {
    expect(detectKeywordRisk(text)).toEqual({ level: "elevated", category });
  });

  it("prefers the urgent match when several rules match", () => {
    expect(detectKeywordRisk("I've been cutting myself and I want to die")).toEqual({
      level: "urgent",
      category: "suicide",
    });
  });

  it.each([
    "Where can I get an HIV test?",
    "That workout is killing it",
    "What's the difference between PrEP and PEP?",
    "I'm dying to know when the clinic opens",
    "my mom hits me up every morning",
  ])("does not flag everyday text %j", (text) => {
    expect(detectKeywordRisk(text)).toBeNull();
  });
});

describe("maxRisk", () => {
  it("returns the more serious level", () => {
    expect(maxRisk("support", "urgent")).toBe("urgent");
    expect(maxRisk("elevated", "none")).toBe("elevated");
  });
});
