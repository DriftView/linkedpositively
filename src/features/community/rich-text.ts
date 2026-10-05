import sanitizeHtml from "sanitize-html";
import { isUuid } from "@/server/db/ids";
import { HEADLINE_MAX } from "./types";
import { profileHref, tagHref } from "./links";

export { parseYouTube } from "./youtube";

/**
 * Text handling for posts and comments. Everything here is pure (no DB) so it
 * is unit-tested in rich-text.test.ts.
 *
 * Storage: the Tiptap editor's HTML, sanitized with one allow-list (mentions
 * and hashtags are `<span data-type="mention|hashtag" data-id>` nodes).
 * Output: sanitized again and enriched (mention/hashtag links, bare URLs and
 * typed #tags linked). Legacy plain-text bodies are accepted too.
 */

/**
 * Hashtag: "#" + a letter, then letters/digits/underscores (min 2 chars),
 * not preceded by a word character, "&" (entities) or "/" (URL fragments).
 * Lower-cased like the old `youthrive_tags` parser (docs/legacy/03 §5.13).
 */
const HASHTAG_RE = /(^|[^\p{L}\p{N}_&#/=])#(\p{L}[\p{L}\p{N}_]{1,49})/gu;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

const STORED_TAGS = ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "span"];

/** Sanitizes editor HTML for storage (same allow-list as sanitizeUserHtml). */
export function cleanUserHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: STORED_TAGS,
    allowedAttributes: {
      a: ["href"],
      span: ["data-type", "data-id", "data-label"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    exclusiveFilter: (frame) => frame.tag === "span" && !frame.attribs["data-type"] && !frame.text.trim(),
  }).trim();
}

