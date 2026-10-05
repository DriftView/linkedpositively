import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Verifies passwords hashed by Drupal 7 (includes/password.inc), so migrated
 * users can sign in with their existing password. After a successful sign-in
 * the hash is replaced with a modern one (see auth.ts).
 *
 * Formats:
 *   $S$…  SHA-512, Drupal 7 native
 *   $H$…  / $P$…  MD5 phpass (accounts carried over from Drupal 6 / phpBB)
 *   U$S$… Drupal 6 plain MD5 that Drupal 7 re-hashed without the password:
 *         the input is md5(password) instead of password.
 */

const ITOA64 = "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const HASH_LENGTH = 55;
const MIN_LOG2 = 7;
const MAX_LOG2 = 30;

export function isDrupalHash(hash: string) {
  return /^(U?\$S\$|\$H\$|\$P\$)/.test(hash);
}

/** Drupal's _password_base64_encode (not standard base64). */
function base64Encode(input: Buffer, count: number) {
  let output = "";
  let i = 0;
  do {
    let value = input[i++];
    output += ITOA64[value & 0x3f];
    if (i < count) value |= input[i] << 8;
    output += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= input[i] << 16;
    output += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    output += ITOA64[(value >> 18) & 0x3f];
  } while (i < count);
  return output;
}

function crypt(algo: "sha512" | "md5", password: string, setting: string) {
  const prefix = setting.slice(0, 12);
  if (prefix[0] !== "$" || prefix[2] !== "$") return null;
  const log2 = ITOA64.indexOf(prefix[3]);
  if (log2 < MIN_LOG2 || log2 > MAX_LOG2) return null;
  const salt = prefix.slice(4, 12);
  if (salt.length !== 8) return null;

  const pass = Buffer.from(password, "utf8");
  let hash = createHash(algo).update(Buffer.concat([Buffer.from(salt, "utf8"), pass])).digest();
  for (let count = 1 << log2; count > 0; count--) {
    hash = createHash(algo).update(Buffer.concat([hash, pass])).digest();
  }
  const output = prefix + base64Encode(hash, hash.length);
  return output.slice(0, HASH_LENGTH);
}

export function verifyDrupalPassword(password: string, storedHash: string) {
  let hash = storedHash;
  let input = password;
  if (hash.startsWith("U$")) {
    hash = hash.slice(1);
    input = createHash("md5").update(password, "utf8").digest("hex");
  }

  let computed: string | null = null;
  if (hash.startsWith("$S$")) computed = crypt("sha512", input, hash);
  else if (hash.startsWith("$H$") || hash.startsWith("$P$")) computed = crypt("md5", input, hash);
  if (!computed || computed.length !== hash.length) return false;

  return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
}

/** Test helper: builds a Drupal 7 $S$ hash the same way Drupal does. */
export function hashDrupalPasswordForTest(password: string, salt = "abcdefgh", log2 = 15) {
  return crypt("sha512", password, "$S$" + ITOA64[log2] + salt)!;
}
