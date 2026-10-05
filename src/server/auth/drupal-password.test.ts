import { describe, expect, it } from "vitest";
import { hashDrupalPasswordForTest, isDrupalHash, verifyDrupalPassword } from "./drupal-password";

// Fixtures produced by Drupal 7's own includes/password.inc for made-up passwords.
const S_HASH = "$S$Dd9jqr3nuObE3YK8hkWo5PrJzHmke9AgnvNwfzLuAMRujUHgq/qS"; // "Correct horse 9!"
const U_HASH = "U$S$DK72li48zGEhoy.q7cBq2gSWBOfEoJFkrkPToodhOfFPujdufU4a"; // "legacy-pass"
const P_HASH = "$P$B12345678/v.WkiMrOGqQD6EyLkPZx1"; // "phpass-pw"

describe("verifyDrupalPassword", () => {
  it("accepts the right password for a Drupal 7 hash", () => {
    expect(verifyDrupalPassword("Correct horse 9!", S_HASH)).toBe(true);
  });

  it("rejects a wrong password", () => {
    expect(verifyDrupalPassword("correct horse 9!", S_HASH)).toBe(false);
    expect(verifyDrupalPassword("", S_HASH)).toBe(false);
  });

  it("handles hashes upgraded from Drupal 6 MD5", () => {
    expect(verifyDrupalPassword("legacy-pass", U_HASH)).toBe(true);
    expect(verifyDrupalPassword("legacy-pas", U_HASH)).toBe(false);
  });

  it("handles phpass MD5 hashes", () => {
    expect(verifyDrupalPassword("phpass-pw", P_HASH)).toBe(true);
    expect(verifyDrupalPassword("phpass-px", P_HASH)).toBe(false);
  });

  it("rejects malformed hashes instead of throwing", () => {
    expect(verifyDrupalPassword("x", "$S$")).toBe(false);
    expect(verifyDrupalPassword("x", "$S$~abcdefgh")).toBe(false);
  });

  it("round-trips its own test hashes", () => {
    expect(verifyDrupalPassword("pw", hashDrupalPasswordForTest("pw"))).toBe(true);
  });

  it("recognises Drupal hash prefixes only", () => {
    expect(isDrupalHash(S_HASH)).toBe(true);
    expect(isDrupalHash(U_HASH)).toBe(true);
    expect(isDrupalHash(P_HASH)).toBe(true);
    expect(isDrupalHash("a1b2:c3d4")).toBe(false);
  });
});