export function htmlToText(html: string) {
  return sanitizeHtml(html.replace(/<\/(p|li|blockquote)>|<br\s*\/?>/gi, "$& "), {
    allowedTags: [],
    allowedAttributes: {},
  })
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractHashtags(text: string) {
  const tags = new Set<string>();
  for (const match of text.matchAll(HASHTAG_RE)) tags.add(match[2].toLowerCase());
  return [...tags];
}

/** Hashtag nodes (`data-type="hashtag"`) plus #tags typed as plain text. */
export function extractTagsFromHtml(html: string) {
  const tags = new Set(extractHashtags(htmlToText(html)));
  for (const match of html.matchAll(/data-type="hashtag"[^>]*data-id="([^"]+)"/g)) {
    const tag = match[1].toLowerCase().replace(/^#/, "");
    if (/^\p{L}[\p{L}\p{N}_]{1,49}$/u.test(tag)) tags.add(tag);
  }
  return [...tags];
}

export function extractMentionIds(html: string) {
  const ids = new Set<string>();
  for (const match of html.matchAll(/<span[^>]*data-type="mention"[^>]*>/g)) {
    const id = /data-id="([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/i.exec(match[0])?.[1]?.toLowerCase();
    if (id) ids.add(id);
  }
  return [...ids];
}

/**
 * Pulls a leading "!Headline!" out of the text (the old content-warning
 * convention, docs/legacy/03 §5.3): the headline must not start with a space.
 */
export function splitHeadline(html: string): { headline: string | null; html: string } {
  const match = /^(\s*<p>)?\s*!([^!<\s][^!<]{0,199})!\s*(<br\s*\/?>)?/i.exec(html);
  if (!match) return { headline: null, html };
  const headline = match[2].trim().slice(0, HEADLINE_MAX);
  const rest = (match[1] ?? "") + html.slice(match[0].length);
  return { headline, html: rest.replace(/^<p>\s*<\/p>/i, "") };
}

/**
 * Legacy bodies are plain text (already entity-encoded by the old site) with
 * newlines. Existing entities are kept; bare URLs are linked here because the
 * whole string is available (sanitize-html splits text runs at entities).
 */
export function plainTextToHtml(text: string) {
  const escape = (value: string) =>
    value
      .replace(/&(?!(#\d+|#x[\da-f]+|[a-z]+);)/gi, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => {
      const parts = paragraph.split(URL_RE);
      const urls = paragraph.match(URL_RE) ?? [];
      const body = parts
        .map((part, index) => escape(part) + (urls[index] ? `<a href="${escape(urls[index])}">${escape(urls[index])}</a>` : ""))
        .join("");
      return `<p>${body.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");
}

function shortUrl(url: string) {
  const text = url.replace(/^https?:\/\/(www\.)?/, "");
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

/**
 * Links bare URLs in HTML text (outside existing links), e.g. a URL typed
 * without a trailing space, which the editor doesn't auto-link.
 */
export function linkifyHtml(html: string) {
  let depth = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a\b/i.test(part)) depth++;
        else if (/^<\/a>/i.test(part)) depth = Math.max(0, depth - 1);
        return part;
      }
      if (depth > 0) return part;
      return part.replace(URL_RE, (url) => `<a href="${url}">${shortUrl(url)}</a>`);
    })
    .join("");
}

/** Links typed #tags in an (already escaped) text run. */
function linkifyText(escaped: string) {
  return escaped.replace(
    HASHTAG_RE,
    (_all, lead: string, tag: string) => `${lead}<a href="${tagHref(tag.toLowerCase())}" class="rt-tag">#${tag}</a>`,
  );
}

/** Safe, enriched HTML for display. */
export function renderUserHtml(stored: string, usernames?: (id: string) => string | undefined) {
  const source = /<(p|br|a|span|b|strong|em|i|u|s|ul|ol|li|blockquote|div)\b/i.test(stored)
    ? linkifyHtml(stored)
    : plainTextToHtml(stored);
  const insideLink: boolean[] = [];
  return sanitizeHtml(source, {
    allowedTags: STORED_TAGS,
    allowedAttributes: { a: ["href", "class", "target", "rel", "data-user"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      span: (tagName, attribs): sanitizeHtml.Tag => {
        const type = attribs["data-type"];
        const id = attribs["data-id"] ?? "";
        if (type === "mention" && isUuid(id)) {
          return { tagName: "a", attribs: { href: profileHref({ id, username: usernames?.(id) }), class: "rt-mention", "data-user": id } };
        }
        if (type === "hashtag" && id) {
          return { tagName: "a", attribs: { href: tagHref(id.replace(/^#/, "").toLowerCase()), class: "rt-tag" } };
        }
        return { tagName: "span", attribs: {} };
      },
      a: (tagName, attribs): sanitizeHtml.Tag => {
        if (attribs.class?.startsWith("rt-")) return { tagName, attribs };
        const href = attribs.href ?? "";
        const internal = href.startsWith("/");
        return {
          tagName: "a",
          attribs: internal
            ? { href, class: "rt-link" }
            : { href, class: "rt-link", target: "_blank", rel: "noopener noreferrer nofollow" },
        };
      },
    },
    onOpenTag: (name, attribs) => {
      if (name === "a" || name === "span") {
        insideLink.push(name === "a" || attribs["data-type"] === "mention" || attribs["data-type"] === "hashtag");
      }
    },
    onCloseTag: (name) => {
      if (name === "a" || name === "span") insideLink.pop();
    },
    textFilter: (text, tagName) => (tagName === "a" || insideLink.includes(true) ? text : linkifyText(text)),
  });
}

/** Everything an action needs from submitted editor HTML. */
export function prepareUserHtml(input: string, { allowHeadline = false } = {}) {
  let html = cleanUserHtml(input);
  let headline: string | null = null;
  if (allowHeadline) ({ headline, html } = splitHeadline(html));
  const text = htmlToText(html);
  return {
    html: text || /data-type="(mention|hashtag)"/.test(html) ? html : "",
    text,
    headline,
    tags: extractTagsFromHtml(html),
    mentionIds: extractMentionIds(html),
  };
}

/** "Sam's post" → excerpt for notifications and search (plain text). */
export function excerptText(text: string, length = 140) {
  const plain = text.replace(/\s+/g, " ").trim();
  return plain.length > length ? `${plain.slice(0, length).trimEnd()}…` : plain;
}
