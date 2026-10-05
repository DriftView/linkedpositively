import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safe-path";

describe("safeInternalPath", () => {
  it("keeps in-app paths with query and hash", () => {
    expect(safeInternalPath("/tips?x=1#top")).toBe("/tips?x=1#top");
    expect(safeInternalPath("/coach/abc/messages")).toBe("/coach/abc/messages");
  });

  it("falls back for empty or relative values", () => {
    expect(safeInternalPath(null)).toBe("/");
    expect(safeInternalPath("")).toBe("/");
    expect(safeInternalPath("tips", "/home")).toBe("/home");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeInternalPath("https://evil.example")).toBe("/");
    expect(safeInternalPath("//evil.example")).toBe("/");
    expect(safeInternalPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects tricks browsers normalise into another origin", () => {
    expect(safeInternalPath("/\\evil.example")).toBe("/");
    expect(safeInternalPath("/\t/evil.example")).toBe("/");
    expect(safeInternalPath("/\n/evil.example")).toBe("/");
    expect(safeInternalPath("/%09/evil.example")).toBe("/%09/evil.example");
  });
});
