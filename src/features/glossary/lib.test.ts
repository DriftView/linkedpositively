import { describe, expect, it } from "vitest";
import { termLetter, termSlug } from "./lib";

describe("glossary helpers", () => {
  it("files terms under their first letter", () => {
    expect(termLetter("ADA")).toBe("A");
    expect(termLetter("émigré")).toBe("E");
    expect(termLetter("988 Lifeline")).toBe("#");
  });
  it("makes stable anchors", () => {
    expect(termSlug("AMAB/AFAB/ASAB")).toBe("amab-afab-asab");
    expect(termSlug("U=U")).toBe("u-equals-u");
    expect(termSlug("LGBTQ+")).toBe("lgbtq-plus");
  });
});
