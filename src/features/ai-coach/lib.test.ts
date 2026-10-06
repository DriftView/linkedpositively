import { describe, expect, it } from "vitest";
import { anyWordQuery, clip, parseCoachMarkdown } from "./lib";

describe("anyWordQuery", () => {
  it("joins unique words with or", () => {
    expect(anyWordQuery("PrEP side-effects, PrEP?")).toBe("prep or side or effects");
  });

  it("drops conversational filler", () => {
    expect(anyWordQuery("I really want to know where I can get PrEP")).toBe("to or where or can or prep");
    expect(anyWordQuery("i don't want to be alive anymore")).toBe("to or be or alive");
  });

  it("drops one-letter words and the operator word", () => {
    expect(anyWordQuery("a or b")).toBeNull();
    expect(anyWordQuery("")).toBeNull();
  });
});

describe("clip", () => {
  it("keeps short text", () => {
    expect(clip("  Hello   there ", 50)).toBe("Hello there");
  });

  it("prefers a sentence boundary", () => {
    expect(clip("PrEP is a pill. It lowers the chance of getting HIV from sex by a lot.", 20)).toBe("PrEP is a pill.");
  });
});

describe("parseCoachMarkdown", () => {
  it("parses paragraphs, bold and lists", () => {
    const blocks = parseCoachMarkdown("Here's **PrEP**:\n\n- Daily pill\n- Shot every 2 months\n\n1. Talk to a provider\n2. Get tested\nThanks");
    expect(blocks).toEqual([
      { type: "paragraph", spans: [{ text: "Here's ", bold: false }, { text: "PrEP", bold: true }, { text: ":", bold: false }] },
      { type: "list", ordered: false, items: [[{ text: "Daily pill", bold: false }], [{ text: "Shot every 2 months", bold: false }]] },
      { type: "list", ordered: true, items: [[{ text: "Talk to a provider", bold: false }], [{ text: "Get tested", bold: false }]] },
      { type: "paragraph", spans: [{ text: "Thanks", bold: false }] },
    ]);
  });

  it("never produces HTML", () => {
    const blocks = parseCoachMarkdown("<script>alert(1)</script>");
    expect(blocks).toEqual([{ type: "paragraph", spans: [{ text: "<script>alert(1)</script>", bold: false }] }]);
  });
});
