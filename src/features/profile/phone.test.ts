import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone } from "./phone";

describe("normalizePhone", () => {
  it("normalises US numbers to E.164", () => {
    expect(normalizePhone("(555) 234-5678")).toBe("+15552345678");
    expect(normalizePhone("555.234.5678")).toBe("+15552345678");
    expect(normalizePhone("1 555 234 5678")).toBe("+15552345678");
    expect(normalizePhone("+1 555 234 5678")).toBe("+15552345678");
  });

  it("accepts international numbers with a plus", () => {
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects junk", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("055 234 5678")).toBeNull();
    expect(normalizePhone("call me")).toBeNull();
    expect(normalizePhone("+0 123 456 789")).toBeNull();
  });

  it("formats US numbers for display", () => {
    expect(formatPhone("+15552345678")).toBe("(555) 234-5678");
    expect(formatPhone("+442079460958")).toBe("+442079460958");
  });
});
