import { describe, expect, it } from "vitest";
import { alignmentToVisemes, charViseme, SpeechChunker, textToVisemes, visemeAt } from "./voice-lib";

function feed(chunker: SpeechChunker, text: string, step = 3) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) out.push(...chunker.push(text.slice(i, i + step)));
  const rest = chunker.flush();
  if (rest) out.push(rest);
  return out;
}

describe("SpeechChunker", () => {
  it("speaks the first sentence early, then groups the rest", () => {
    const text =
      "PrEP is a medicine that lowers the chance of getting HIV. It works best when taken as prescribed. Your provider can help you decide. Many clinics offer it at low cost. You can also ask your navigator.";
    const chunks = feed(new SpeechChunker(), text);
    expect(chunks[0]).toBe("PrEP is a medicine that lowers the chance of getting HIV.");
    expect(chunks.length).toBeLessThan(5);
    expect(chunks.join(" ")).toBe(text);
  });

  it("doesn't split on numbers or list markers", () => {
    const chunks = feed(
      new SpeechChunker({ firstMin: 1, min: 1, max: 320 }),
      "Take 2.5 mg daily.\n1. Call first.\n2. Bring ID.",
    );
    expect(chunks).toEqual(["Take 2.5 mg daily.", "1. Call first.", "2. Bring ID."]);
  });

  it("breaks very long sentences at a comma", () => {
    const long = `${"word ".repeat(40)}and more, ${"text ".repeat(40)}end.`;
    const chunks = feed(new SpeechChunker({ firstMin: 20, min: 90, max: 320 }), long);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 320)).toBe(true);
  });

  it("returns nothing for an empty reply", () => {
    expect(feed(new SpeechChunker(), "")).toEqual([]);
  });
});

describe("visemes", () => {
  it("maps letters to mouth shapes", () => {
    expect(charViseme("a")).toBe("A");
    expect(charViseme("É")).toBe("E");
    expect(charViseme("b")).toBe("M");
    expect(charViseme("v")).toBe("F");
    expect(charViseme("t")).toBe("L");
    expect(charViseme(" ")).toBeNull();
  });

  it("builds a track from alignment, closing on pauses", () => {
    const chars = [..."hi. ok"];
    const starts = [0, 0.08, 0.16, 0.2, 0.6, 0.7];
    const ends = [0.08, 0.16, 0.2, 0.6, 0.7, 0.8];
    const track = alignmentToVisemes(chars, starts, ends);
    expect(track[0]).toEqual([0, "L"]);
    expect(visemeAt(track, 90)).toBe("E");
    expect(visemeAt(track, 300)).toBe("rest");
    expect(visemeAt(track, 620)).toBe("O");
    expect(visemeAt(track, 900)).toBe("rest");
  });

  it("estimates a track for plain text", () => {
    const track = textToVisemes("mama", 100, 1000);
    expect(visemeAt(track, 1050)).toBe("M");
    expect(visemeAt(track, 1150)).toBe("A");
    expect(visemeAt(track, 1500)).toBe("rest");
  });
});
