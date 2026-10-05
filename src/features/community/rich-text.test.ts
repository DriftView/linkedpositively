import { describe, expect, it } from "vitest";
import {
  extractHashtags,
  extractMentionIds,
  extractTagsFromHtml,
  parseYouTube,
  prepareUserHtml,
  renderUserHtml,
  splitHeadline,
} from "./rich-text";

const ID = "0b7f0c2a-1b2c-4d4e-85f6-07180a1b2c3d";

describe("hashtags", () => {
  it("finds lower-cased tags that start with a letter", () => {
    expect(extractHashtags("Feeling #Strong today #2fast #ok_then #a")).toEqual(["strong", "ok_then"]);
  });
  it("ignores URL fragments and entities", () => {
    expect(extractHashtags("see https://x.com/page#section and &#39;quote")).toEqual([]);
  });
  it("dedupes and reads hashtag nodes", () => {
    const html = `<p>#Self_Care and <span data-type="hashtag" data-id="selfcare">#selfcare</span> #self_care</p>`;
    expect(extractTagsFromHtml(html).sort()).toEqual(["self_care", "selfcare"]);
  });
});

describe("mentions", () => {
  it("reads mention ids", () => {
    const html = `<p>hi <span data-type="mention" data-id="${ID}" data-label="Sam">@Sam</span> and <span data-type="mention" data-id="nope">@x</span></p>`;
    expect(extractMentionIds(html)).toEqual([ID]);
  });
});

describe("headline", () => {
  it("splits a leading !Headline!", () => {
    expect(splitHeadline("<p>!Trigger warning! the rest</p>")).toEqual({ headline: "Trigger warning", html: "<p>the rest</p>" });
  });
  it("needs a non-space start", () => {
    expect(splitHeadline("<p>! not a headline!</p>").headline).toBeNull();
  });
  it("drops an emptied first paragraph", () => {
    expect(splitHeadline("<p>!CW!</p><p>body</p>")).toEqual({ headline: "CW", html: "<p>body</p>" });
  });
});

describe("prepareUserHtml", () => {
  it("strips scripts and attributes", () => {
    const out = prepareUserHtml(`<p onclick="x">Hello <script>alert(1)</script><img src=x onerror=y> <b>you</b></p>`);
    expect(out.html).toBe("<p>Hello  <b>you</b></p>");
    expect(out.text).toBe("Hello you");
  });
  it("treats empty paragraphs as empty", () => {
    expect(prepareUserHtml("<p></p><p> </p>").html).toBe("");
  });
});

describe("renderUserHtml", () => {
  it("links mentions, hashtag nodes, typed tags and URLs", () => {
    const html = renderUserHtml(
      `<p><span data-type="mention" data-id="${ID}" data-label="Sam">@Sam</span> loves #Tea at <a href="https://example.com/a?b=1&amp;c=2">example</a>.</p>`,
    );
    expect(html).toContain(`<a href="/people/${ID}" class="rt-mention" data-user="${ID}">@Sam</a>`);
    expect(renderUserHtml(`<p><span data-type="mention" data-id="${ID}">@Sam</span></p>`, () => "sam")).toContain(`href="/people/sam"`);
    expect(html).toContain(`<a href="/search?tag=tea" class="rt-tag">#Tea</a>`);
    expect(html).toContain(`href="https://example.com/a?b=1&amp;c=2"`);
    expect(html).toContain(`target="_blank"`);
  });
  it("does not double-link inside anchors", () => {
    const html = renderUserHtml(`<p><a href="https://x.org">#nope https://x.org</a></p>`);
    expect(html.match(/<a /g)?.length).toBe(1);
  });
  it("renders legacy plain text safely", () => {
    expect(renderUserHtml("Hi &#039;you&#039; <there>\nsee https://a.org/x?y=1&z=2")).toBe(
      `<p>Hi 'you' &lt;there&gt;<br />see <a href="https://a.org/x?y=1&amp;z=2" class="rt-link" target="_blank" rel="noopener noreferrer nofollow">https://a.org/x?y=1&amp;z=2</a></p>`,
    );
  });
});

describe("parseYouTube", () => {
  it.each([
    ["https://www.youtube.com/watch?v=vw-G-adwRNU", { id: "vw-G-adwRNU" }],
    ["youtu.be/vw-G-adwRNU?t=90", { id: "vw-G-adwRNU", start: 90 }],
    ["https://m.youtube.com/watch?v=vw-G-adwRNU&t=1m5s", { id: "vw-G-adwRNU", start: 65 }],
    ["https://www.youtube.com/embed/vw-G-adwRNU", { id: "vw-G-adwRNU" }],
    ["https://youtube.com/shorts/vw-G-adwRNU", { id: "vw-G-adwRNU" }],
  ])("parses %s", (input, expected) => {
    expect(parseYouTube(input)).toEqual(expected);
  });
  it.each(["https://vimeo.com/123", "not a url", "https://youtube.com/watch?v=short"])("rejects %s", (input) => {
    expect(parseYouTube(input)).toBeNull();
  });
});

describe("bare URLs in editor HTML", () => {
  it("links them outside existing anchors", () => {
    const html = renderUserHtml(`<p>Walk https://example.org/a/b?x=1&amp;y=2 and <a href="https://x.org">https://x.org</a></p>`);
    expect(html).toContain(`<a href="https://example.org/a/b?x=1&amp;y=2" class="rt-link" target="_blank" rel="noopener noreferrer nofollow">example.org/a/b?x=1&amp;y=2</a>`);
    expect(html.match(/<a /g)?.length).toBe(2);
  });
});
