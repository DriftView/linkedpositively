import { describe, expect, it } from "vitest";
import { base64ToPcm16, levelAt, pcm16ToFloat, pcmChunks, toPcm16 } from "./pcm";

describe("toPcm16", () => {
  it("resamples to the target rate", () => {
    const second = new Float32Array(22_050).fill(0.5);
    const pcm = toPcm16([second], 22_050);
    expect(pcm.length).toBe(16_000);
    expect(pcm[0]).toBe(Math.round(0.5 * 0x7fff));
  });

  it("mixes channels to mono and clamps", () => {
    const left = new Float32Array([1, -1, 2]);
    const right = new Float32Array([0, -1, 2]);
    expect([...toPcm16([left, right], 16_000)]).toEqual([Math.round(0.5 * 0x7fff), -0x8000, 0x7fff]);
  });

  it("handles empty audio", () => {
    expect(toPcm16([], 16_000).length).toBe(0);
    expect(toPcm16([new Float32Array(0)], 16_000).length).toBe(0);
  });
});

describe("pcmChunks", () => {
  it("splits into little-endian byte chunks", () => {
    const chunks = pcmChunks(new Int16Array([1, -2, 3]), 2);
    expect(chunks.map((chunk) => [...chunk])).toEqual([
      [1, 0, 0xfe, 0xff],
      [3, 0],
    ]);
  });
});

describe("levelAt", () => {
  it("is zero for silence and past the end", () => {
    const samples = new Float32Array(16_000);
    expect(levelAt(samples, 16_000, 500)).toBe(0);
    expect(levelAt(new Float32Array(10).fill(1), 16_000, 5_000)).toBe(0);
  });

  it("rises with loudness", () => {
    expect(levelAt(new Float32Array(16_000).fill(0.1), 16_000, 500)).toBeCloseTo(0.45);
    expect(levelAt(new Float32Array(16_000).fill(0.5), 16_000, 500)).toBe(1);
  });
});

describe("streamed PCM", () => {
  it("decodes little-endian base64 PCM to samples", () => {
    const bytes = new Uint8Array([0x00, 0x00, 0xff, 0x7f, 0x00, 0x80]);
    const base64 = btoa(String.fromCharCode(...bytes));
    expect(Array.from(base64ToPcm16(base64))).toEqual([0, 0x7fff, -0x8000]);
  });

  it("turns 16-bit samples into floats between -1 and 1", () => {
    const floats = pcm16ToFloat(new Int16Array([0, 0x7fff, -0x8000]));
    expect(floats[0]).toBe(0);
    expect(floats[1]).toBeCloseTo(1, 3);
    expect(floats[2]).toBe(-1);
  });

  it("ignores a trailing odd byte", () => {
    const base64 = btoa(String.fromCharCode(0x01, 0x00, 0x05));
    expect(Array.from(base64ToPcm16(base64))).toEqual([1]);
  });
});
