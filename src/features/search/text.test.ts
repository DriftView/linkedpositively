import { describe, expect, it } from "vitest";
import { containsPattern, highlight, searchWords } from "./text";

describe("searchWords", () => {
  it("lower-cases, strips #/@ and drops one-letter words", () => {
    expect(searchWords("  Self #Care a @Sam 5 ")).toEqual(["self", "care", "sam", "5"]);
  });
  it("dedupes and caps", () => {
    expect(searchWords("x yy yy zz")).toEqual(["yy", "zz"]);
  });
});

describe("highlight", () => {
  it("marks every hit case-insensitively", () => {
    expect(highlight("Tea time is Tea", ["tea"])).toEqual([
      { text: "Tea", hit: true },
      { text: " time is ", hit: false },
      { text: "Tea", hit: true },
    ]);
  });
  it("centres long text on the first match with ellipses", () => {
    const text = `${"word ".repeat(80)}needle ${"tail ".repeat(80)}`;
    const segments = highlight(text, ["needle"], 60);
    const joined = segments.map((segment) => segment.text).join("");
    expect(joined.startsWith("…")).toBe(true);
    expect(joined.endsWith("…")).toBe(true);
    expect(segments.some((segment) => segment.hit && segment.text === "needle")).toBe(true);
  });
  it("never produces HTML", () => {
    expect(highlight("<b>hi</b>", ["hi"]).map((segment) => segment.text).join("")).toBe("<b>hi</b>");
  });
});

describe("containsPattern", () => {
  it("escapes LIKE wildcards", () => {
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
