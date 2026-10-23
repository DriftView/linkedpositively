import { describe, expect, it } from "vitest";
import {
  alignmentToVisemes,
  charViseme,
  pickBrowserVoice,
  SpeechChunker,
  TalkOverDetector,
  textToVisemes,
  visemeAt,
  voiceGenderFor,
} from "./voice-lib";

function feed(chunker: SpeechChunker, text: string, step = 3) {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += step) out.push(...chunker.push(text.slice(i, i + step)));
  const rest = chunker.flush();
  if (rest) out.push(rest);
  return out;
}

describe("SpeechChunker", () => {
  it("cuts a long first sentence at a comma so the coach starts talking sooner", () => {
    const text =
      "When you start PrEP, your provider will usually ask for an HIV test first, and then you check in every few months.";
    const chunks = feed(new SpeechChunker(), text);
    expect(chunks[0]).toBe("When you start PrEP, your provider will usually ask for an HIV test first,");
    expect(chunks.join(" ")).toBe(text);
  });

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

describe("pickBrowserVoice", () => {
  const voices = [
    { name: "Microsoft David - English (United States)", lang: "en-US" },
    { name: "Microsoft Zira - English (United States)", lang: "en-US" },
    { name: "Google UK English Male", lang: "en-GB" },
    { name: "Google UK English Female", lang: "en-GB" },
    { name: "Thomas", lang: "fr-FR" },
  ];

  it("gives a female coach a female voice, preferring natural-sounding ones", () => {
    expect(pickBrowserVoice(voices, "female")?.name).toBe("Google UK English Female");
    expect(pickBrowserVoice(voices.slice(0, 2), "female")?.name).toMatch(/Zira/);
  });

  it("gives a male coach a male voice", () => {
    expect(pickBrowserVoice(voices, "male")?.name).toBe("Google UK English Male");
    expect(pickBrowserVoice(voices.slice(0, 2), "male")?.name).toMatch(/David/);
  });

  it("falls back to any English voice, and to none without English", () => {
    expect(pickBrowserVoice([{ name: "Microsoft David", lang: "en-US" }], "female")?.name).toBe("Microsoft David");
    expect(pickBrowserVoice([{ name: "Thomas", lang: "fr-FR" }], "female")).toBeNull();
  });

  it("maps pronouns to a voice gender", () => {
    expect(voiceGenderFor("she")).toBe("female");
    expect(voiceGenderFor("he")).toBe("male");
    expect(voiceGenderFor("they")).toBeNull();
  });
});

describe("TalkOverDetector", () => {
  /** The coach's voice as the mic hears it: syllables rising and falling. */
  const echo = (tick: number) => 0.02 + 0.06 * Math.abs(Math.sin(tick / 3));
  /** Feeds readings until the detector fires; the tick it fired on, or -1. */
  function run(detector: TalkOverDetector, readings: (tick: number) => number, ticks: number) {
    for (let tick = 0; tick < ticks; tick++) if (detector.push(readings(tick), 50, 0.03)) return tick;
    return -1;
  }

  it("ignores the coach's own voice", () => {
    expect(run(new TalkOverDetector(), echo, 400)).toBe(-1);
  });

  it("stops the coach soon after the member starts talking, through the dips between syllables", () => {
    // Echo for 2 s, then the member: loud, with a quiet tick every fourth one.
    const fired = run(
      new TalkOverDetector(),
      (tick) => (tick < 40 ? echo(tick) : tick % 4 === 0 ? echo(tick) : 0.25 + echo(tick)),
      200,
    );
    expect(fired).toBeGreaterThan(40);
    expect((fired - 40) * 50).toBeLessThanOrEqual(500);
  });

  it("ignores a cough", () => {
    expect(run(new TalkOverDetector(), (tick) => (tick === 30 || tick === 31 ? 0.4 : echo(tick)), 200)).toBe(-1);
  });

  it("starts over after reset", () => {
    const detector = new TalkOverDetector();
    run(detector, () => 0.3, 10);
    detector.reset();
    expect(detector.push(0.3, 50, 0.03)).toBe(false);
  });
});
