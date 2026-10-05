/**
 * SMS length maths for the template editor. A text that only uses the GSM-7
 * alphabet fits 160 characters in one segment (153 per segment when split);
 * any other character (curly quotes ’ “ ”, emoji…) switches the whole message
 * to UCS-2: 70 characters, 67 per segment when split.
 */

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€\f";

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

export type SegmentInfo = {
  encoding: "GSM-7" | "UCS-2";
  /** Characters as the carrier counts them (GSM extended chars count double). */
  units: number;
  segments: number;
  perSegment: number;
  /** Characters that forced UCS-2, de-duplicated. */
  unicodeChars: string[];
};

export function smsSegments(text: string): SegmentInfo {
  const chars = Array.from(text);
  const unicode = chars.filter((char) => !BASIC.has(char) && !EXTENDED.has(char));
  if (unicode.length === 0) {
    const units = chars.reduce((sum, char) => sum + (EXTENDED.has(char) ? 2 : 1), 0);
    const perSegment = units <= 160 ? 160 : 153;
    return { encoding: "GSM-7", units, segments: units === 0 ? 0 : Math.ceil(units / perSegment), perSegment, unicodeChars: [] };
  }
  // UCS-2 counts UTF-16 code units (emoji take two).
  const units = text.length;
  const perSegment = units <= 70 ? 70 : 67;
  return {
    encoding: "UCS-2",
    units,
    segments: Math.ceil(units / perSegment),
    perSegment,
    unicodeChars: [...new Set(unicode)],
  };
}

const STRAIGHTEN: Record<string, string> = {
  "‘": "'",
  "’": "'",
  "‚": "'",
  "“": '"',
  "”": '"',
  "„": '"',
  "–": "-",
  "—": "-",
  "…": "...",
  " ": " ",
};

/** Replaces typographic punctuation with GSM-7 equivalents. */
export function straightenPunctuation(text: string) {
  return text.replace(/[‘’‚“”„–—… ]/g, (char) => STRAIGHTEN[char] ?? char);
}
