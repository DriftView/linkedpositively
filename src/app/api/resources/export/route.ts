import { inArray, sql } from "drizzle-orm";
import { toCsv } from "@/features/resources/csv";
import { AuthError, assertPermission } from "@/server/auth/session";
import { db } from "@/server/db/client";
import { resources, resourceTags } from "@/server/db/schema";

/**
 * CSV export of every resource (old `resource-list.csv` / `resources.csv`).
 * Columns match the importer, so an export can be edited and re-imported.
 */
export async function GET() {
  try {
    await assertPermission("resources.manage");
  } catch (error) {
    if (error instanceof AuthError) return new Response("Not allowed", { status: 403 });
    throw error;
  }
  const docs = await db
    .select()
    .from(resources)
    .orderBy(sql`lower(${resources.title})`);
  const tagIds = [...new Set(docs.flatMap((doc) => doc.tagIds))];
  const tags = tagIds.length
    ? await db
        .select({ id: resourceTags.id, name: resourceTags.name })
        .from(resourceTags)
        .where(inArray(resourceTags.id, tagIds))
    : [];
  const tagNames = new Map(tags.map((tag) => [tag.id, tag.name]));

  const rows: unknown[][] = [
    [
      "Serial No",
      "Organization",
      "Street Address",
      "City",
      "State",
      "Zip",
      "Website",
      "Contact Info",
      "Hours",
      "Eligibility Requirements",
      "Scheduling",
      "Covid-19 Updates",
      "Insurance Status",
      "Other Services",
      "Tags",
      "Description",
      "Latitude",
      "Longitude",
      "Status",
      "Rating",
      "Ratings",
      "Saves",
      "Open reports",
      "Created",
    ],
    ...docs.map((doc) => [
      doc.importGuid ?? doc.id,
      doc.title,
      doc.address,
      doc.city,
      doc.state,
      doc.zip,
      doc.website,
      doc.contact,
      doc.hours,
      doc.eligibility,
      doc.scheduling,
      doc.covidUpdates,
      doc.insuranceStatus,
      doc.services,
      doc.tagIds
        .map((id) => tagNames.get(id))
        .filter(Boolean)
        .join("; "),
      doc.description,
      doc.lat ?? "",
      doc.lng ?? "",
      doc.status,
      doc.ratingCount ? doc.ratingAverage : "",
      doc.ratingCount,
      doc.favoriteCount,
      doc.openReportCount,
      doc.createdAt.toISOString().slice(0, 10),
    ]),
  ];

  const date = new Date().toISOString().slice(0, 10);
  return new Response(`﻿${toCsv(rows)}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resources-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
