import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Signed short links for program texts: /r/<code>, where the code is the
 * SmsSend id (a 16-byte UUID) plus an 8-byte HMAC, base64url — 32 characters.
 * The link identifies the message (and so the participant and week) without
 * trusting anything the visitor could edit. Replaces TinyURL + `?sms=uid:week`.
 */

const ID_BYTES = 16;
const SIG_BYTES = 8;

function signature(id: Buffer) {
  return createHmac("sha256", `${env.BETTER_AUTH_SECRET}:sms-link`).update(id).digest().subarray(0, SIG_BYTES);
}

export function linkCode(sendId: string) {
  const id = Buffer.from(sendId.replace(/-/g, ""), "hex");
  if (id.length !== ID_BYTES) throw new Error("invalid send id");
  return Buffer.concat([id, signature(id)]).toString("base64url");
}

/** Returns the SmsSend id, or null when the code is malformed or forged. */
export function verifyLinkCode(code: string): string | null {
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(code)) return null;
  const raw = Buffer.from(code, "base64url");
  if (raw.length !== ID_BYTES + SIG_BYTES) return null;
  const id = raw.subarray(0, ID_BYTES);
  const given = raw.subarray(ID_BYTES);
  if (!timingSafeEqual(given, signature(id))) return null;
  const hex = id.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function appUrl(path = "/") {
  return new URL(path, env.NEXT_PUBLIC_APP_URL).toString();
}

export function shortUrl(sendId: string) {
  return appUrl(`/r/${linkCode(sendId)}`);
}

export { safeInternalPath } from "@/lib/safe-path";
