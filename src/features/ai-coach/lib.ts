/**
 * Small pure helpers for the AI Coach (client-safe, unit-tested in lib.test.ts).
 */

/**
 * Conversational words that Postgres' English stop list keeps but that match
 * almost everything ("I want to know…", "can you tell me…").
 */
const FILLER_WORDS = new Set(
  "want wants wanna need needs know get got getting feel feeling like really just dont doesnt didnt cant wont im ive youre anymore please tell help thanks thank hi hello hey okay ok yeah also much many thing things something anything someone anyone way good bad lot kind sure think maybe still even ever never always every go going make".split(
    " ",
  ),
);

/**
 * A `websearch_to_tsquery` string that matches ANY of the words in `text`
 * ("prep side effects" → "prep or side or effects"), so a question finds
 * content that answers part of it; ranking puts the best matches first.
 * Null when there is nothing to search for.
 */
export function anyWordQuery(text: string, maxWords = 12) {
  const words = (
    text
      .toLowerCase()
      .replace(/['’]/g, "")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  ).filter((word) => word.length > 1 && word !== "or" && !FILLER_WORDS.has(word));
  const unique = [...new Set(words)].slice(0, maxWords);
  return unique.length ? unique.join(" or ") : null;
}

/** Cuts `text` to about `max` characters on a sentence or word boundary. */
export function clip(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const sentence = cut.lastIndexOf(". ");
  if (sentence > max * 0.6) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 0 ? space : max).trimEnd()}…`;
}

export type MarkdownBlock = { type: "paragraph"; spans: Span[] } | { type: "list"; ordered: boolean; items: Span[][] };
export type Span = { text: string; bold: boolean };

function spans(line: string): Span[] {
  const out: Span[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    if (match.index > last) out.push({ text: line.slice(last, match.index), bold: false });
    out.push({ text: match[1], bold: true });
    last = match.index + match[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out;
}

/**
 * The tiny subset of Markdown the coach is asked to use (paragraphs, bold,
 * bullet and numbered lists) parsed into blocks, so replies render as React
 * elements: never as HTML.
 */
export function parseCoachMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Span[][] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", spans: spans(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: "list", ...list });
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(spans((bullet ?? numbered)![1].replace(/^#+\s*/, "")));
    } else if (!line) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line.replace(/^#+\s*/, ""));
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
