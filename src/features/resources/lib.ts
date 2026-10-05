/**
 * Pure helpers for the resource locator (safe on client and server).
 */

export const EARTH_RADIUS_MILES = 3958.8;
export const METERS_PER_MILE = 1609.344;
export const RADIUS_OPTIONS = [5, 10, 25, 50, 100] as const;
export const DEFAULT_RADIUS = 25;
export const PAGE_SIZE = 20;

/** US states offered on the suggest form (the old form offered five; any state is fine). */
export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA",
  "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR",
  "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "PR",
] as const;

export type LatLng = { lat: number; lng: number };

/** Great-circle distance in miles (the old SQL used the same formula, unparameterized). */
export function haversineMiles(a: LatLng, b: LatLng) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLatLng(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** "42.35,-71.06" → coordinates, rounded to ~100 m (we never need more precision). */
export function parseNear(value: string | null | undefined): LatLng | null {
  if (!value) return null;
  const match = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!isValidLatLng(lat, lng)) return null;
  return { lat: roundCoord(lat), lng: roundCoord(lng) };
}

export function roundCoord(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function formatNear({ lat, lng }: LatLng) {
  return `${roundCoord(lat)},${roundCoord(lng)}`;
}

/** A 5-digit (or ZIP+4) US ZIP code, normalized to 5 digits. */
export function parseZip(value: string | null | undefined) {
  const match = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(value ?? "");
  return match ? match[1] : null;
}

export function formatMiles(miles: number) {
  if (miles < 0.1) return "Nearby";
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

export function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Splits a tag cell ("HIV testing; PrEP, and laboratory services.") into
 * clean tag names. The old importer split on commas only and kept fragments
 * like "and laboratory services" as tags; here list joiners and trailing
 * punctuation are stripped and duplicates removed (case-insensitive).
 */
export function splitTags(value: string | null | undefined) {
  if (!value) return [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const raw of value.split(/[;,|\n]+/)) {
    const name = raw
      .replace(/^\s*(?:and|&|or)\s+/i, "")
      .replace(/[.\s]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length < 2 || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(name);
  }
  return tags;
}

/** First phone number in a free-text contact field, as a tel: href. */
export function phoneHref(contact: string | null | undefined) {
  if (!contact) return null;
  const match = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.exec(contact);
  if (!match) return null;
  const digits = match[0].replace(/[^\d+]/g, "");
  return { href: `tel:${digits.startsWith("+") ? digits : `+1${digits.replace(/^1(?=\d{10}$)/, "")}`}`, label: match[0].trim() };
}

/** First email address in a free-text contact field. */
export function emailHref(contact: string | null | undefined) {
  const match = /[\w.+-]+@[\w-]+\.[\w.-]+/.exec(contact ?? "");
  return match ? { href: `mailto:${match[0]}`, label: match[0] } : null;
}

/** A safe http(s) URL for a website field, or null. Adds https:// to bare domains. */
export function websiteHref(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function websiteLabel(href: string) {
  try {
    return new URL(href).hostname.replace(/^www\./, "");
  } catch {
    return href;
  }
}

/** Google Maps search link (no API key needed). */
export function mapsHref(parts: { title?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  const query = [parts.title, parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function directionsHref(parts: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  const query = [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

export function cityLine(parts: { city?: string | null; state?: string | null; zip?: string | null }) {
  const cityState = [parts.city, parts.state].filter(Boolean).join(", ");
  return [cityState, parts.zip].filter(Boolean).join(" ");
}

export function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Escapes `%`, `_` and `\` for a SQL LIKE/ILIKE pattern (the default escape character is `\`). */
export function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}
