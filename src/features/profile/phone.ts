/**
 * Phone numbers for SMS are stored in E.164 ("+15551234567"). The old site
 * normalised US numbers to +1XXXXXXXXXX on save; this does the same and also
 * accepts international numbers typed with a leading "+".
 */
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (/[^\d\s().+-]/.test(trimmed)) return null;
  if (hasPlus) return /^[1-9]\d{7,14}$/.test(digits) ? `+${digits}` : null;
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && /^1[2-9]/.test(digits)) return `+${digits}`;
  return null;
}

/** "+15551234567" → "(555) 123-4567"; other countries are shown as stored. */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const us = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return us ? `(${us[1]}) ${us[2]}-${us[3]}` : e164;
}
