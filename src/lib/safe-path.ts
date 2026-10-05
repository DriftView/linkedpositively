/**
 * Only in-app paths may be redirect or link targets (no open redirects).
 *
 * Browsers and the WHATWG URL parser drop tabs/newlines and treat "\" as "/",
 * so "/\t/evil.com" or "/\\evil.com" would become "//evil.com". The value is
 * therefore resolved against a dummy origin and rejected unless it stays there.
 */
export function safeInternalPath(path: string | null | undefined, fallback = "/") {
  if (!path || !path.startsWith("/")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return fallback;
  try {
    const base = "http://internal.invalid";
    const url = new URL(path, base);
    if (url.origin !== base) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
