import { describe, expect, it } from "vitest";
import { phpCsv, phpCsvField } from "./csv";

describe("phpCsv", () => {
  it("encloses fields like fputcsv", () => {
    expect(phpCsvField("Name")).toBe("Name");
    expect(phpCsvField("eCoach Account Created")).toBe('"eCoach Account Created"');
    expect(phpCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(phpCsvField("a,b")).toBe('"a,b"');
    expect(phpCsvField("")).toBe("");
    expect(phpCsvField(null)).toBe("");
  });
  it("neutralises spreadsheet formulas in text", () => {
    expect(phpCsvField('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(phpCsvField("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(phpCsvField("+1")).toBe("'+1");
    expect(phpCsvField(-3)).toBe("-3");
  });
  it("joins rows with newlines", () => {
    expect(phpCsv([["Name", "Last Activity"], ["sam", "2026-01-01 10:00:00 EST"]])).toBe(
      'Name,"Last Activity"\nsam,"2026-01-01 10:00:00 EST"\n',
    );
  });
});
