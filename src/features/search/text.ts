/**
 * Search text helpers (pure, unit-tested). Words are matched as
 * case-insensitive substrings; every word must match.
 */

export type Segment = { text: string; hit: boolean };

export function searchWords(q: string) {
  return [
    ...new Set(
      q
        .toLowerCase()
        .split(/\s+/)
        .map((word) => word.replace(/^[#@]/, "").trim())
        .filter((word) => word.length >= 2 || /\d/.test(word)),
    ),
  ].slice(0, 8);
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function wordsRegex(word: string) {
  return new RegExp(escapeRegex(word), "i");
}

/** SQL (I)LIKE pattern matching `word` anywhere (`%`, `_` and `\` escaped). */
export function containsPattern(word: string) {
  return `%${word.replace(/[\\%_]/g, "\\$&")}%`;
}

/**
 * An excerpt around the first match (about `length` chars) split into
 * segments, so the UI can <mark> hits without injecting HTML.
 */
export function highlight(text: string, words: string[], length = 180): Segment[] {
  const plain = text.replace(/\s+/g, " ").trim();
  if (!plain) return [];
  const lower = plain.toLowerCase();
  const first = words.reduce((min, word) => {
    const index = lower.indexOf(word);
    return index >= 0 && index < min ? index : min;
  }, Number.POSITIVE_INFINITY);
  let start = Number.isFinite(first) ? Math.max(0, first - Math.floor(length / 3)) : 0;
  if (start > 0) {
    const space = plain.indexOf(" ", start);
    start = space >= 0 && space < first ? space + 1 : start;
  }
  let end = Math.min(plain.length, start + length);
  if (end < plain.length) {
    const space = plain.lastIndexOf(" ", end);
    end = space > start ? space : end;
  }
  const slice = `${start > 0 ? "…" : ""}${plain.slice(start, end)}${end < plain.length ? "…" : ""}`;
  if (!words.length) return [{ text: slice, hit: false }];
  const pattern = new RegExp(`(${words.map(escapeRegex).join("|")})`, "gi");
  return slice
    .split(pattern)
    .filter(Boolean)
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}
