import "server-only";
import { and, arrayOverlaps, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { resourceFavorites, resourceRatings, resourceReports, resources, resourceTags, users, type Resource } from "@/server/db/schema";
import { centroidFromResources, geocodeQuery, geocodingEnabled } from "./geocode";
import { DEFAULT_RADIUS, escapeLike, METERS_PER_MILE, PAGE_SIZE, parseNear, parseZip, type LatLng } from "./lib";
import type { SearchParams } from "./schemas";
import type {
  AdminReportDTO,
  AdminResourceRowDTO,
  ResourceCardDTO,
  ResourceDetailDTO,
  ResourceTagDTO,
  SearchResultDTO,
} from "./types";

type ResourceRow = Resource & { distance?: number | null };

const titleKey = sql`lower(${resources.title})`;

async function tagMap(ids: string[]) {
  if (!ids.length) return new Map<string, ResourceTagDTO>();
  const tags = await db
    .select({ id: resourceTags.id, name: resourceTags.name, slug: resourceTags.slug })
    .from(resourceTags)
    .where(inArray(resourceTags.id, ids));
  return new Map(tags.map((tag) => [tag.id, tag]));
}

async function toCards(viewerId: string, docs: ResourceRow[]): Promise<ResourceCardDTO[]> {
  const tags = await tagMap([...new Set(docs.flatMap((doc) => doc.tagIds))]);
  const favorites = docs.length
    ? await db
        .select({ resourceId: resourceFavorites.resourceId })
        .from(resourceFavorites)
        .where(
          and(
            eq(resourceFavorites.userId, viewerId),
            inArray(
              resourceFavorites.resourceId,
              docs.map((doc) => doc.id),
            ),
          ),
        )
    : [];
  const favoriteIds = new Set(favorites.map((favorite) => favorite.resourceId));
  return docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    description: doc.description ?? "",
    address: doc.address ?? "",
    city: doc.city ?? "",
    state: doc.state ?? "",
    zip: doc.zip ?? "",
    website: doc.website ?? "",
    contact: doc.contact ?? "",
    hours: doc.hours ?? "",
    eligibility: doc.eligibility ?? "",
    scheduling: doc.scheduling ?? "",
    covidUpdates: doc.covidUpdates ?? "",
    insuranceStatus: doc.insuranceStatus ?? "",
    services: doc.services ?? "",
    tags: doc.tagIds.map((id) => tags.get(id)).filter((tag): tag is ResourceTagDTO => Boolean(tag)),
    distanceMiles: typeof doc.distance === "number" ? doc.distance / METERS_PER_MILE : null,
    ratingAverage: doc.ratingAverage ?? 0,
    ratingCount: doc.ratingCount ?? 0,
    favorited: favoriteIds.has(doc.id),
  }));
}

