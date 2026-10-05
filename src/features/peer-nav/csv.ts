/**
 * CSV written the way PHP's `fputcsv` did for the legacy reports: comma
 * separated, `"` enclosure, and a field is enclosed when it contains a comma,
 * quote, backslash, space, tab or newline. Lines end with "\n".
 * Text a spreadsheet would run as a formula (names and browser strings are
 * user-controlled) gets a leading apostrophe.
 */
export function phpCsvField(value: string | number | null | undefined) {
  let text = value === null || value === undefined ? "" : String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[,"\\\s]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function phpCsv(rows: (string | number | null | undefined)[][]) {
  return rows.map((row) => row.map(phpCsvField).join(",")).join("\n") + "\n";
}

export function csvResponse(body: string, filename: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=UTF-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
