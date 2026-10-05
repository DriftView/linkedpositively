/**
 * Phone numbers are stored in E.164 (+15551234567).
 *
 * Legacy rule (twm_general_field_attach_presave): strip non-digits; exactly
 * 10 digits → "+1" + digits; more than 10 → "+" + digits; fewer were kept as
 * typed (and could never receive texts). Fewer than 10 digits is now invalid.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "+15551234567" → "+1 (555) 123-4567"; other countries are grouped loosely. */
export function formatPhone(e164: string | null | undefined) {
  if (!e164) return "";
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  if (match) return `+1 (${match[1]}) ${match[2]}-${match[3]}`;
  return e164;
}

/** "+1 (•••) •••-4567" for places where the full number isn't needed. */
export function maskPhone(e164: string | null | undefined) {
  if (!e164) return "";
  return `•••• ${e164.slice(-4)}`;
}