/** Tags used by published resources, most used first (for the filter chips). */
export async function listResourceTags(): Promise<ResourceTagDTO[]> {
  const rows = await db
    .select({ id: resourceTags.id, name: resourceTags.name, slug: resourceTags.slug, count: count() })
    .from(resources)
    .innerJoin(resourceTags, sql`${resourceTags.id} = any(${resources.tagIds})`)
    .where(eq(resources.status, "published"))
    .groupBy(resourceTags.id);
  return rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

/** Haversine distance in metres from `center` (see schema/resources.ts). */
function distanceSql(center: LatLng) {
  return sql<number>`6371000 * 2 * asin(sqrt(power(sin(radians(${resources.lat} - ${center.lat}) / 2), 2) + cos(radians(${center.lat})) * cos(radians(${resources.lat})) * power(sin(radians(${resources.lng} - ${center.lng}) / 2), 2)))`;
}

/** A lat/lng box around `center` that contains the radius, so the lat/lng index can be used. */
function boundingBox(center: LatLng, meters: number): SQL | undefined {
  const dLat = (meters / 111_000) * 1.05;
  const conditions = [sql`${resources.lat} between ${center.lat - dLat} and ${center.lat + dLat}`];
  const cos = Math.cos((center.lat * Math.PI) / 180);
  const dLng = cos > 0.01 ? dLat / cos : 360;
  // Skip the longitude bound near the poles or when the box would cross the antimeridian.
  if (center.lng - dLng > -180 && center.lng + dLng < 180) {
    conditions.push(sql`${resources.lng} between ${center.lng - dLng} and ${center.lng + dLng}`);
  }
  return and(...conditions);
}

/**
 * The resource locator search: keyword, tags, and a centre (the device
 * location, a geocoded ZIP/city, or the centre of known resources there) with
 * a radius. Distances are computed in SQL (haversine, parameterized), sorted
 * numerically.
 */
export async function searchResources(viewerId: string, params: SearchParams): Promise<SearchResultDTO> {
  const radius = params.radius ?? DEFAULT_RADIUS;
  const limit = (params.page ?? 1) * PAGE_SIZE;
  const conditions: (SQL | undefined)[] = [eq(resources.status, "published")];

  const tagSlugs = (params.tags ?? "").split(",").map((slug) => slug.trim()).filter(Boolean).slice(0, 20);
  if (tagSlugs.length) {
    const tags = await db.select({ id: resourceTags.id }).from(resourceTags).where(inArray(resourceTags.slug, tagSlugs));
    conditions.push(
      tags.length
        ? arrayOverlaps(
            resources.tagIds,
            tags.map((tag) => tag.id),
          )
        : sql`false`,
    );
  }

  if (params.q) {
    const pattern = `%${escapeLike(params.q)}%`;
    const matchingTags = await db.select({ id: resourceTags.id }).from(resourceTags).where(ilike(resourceTags.name, pattern)).limit(50);
    conditions.push(
      or(
        ilike(resources.title, pattern),
        ilike(resources.description, pattern),
        ilike(resources.services, pattern),
        ilike(resources.eligibility, pattern),
        ilike(resources.city, pattern),
        matchingTags.length
          ? arrayOverlaps(
              resources.tagIds,
              matchingTags.map((tag) => tag.id),
            )
          : undefined,
      ),
    );
  }

  let center: (LatLng & { label: string; source: "device" | "geocoded" | "nearby" }) | null = null;
  let notice: string | null = null;
  const device = parseNear(params.near);
  if (device) center = { ...device, label: "your location", source: "device" };
  else if (params.loc) {
    const geocoded = await geocodeQuery(params.loc);
    if (geocoded) center = { ...geocoded, label: params.loc, source: "geocoded" };
    else {
      const nearby = await centroidFromResources(params.loc);
      if (nearby) center = { ...nearby, label: params.loc, source: "nearby" };
    }
    if (!center) {
      // Text fallback: match the ZIP or the city/state words.
      const zip = parseZip(params.loc);
      const words = params.loc.split(",").map((part) => part.trim()).filter(Boolean);
      const word = escapeLike(words[0] ?? params.loc);
      conditions.push(zip ? eq(resources.zip, zip) : or(ilike(resources.city, `%${word}%`), ilike(resources.state, word)));
      notice = geocodingEnabled()
        ? `We couldn't find "${params.loc}" on the map, so these results match the text instead.`
        : `Showing places listed in "${params.loc}". Distance search works best with "Use my location".`;
    }
  }
  const filter = and(...conditions);

  if (center) {
    const sort = params.sort ?? "distance";
    const distance = distanceSql(center);
    const meters = radius * METERS_PER_MILE;
    const orderBy =
      sort === "name"
        ? [asc(titleKey), asc(resources.id)]
        : sort === "rating"
          ? [desc(resources.ratingAverage), desc(resources.ratingCount), asc(distance), asc(resources.id)]
          : [asc(distance), asc(resources.id)];
    const found = await db
      .select({ resource: resources, distance, total: sql<number>`count(*) over ()`.mapWith(Number) })
      .from(resources)
      .where(and(filter, isNotNull(resources.lat), boundingBox(center, meters), sql`${distance} <= ${meters}`))
      .orderBy(...orderBy)
      .limit(limit);
    const total = found[0]?.total ?? 0;
    let rows: ResourceRow[] = found.map((row) => ({ ...row.resource, distance: row.distance }));
    if (!total) {
      const closest = await db
        .select({ resource: resources, distance })
        .from(resources)
        .where(and(filter, isNotNull(resources.lat)))
        .orderBy(asc(distance), asc(resources.id))
        .limit(3);
      rows = closest.map((row) => ({ ...row.resource, distance: row.distance }));
      if (rows.length) notice = `Nothing within ${radius} miles of ${center.label}. Here are the closest places we know about.`;
    }
    return {
      results: await toCards(viewerId, rows),
      total: total || rows.length,
      hasMore: total > limit,
      mode: "distance",
      center: { label: center.label, source: center.source },
      notice,
      radius,
    };
  }

  const orderBy =
    params.sort === "rating"
      ? [desc(resources.ratingAverage), desc(resources.ratingCount), asc(titleKey), asc(resources.id)]
      : [asc(titleKey), asc(resources.id)];
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(resources)
      .where(filter)
      .orderBy(...orderBy)
      .limit(limit),
    db.select({ total: count() }).from(resources).where(filter),
  ]);
  return {
    results: await toCards(viewerId, rows),
    total,
    hasMore: total > limit,
    mode: params.q || tagSlugs.length || params.loc ? "text" : "all",
    center: null,
    notice,
    radius,
  };
}

