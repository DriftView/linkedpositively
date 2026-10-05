/**
 * A Content-Disposition value that is safe for any filename: an ASCII
 * fallback (quotes, backslashes and control characters replaced) plus the
 * RFC 5987 `filename*` form, so names like "résumé.pdf" neither break the
 * header (non-Latin-1 header values throw) nor inject parameters.
 */
export function contentDisposition(type: "inline" | "attachment", filename: string) {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f"\\]/g, "_").trim() || "file";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(cleaned).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
