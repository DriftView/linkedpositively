/**
 * Pure helpers for the coach's voice (client-safe, unit-tested in voice-lib.test.ts):
 * cutting a streaming reply into speakable chunks, and turning speech timing
 * into mouth shapes (visemes) for the avatar's lip sync.
 */

// ---------------------------------------------------------------------------
// Chunking a streaming reply
// ---------------------------------------------------------------------------

/**
 * Collects streamed text and hands back whole sentences to speak, so the coach
 * starts talking after the first sentence instead of after the whole reply.
 * The first chunk is short (fast start); later ones group sentences so a reply
 * isn't split into many small voice requests.
 */
export class SpeechChunker {
  private buffer = "";
  private emitted = 0;

  constructor(private readonly options = { firstMin: 20, min: 90, max: 320 }) {}

  push(delta: string): string[] {
    this.buffer += delta;
    const chunks: string[] = [];
    for (;;) {
      const chunk = this.take();
      if (chunk === null) break;
      if (chunk) chunks.push(chunk);
    }
    return chunks;
  }

  /** Whatever is left once the reply is complete. */
  flush(): string | null {
    const rest = this.buffer.trim();
    this.buffer = "";
    if (!rest) return null;
    this.emitted++;
    return rest;
  }

  private take(): string | null {
    const min = this.emitted === 0 ? this.options.firstMin : this.options.min;
    // Sentence ends: . ! ? … followed by space (not "2.5" or a list number like "1. "), or a line break.
    const boundary = /(?<!\b\d)[.!?…]+["')\]]*(?=\s)|\n+/g;
    let cut = -1;
    for (const match of this.buffer.matchAll(boundary)) {
      const end = match.index + match[0].length;
      if (end >= min) {
        cut = end;
        break;
      }
    }
    if (cut < 0 && this.buffer.length > this.options.max) {
      // A very long sentence: break at a comma, else a space.
      const window = this.buffer.slice(0, this.options.max);
      const comma = window.lastIndexOf(", ");
      const space = window.lastIndexOf(" ");
      cut = comma > min ? comma + 1 : space > min ? space : this.options.max;
    }
    if (cut < 0) return null;
    const chunk = this.buffer.slice(0, cut).trim();
    this.buffer = this.buffer.slice(cut);
    if (chunk) this.emitted++;
    return chunk;
  }
}

// ---------------------------------------------------------------------------
// Lip sync
// ---------------------------------------------------------------------------

/**
 * Mouth shapes: rest (closed smile), A (open), E (wide), O (round), U (small
 * round), M (lips pressed: m b p), F (lip under teeth: f v), L (slightly open,
 * teeth showing: most other consonants).
 */
export const VISEMES = ["rest", "A", "E", "O", "U", "M", "F", "L"] as const;
export type Viseme = (typeof VISEMES)[number];

/** [ms from the start of the audio, viseme] pairs in time order. */
export type VisemeTrack = [number, Viseme][];

export function charViseme(char: string): Viseme | null {
  const c = char.normalize("NFD").charAt(0).toLowerCase();
  if ("a".includes(c)) return "A";
  if ("eiy".includes(c)) return "E";
  if ("o".includes(c)) return "O";
  if ("uwq".includes(c)) return "U";
  if ("mbp".includes(c)) return "M";
  if ("fv".includes(c)) return "F";
  if (/[\p{L}\p{N}]/u.test(c)) return "L";
  return null;
}

/** A pause this long (space or punctuation) closes the mouth. */
const PAUSE_MS = 140;

function pushViseme(track: VisemeTrack, at: number, viseme: Viseme) {
  const last = track[track.length - 1];
  if (last?.[1] === viseme) return;
  if (last && last[0] === at) last[1] = viseme;
  else track.push([at, viseme]);
}

/**
 * Visemes from per-character timing (ElevenLabs "with-timestamps" alignment).
 * Short gaps between words keep the previous shape; real pauses close the mouth.
 */
export function alignmentToVisemes(characters: string[], startSeconds: number[], endSeconds: number[]): VisemeTrack {
  const track: VisemeTrack = [[0, "rest"]];
  let end = 0;
  characters.forEach((char, index) => {
    const start = Math.round((startSeconds[index] ?? 0) * 1000);
    const stop = Math.round((endSeconds[index] ?? startSeconds[index] ?? 0) * 1000);
    end = Math.max(end, stop);
    const viseme = charViseme(char);
    if (viseme) pushViseme(track, start, viseme);
    else if (stop - start >= PAUSE_MS) pushViseme(track, start, "rest");
  });
  pushViseme(track, end, "rest");
  return track;
}

/**
 * Visemes for text with estimated timing (the browser's own voice only reports
 * where each word starts). `offsetMs` is where the text starts.
 */
export function textToVisemes(text: string, msPerChar = 70, offsetMs = 0): VisemeTrack {
  const chars = [...text];
  const starts = chars.map((_, index) => (offsetMs + index * msPerChar) / 1000);
  const ends = chars.map((_, index) => (offsetMs + (index + 1) * msPerChar) / 1000);
  const track = alignmentToVisemes(chars, starts, ends);
  // alignmentToVisemes starts at 0; for an offset word, drop the leading rest.
  return offsetMs > 0 ? track.filter(([at], index) => index > 0 || at >= offsetMs) : track;
}

/** The viseme at `ms`. `track` is sorted by time. */
export function visemeAt(track: VisemeTrack, ms: number): Viseme {
  let low = 0;
  let high = track.length - 1;
  let found: Viseme = "rest";
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (track[mid][0] <= ms) {
      found = track[mid][1];
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}
