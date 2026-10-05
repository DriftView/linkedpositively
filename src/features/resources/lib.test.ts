import { describe, expect, it } from "vitest";
import { parseResourceCsv, toCsv } from "./csv";
import {
  escapeLike,
  emailHref,
  formatMiles,
  haversineMiles,
  parseNear,
  parseZip,
  phoneHref,
  slugify,
  splitTags,
  websiteHref,
} from "./lib";

describe("haversineMiles", () => {
  it("measures Boston → New York at about 190 miles", () => {
    const miles = haversineMiles({ lat: 42.3601, lng: -71.0589 }, { lat: 40.7128, lng: -74.006 });
    expect(miles).toBeGreaterThan(185);
    expect(miles).toBeLessThan(195);
  });
  it("is zero for the same point", () => {
    expect(haversineMiles({ lat: 10, lng: 10 }, { lat: 10, lng: 10 })).toBe(0);
  });
});

describe("distance formatting sorts numerically (the old site sorted strings)", () => {
  it("formats", () => {
    expect(formatMiles(0.05)).toBe("Nearby");
    expect(formatMiles(9.14)).toBe("9.1 mi");
    expect(formatMiles(10.2)).toBe("10 mi");
  });
});

describe("parsers", () => {
  it("parses coordinates and rounds them", () => {
    expect(parseNear("42.36012,-71.05891")).toEqual({ lat: 42.36, lng: -71.059 });
    expect(parseNear("91,0")).toBeNull();
    expect(parseNear("1; DROP TABLE")).toBeNull();
  });
  it("parses ZIP codes", () => {
    expect(parseZip("02118")).toBe("02118");
    expect(parseZip("02118-1234")).toBe("02118");
    expect(parseZip("Boston")).toBeNull();
  });
  it("finds phone numbers and emails in contact text", () => {
    expect(phoneHref("Call (617) 555-0142 ext 2")?.href).toBe("tel:+16175550142");
    expect(phoneHref("no phone")).toBeNull();
    expect(emailHref("intake@example.org or call")?.href).toBe("mailto:intake@example.org");
  });
  it("only allows http(s) websites", () => {
    expect(websiteHref("example.org")).toBe("https://example.org/");
    expect(websiteHref("javascript:alert(1)")).toBeNull();
    expect(websiteHref("localhost")).toBeNull();
  });
  it("slugifies", () => {
    expect(slugify("LGBTQ+ Services & Care")).toBe("lgbtq-plus-services-and-care");
  });
});

describe("splitTags", () => {
  it("drops list joiners, punctuation and duplicates", () => {
    expect(splitTags("HIV testing, PrEP, and laboratory services.; hiv testing")).toEqual([
      "HIV testing",
      "PrEP",
      "laboratory services",
    ]);
  });
});

describe("parseResourceCsv", () => {
  const header = "Serial No,Organization,Street Address,State,City,Zip,Website,Contact Info,Other tags,Mystery";
  it("maps legacy Feeds columns and validates rows", () => {
    const csv = [
      header,
      "1,Harbor Health,1 Main St,MA,Boston,02118,harbor.example.org,(617) 555-0100,HIV testing; PrEP,x",
      "2,,2 Main St,MA,Boston,0211,,,,",
      "1,Duplicate,3 Main St,MA,Boston,02118,,,,",
    ].join("\n");
    const result = parseResourceCsv(csv);
    expect(result.fatal).toBeNull();
    expect(result.unknownHeaders).toEqual(["Mystery"]);
    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]).toMatchObject({ title: "Harbor Health", website: "https://harbor.example.org/", tags: ["HIV testing", "PrEP"], errors: [] });
    expect(result.rows[1].errors).toContain("Organization is empty");
    expect(result.rows[1].warnings.some((warning) => warning.includes("ZIP"))).toBe(true);
    expect(result.rows[2].errors[0]).toMatch(/also used on line 2/);
  });
  it("needs an Organization column", () => {
    expect(parseResourceCsv("Name2,City\nx,y").fatal).toMatch(/Organization/);
  });
});

describe("toCsv", () => {
  it("quotes and neutralises formulas", () => {
    expect(toCsv([["a,b", "=SUM(A1)", 'say "hi"']])).toBe('"a,b",\'=SUM(A1),"say ""hi"""');
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("100% free_care")).toBe(String.raw`100\% free\_care`);
    expect(escapeLike(String.raw`a\b`)).toBe(String.raw`a\\b`);
  });
});
