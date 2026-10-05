import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * HTML allowed in staff-authored content (tips, pages, glossary, prompts).
 * Embeds are limited to YouTube/Vimeo players.
 */
export function sanitizeStaffHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote",
      "h2", "h3", "h4", "hr", "img", "figure", "figcaption", "span", "div", "iframe", "table",
      "thead", "tbody", "tr", "th", "td", "code", "pre", "sup", "sub",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      iframe: ["src", "width", "height", "allow", "allowfullscreen", "title"],
      span: ["class"],
      div: ["class"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"],
    allowedSchemes: ["http", "https", "mailto", "tel"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer" }),
    },
  });
}

/**
 * HTML allowed in participant posts and comments (Tiptap output): basic
 * formatting and links only. No images or embeds (those are separate fields).
 */
export function sanitizeUserHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li", "blockquote", "span"],
    allowedAttributes: {
      a: ["href", "rel", "target"],
      span: ["data-type", "data-id", "data-label", "class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }),
    },
  });
}

/** Plain text (for excerpts, search indexing and SMS). */
export function toPlainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, " ").trim();
}