/** A resource page. Participants only see published ones; staff see all. */
export async function getResource(viewerId: string, id: string, { staff = false } = {}): Promise<ResourceDetailDTO | null> {
  if (!isUuid(id)) return null;
  const [doc] = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
  if (!doc) return null;
  if (doc.status !== "published" && !staff) return null;
  const [[card], [rating], [report]] = await Promise.all([
    toCards(viewerId, [doc]),
    db
      .select({ value: resourceRatings.value })
      .from(resourceRatings)
      .where(and(eq(resourceRatings.userId, viewerId), eq(resourceRatings.resourceId, doc.id)))
      .limit(1),
    db
      .select({ reason: resourceReports.reason })
      .from(resourceReports)
      .where(and(eq(resourceReports.userId, viewerId), eq(resourceReports.resourceId, doc.id), isNull(resourceReports.resolvedAt)))
      .limit(1),
  ]);
  return {
    ...card,
    status: doc.status,
    myRating: rating?.value ?? null,
    myReport: report?.reason ?? null,
    hasLocation: doc.lat !== null && doc.lng !== null,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

/** The viewer's saved resources, newest first. */
export async function listFavoriteResources(viewerId: string): Promise<ResourceCardDTO[]> {
  const rows = await db
    .select({ resource: resources })
    .from(resourceFavorites)
    .innerJoin(resources, eq(resources.id, resourceFavorites.resourceId))
    .where(and(eq(resourceFavorites.userId, viewerId), eq(resources.status, "published")))
    .orderBy(desc(resourceFavorites.createdAt), desc(resourceFavorites.id))
    .limit(200);
  return toCards(
    viewerId,
    rows.map((row) => row.resource),
  );
}

export async function countFavoriteResources(viewerId: string) {
  const [row] = await db.select({ n: count() }).from(resourceFavorites).where(eq(resourceFavorites.userId, viewerId));
  return row?.n ?? 0;
}

// ——— Staff ———

export type AdminTab = "published" | "suggested" | "reported" | "unpublished";

const reportedFilter = () => and(sql`${resources.openReportCount} > 0`, ne(resources.status, "unpublished"));

export async function adminResourceCounts() {
  const [row] = await db
    .select({
      published: sql<number>`count(*) filter (where ${resources.status} = 'published')`.mapWith(Number),
      suggested: sql<number>`count(*) filter (where ${resources.status} = 'suggested')`.mapWith(Number),
      unpublished: sql<number>`count(*) filter (where ${resources.status} = 'unpublished')`.mapWith(Number),
      reported: sql<number>`count(*) filter (where ${reportedFilter()})`.mapWith(Number),
      pendingGeocode: sql<number>`count(*) filter (where ${resources.status} = 'published' and ${resources.geocodeStatus} in ('pending', 'failed'))`.mapWith(
        Number,
      ),
    })
    .from(resources);
  return row ?? { published: 0, suggested: 0, unpublished: 0, reported: 0, pendingGeocode: 0 };
}

async function userNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map<string, string>();
  const rows = await db.select({ id: users.id, name: users.name, username: users.username }).from(users).where(inArray(users.id, unique));
  return new Map(rows.map((user) => [user.id, user.name || user.username || "Member"]));
}

export async function adminListResources(input: { tab: AdminTab; q?: string; page?: number }) {
  const perPage = 50;
  const page = Math.max(1, input.page ?? 1);
  const conditions: (SQL | undefined)[] = [input.tab === "reported" ? reportedFilter() : eq(resources.status, input.tab)];
  if (input.q) {
    const pattern = `%${escapeLike(input.q.slice(0, 100))}%`;
    conditions.push(
      or(ilike(resources.title, pattern), ilike(resources.city, pattern), ilike(resources.zip, pattern), ilike(resources.address, pattern)),
    );
  }
  const filter = and(...conditions);
  const orderBy =
    input.tab === "reported"
      ? [desc(resources.openReportCount), desc(resources.updatedAt), asc(resources.id)]
      : input.tab === "suggested"
        ? [desc(resources.createdAt), asc(resources.id)]
        : [asc(titleKey), asc(resources.id)];
  const [docs, [{ total }]] = await Promise.all([
    db
      .select()
      .from(resources)
      .where(filter)
      .orderBy(...orderBy)
      .offset((page - 1) * perPage)
      .limit(perPage),
    db.select({ total: count() }).from(resources).where(filter),
  ]);
  const [tags, names] = await Promise.all([
    tagMap([...new Set(docs.flatMap((doc) => doc.tagIds))]),
    userNames(docs.map((doc) => doc.suggestedBy)),
  ]);
  const rows: AdminResourceRowDTO[] = docs.map((doc) => ({
    id: doc.id,
    title: doc.title,
    city: doc.city ?? "",
    state: doc.state ?? "",
    zip: doc.zip ?? "",
    address: doc.address ?? "",
    contact: doc.contact ?? "",
    status: doc.status,
    geocodeStatus: doc.geocodeStatus,
    tags: doc.tagIds.map((id) => tags.get(id)?.name).filter((name): name is string => Boolean(name)),
    openReportCount: doc.openReportCount,
    ratingAverage: doc.ratingAverage,
    ratingCount: doc.ratingCount,
    favoriteCount: doc.favoriteCount,
    suggestedByName: doc.suggestedBy ? (names.get(doc.suggestedBy) ?? null) : null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }));
  return { rows, total, page, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

export async function getResourceForEdit(id: string) {
  if (!isUuid(id)) return null;
  const [doc] = await db.select().from(resources).where(eq(resources.id, id)).limit(1);
  if (!doc) return null;
  const [tags, reports] = await Promise.all([
    tagMap(doc.tagIds),
    db
      .select()
      .from(resourceReports)
      .where(and(eq(resourceReports.resourceId, doc.id), isNull(resourceReports.resolvedAt)))
      .orderBy(desc(resourceReports.createdAt), desc(resourceReports.id)),
  ]);
  const names = await userNames([doc.suggestedBy, ...reports.map((report) => report.userId)]);
  const hasPoint = doc.lat !== null && doc.lng !== null;
  return {
    id: doc.id,
    form: {
      id: doc.id,
      title: doc.title,
      description: doc.description ?? "",
      address: doc.address ?? "",
      city: doc.city ?? "",
      state: doc.state ?? "",
      zip: doc.zip ?? "",
      website: doc.website ?? "",
      contact: doc.contact ?? "",
      hours: doc.hours ?? "",
      eligibility: doc.eligibility ?? "",
      scheduling: doc.scheduling ?? "",
      covidUpdates: doc.covidUpdates ?? "",
      insuranceStatus: doc.insuranceStatus ?? "",
      services: doc.services ?? "",
      tags: doc.tagIds.map((tagId) => tags.get(tagId)?.name).filter((name): name is string => Boolean(name)),
      status: doc.status,
      coordinates: doc.geocodeSource === "manual" && hasPoint ? `${doc.lat},${doc.lng}` : "",
    },
    geocode: {
      status: doc.geocodeStatus,
      source: doc.geocodeSource ?? null,
      lat: doc.lat ?? null,
      lng: doc.lng ?? null,
    },
    suggestedByName: doc.suggestedBy ? (names.get(doc.suggestedBy) ?? null) : null,
    reports: reports.map(
      (report): AdminReportDTO => ({
        id: report.id,
        reason: report.reason,
        note: report.note ?? "",
        reporterName: names.get(report.userId) ?? "Former member",
        createdAt: report.createdAt.toISOString(),
      }),
    ),
    stats: {
      favoriteCount: doc.favoriteCount,
      ratingAverage: doc.ratingAverage,
      ratingCount: doc.ratingCount,
    },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export async function listAllTagNames() {
  const tags = await db
    .select({ name: resourceTags.name })
    .from(resourceTags)
    .orderBy(sql`lower(${resourceTags.name})`, asc(resourceTags.id));
  return tags.map((tag) => tag.name);
}
