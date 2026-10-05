import "server-only";
import { and, eq, ilike, sql, type SQL } from "drizzle-orm";
import { env } from "@/env";
import { db } from "@/server/db/client";
import { resources } from "@/server/db/schema";
import { logger } from "@/server/logger";
import { escapeLike, isValidLatLng, parseZip, type LatLng } from "./lib";

/**
 * Geocoding for the resource locator. Uses the Google Geocoding API when
 * GOOGLE_MAPS_API_KEY is set (the old module hard-coded a key; never do that).
 * Without a key, searches fall back to the coordinates of resources already
 * in the same ZIP/city, then to plain text matching.
 */

const cache = new Map<string, { at: number; value: (LatLng & { label: string }) | null }>();
const CACHE_TTL = 1000 * 60 * 60 * 12;

export function geocodingEnabled() {
  return Boolean(env.GOOGLE_MAPS_API_KEY);
}

type GoogleResult = {
  status: string;
  results: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
};

async function callGoogle(params: Record<string, string>) {
  const key = env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  url.searchParams.set("key", key);
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (!response.ok) {
      logger.warn({ status: response.status }, "geocoding http error");
      return null;
    }
    const body = (await response.json()) as GoogleResult;
    if (body.status !== "OK" || !body.results[0]) {
      if (body.status !== "ZERO_RESULTS") logger.warn({ status: body.status }, "geocoding failed");
      return null;
    }
    const { lat, lng } = body.results[0].geometry.location;
    return isValidLatLng(lat, lng) ? { lat, lng, label: body.results[0].formatted_address } : null;
  } catch (error) {
    logger.warn({ err: (error as Error).message }, "geocoding request failed");
    return null;
  }
}

/** Geocodes what someone typed in the search box ("02118", "Dorchester, MA"). Never throws. */
export async function geocodeQuery(text: string) {
  const query = text.trim().slice(0, 120);
  if (!query || !geocodingEnabled()) return null;
  const cacheKey = query.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;
  const zip = parseZip(query);
  const value = await callGoogle(
    zip ? { components: `country:US|postal_code:${zip}` } : { address: query, components: "country:US" },
  );
  if (cache.size > 500) cache.clear();
  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** Geocodes a resource's address (falls back to its ZIP, like the old module). */
export async function geocodeAddress(parts: { address?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
  if (!geocodingEnabled()) return null;
  const full = [parts.address, parts.city, parts.state, parts.zip].filter(Boolean).join(", ");
  if (full && (parts.address || parts.city)) {
    const result = await callGoogle({ address: full, components: "country:US" });
    if (result) return result;
  }
  const zip = parseZip(parts.zip);
  return zip ? callGoogle({ components: `country:US|postal_code:${zip}` }) : null;
}

/**
 * Keyless fallback: the centre of published resources that share this ZIP or
 * city. Good enough for "within 25 miles of 02118" when the data is local.
 */
export async function centroidFromResources(text: string): Promise<(LatLng & { label: string }) | null> {
  const zip = parseZip(text);
  const cityState = text.split(",").map((part) => part.trim()).filter(Boolean);
  const conditions: (SQL | undefined)[] = [eq(resources.status, "published"), eq(resources.geocodeStatus, "ok")];
  if (zip) conditions.push(eq(resources.zip, zip));
  else if (cityState[0]) {
    conditions.push(ilike(resources.city, escapeLike(cityState[0])));
    if (cityState[1]) conditions.push(ilike(resources.state, `${escapeLike(cityState[1])}%`));
  } else return null;

  const [row] = await db
    .select({
      lat: sql<number | null>`avg(${resources.lat})`,
      lng: sql<number | null>`avg(${resources.lng})`,
      n: sql<number>`count(*)`.mapWith(Number),
      city: sql<string | null>`(array_agg(${resources.city}))[1]`,
      state: sql<string | null>`(array_agg(${resources.state}))[1]`,
    })
    .from(resources)
    .where(and(...conditions));
  if (!row?.n || row.lat === null || row.lng === null || !isValidLatLng(row.lat, row.lng)) return null;
  const label = zip ? zip : [row.city, row.state].filter(Boolean).join(", ");
  return { lat: row.lat, lng: row.lng, label };
}

/**
 * Geocodes one resource and stores the point. Manual coordinates are kept.
 * Returns the new geocode status. Never throws.
 */
export async function geocodeResource(resourceId: string) {
  try {
    const [resource] = await db
      .select({
        id: resources.id,
        address: resources.address,
        city: resources.city,
        state: resources.state,
        zip: resources.zip,
        geocodeStatus: resources.geocodeStatus,
        geocodeSource: resources.geocodeSource,
      })
      .from(resources)
      .where(eq(resources.id, resourceId))
      .limit(1);
    if (!resource) return "none" as const;
    if (resource.geocodeSource === "manual" && resource.geocodeStatus === "ok") return "ok" as const;
    if (!resource.address && !resource.city && !resource.zip) {
      await db.update(resources).set({ geocodeStatus: "none", lat: null, lng: null }).where(eq(resources.id, resource.id));
      return "none" as const;
    }
    if (!geocodingEnabled()) {
      await db.update(resources).set({ geocodeStatus: "pending" }).where(eq(resources.id, resource.id));
      return "pending" as const;
    }
    const point = await geocodeAddress(resource);
    if (!point) {
      await db.update(resources).set({ geocodeStatus: "failed", geocodeAt: new Date() }).where(eq(resources.id, resource.id));
      return "failed" as const;
    }
    await db
      .update(resources)
      .set({ lat: point.lat, lng: point.lng, geocodeStatus: "ok", geocodeAt: new Date(), geocodeSource: "google" })
      .where(eq(resources.id, resource.id));
    return "ok" as const;
  } catch (error) {
    logger.error({ resourceId: String(resourceId), err: (error as Error).message }, "geocode resource failed");
    return "failed" as const;
  }
}
