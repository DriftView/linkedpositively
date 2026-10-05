import { describe, expect, it } from "vitest";
import { contentDisposition } from "./content-disposition";

describe("contentDisposition", () => {
  it("keeps plain names", () => {
    expect(contentDisposition("attachment", "notes.pdf")).toBe(`attachment; filename="notes.pdf"; filename*=UTF-8''notes.pdf`);
  });

  it("encodes non-ASCII names so the header stays valid", () => {
    const value = contentDisposition("inline", "résumé 😀.pdf");
    expect(value).toBe(`inline; filename="r_sum_ __.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%F0%9F%98%80.pdf`);
    expect(() => new Headers({ "Content-Disposition": value })).not.toThrow();
  });

  it("can't break out of the parameter", () => {
    const value = contentDisposition("attachment", 'a".html\r\nSet-Cookie: x=1');
    expect(value).not.toMatch(/[\r\n]/);
    expect(value.startsWith(`attachment; filename="a_.html__Set-Cookie: x=1";`)).toBe(true);
  });

  it("falls back to a generic name", () => {
    expect(contentDisposition("attachment", "  ")).toContain(`filename="file"`);
  });
});
