import { describe, expect, it } from "vitest";
import { anyWordQuery, clip, isSmallTalk, JsonLineReader, parseCoachMarkdown } from "./lib";

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
    const blocks = parseCoachMarkdown(
      "Here's **PrEP**:\n\n- Daily pill\n- Shot every 2 months\n\n1. Talk to a provider\n2. Get tested\nThanks",
    );
    expect(blocks).toEqual([
      {
        type: "paragraph",
        spans: [
          { text: "Here's ", bold: false },
          { text: "PrEP", bold: true },
          { text: ":", bold: false },
        ],
      },
      {
        type: "list",
        ordered: false,
        items: [[{ text: "Daily pill", bold: false }], [{ text: "Shot every 2 months", bold: false }]],
      },
      {
        type: "list",
        ordered: true,
        items: [[{ text: "Talk to a provider", bold: false }], [{ text: "Get tested", bold: false }]],
      },
      { type: "paragraph", spans: [{ text: "Thanks", bold: false }] },
    ]);
  });

  it("never produces HTML", () => {
    const blocks = parseCoachMarkdown("<script>alert(1)</script>");
    expect(blocks).toEqual([{ type: "paragraph", spans: [{ text: "<script>alert(1)</script>", bold: false }] }]);
  });
});

describe("isSmallTalk", () => {
  it("spots greetings, thanks and short acknowledgements", () => {
    for (const text of ["hi", "Hey there!", "thanks so much", "okay", "Ok cool.", "good morning", "yes", "bye"])
      expect(isSmallTalk(text), text).toBe(true);
  });

  it("never treats a question or anything with substance as small talk", () => {
    for (const text of [
      "where can I get PrEP?",
      "hi, I think I was exposed to HIV",
      "thanks, what about PEP",
      "I want to hurt myself",
      "ok so how often should I test",
    ])
      expect(isSmallTalk(text), text).toBe(false);
  });
});

describe("JsonLineReader", () => {
  it("parses objects split across reads and skips blank lines", () => {
    const reader = new JsonLineReader();
    expect(reader.push('{"a":1}\n{"b"')).toEqual([{ a: 1 }]);
    expect(reader.push(":2}\n\n")).toEqual([{ b: 2 }]);
    expect(reader.push('{"c":3}')).toEqual([]);
    expect(reader.flush()).toEqual([{ c: 3 }]);
  });

  it("skips lines that aren't JSON", () => {
    const reader = new JsonLineReader();
    expect(reader.push('nope\n{"ok":true}\n')).toEqual([{ ok: true }]);
  });
});
