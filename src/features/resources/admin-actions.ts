"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db, withTransaction } from "@/server/db/client";
import { isUuid } from "@/server/db/ids";
import { resources, type NewResource } from "@/server/db/schema";
import { inngest } from "@/server/jobs/client";
import { permissionAction, UserFacingError } from "@/server/actions/safe-action";
import { logger } from "@/server/logger";
import { parseResourceCsv, type ImportRow } from "./csv";
import { geocodeResource, geocodingEnabled } from "./geocode";
import { parseNear, parseZip, websiteHref } from "./lib";
import { bulkIdsSchema, bulkStatusSchema, importSchema, resourceFormSchema, resourceIdSchema } from "./schemas";
import { deleteTargetDiscussion } from "@/features/community/service";
import { resolveReports, resolveTagIds } from "./service";

function revalidateResources(id?: string) {
  revalidatePath("/admin/content/resources");
  revalidatePath("/resources");
  if (id) revalidatePath(`/resources/${id}`);
}

/** Create or update a resource. Re-geocodes when the address changes. */
export const saveResourceAction = permissionAction("resources.manage")
  .inputSchema(resourceFormSchema)
  .action(async ({ parsedInput: input, ctx }) => {
    const website = input.website ? websiteHref(input.website) : "";
    if (input.website && !website) throw new UserFacingError("The website needs to be a web address, like example.org.");
    const manual = input.coordinates ? parseNear(input.coordinates) : null;
    if (input.coordinates && !manual) throw new UserFacingError('Coordinates look like "42.3398,-71.0892" (latitude, longitude).');
    const zip = input.zip ? (parseZip(input.zip) ?? input.zip) : "";

    const fields = {
      title: input.title,
      description: input.description,
      address: input.address,
      city: input.city,
      state: input.state,
      zip,
      website: website ?? "",
      contact: input.contact,
      hours: input.hours,
      eligibility: input.eligibility,
      scheduling: input.scheduling,
      covidUpdates: input.covidUpdates,
      insuranceStatus: input.insuranceStatus,
      services: input.services,
      tagIds: await resolveTagIds(input.tags),
      status: input.status,
    } satisfies Partial<NewResource>;
    const manualPoint = manual
      ? ({ lat: manual.lat, lng: manual.lng, geocodeStatus: "ok", geocodeAt: new Date(), geocodeSource: "manual" } satisfies Partial<NewResource>)
      : null;

    let id = input.id;
    let addressChanged = true;
    if (id) {
      const [before] = await db
        .select({
          address: resources.address,
          city: resources.city,
          state: resources.state,
          zip: resources.zip,
          publishedAt: resources.publishedAt,
          geocodeSource: resources.geocodeSource,
        })
        .from(resources)
        .where(eq(resources.id, id))
        .limit(1);
      if (!before) throw new UserFacingError("That resource was deleted.");
      addressChanged =
        before.address !== fields.address || before.city !== fields.city || before.state !== fields.state || before.zip !== fields.zip;
      const set: Partial<NewResource> = { ...fields };
      if (input.status === "published" && !before.publishedAt) set.publishedAt = new Date();
      if (manualPoint) Object.assign(set, manualPoint);
      else if (before.geocodeSource === "manual") {
        // The manual pin was removed: go back to geocoding the address.
        Object.assign(set, { lat: null, lng: null, geocodeStatus: "none", geocodeAt: null, geocodeSource: null } satisfies Partial<NewResource>);
        addressChanged = true;
      }
      await db.update(resources).set(set).where(eq(resources.id, id));
      if (input.status === "unpublished") await resolveReports([id], "unpublished", ctx.viewer.id);
    } else {
      const [created] = await db
        .insert(resources)
        .values({
          ...fields,
          authorId: ctx.viewer.id,
          publishedAt: input.status === "published" ? new Date() : null,
          ...(manualPoint ?? { geocodeStatus: "none" }),
        })
        .returning({ id: resources.id });
      id = created.id;
    }

    const geocodeStatus = manual ? "ok" : addressChanged ? await geocodeResource(id) : "unchanged";
    revalidateResources(id);
    return { id, geocodeStatus };
  });

/** Publish or unpublish several resources (suggested queue, flagged queue, list). */
export const setResourceStatusAction = permissionAction("resources.manage")
  .inputSchema(bulkStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    const ids = parsedInput.ids;
    if (parsedInput.status === "published") {
      await db.update(resources).set({ status: "published" }).where(inArray(resources.id, ids));
      await db
        .update(resources)
        .set({ publishedAt: new Date() })
        .where(and(inArray(resources.id, ids), isNull(resources.publishedAt)));
      const needGeocode = await db
        .select({ id: resources.id })
        .from(resources)
        .where(and(inArray(resources.id, ids), ne(resources.geocodeStatus, "ok")))
        .limit(25);
      for (const resource of needGeocode) await geocodeResource(resource.id);
    } else {
      await withTransaction(async (tx) => {
        await tx.update(resources).set({ status: "unpublished" }).where(inArray(resources.id, ids));
        await resolveReports(ids, "unpublished", ctx.viewer.id, tx);
      });
    }
    revalidateResources();
    return { count: ids.length };
  });

/** Keeps the resource published and closes its reports. */
export const dismissReportsAction = permissionAction("resources.manage")
  .inputSchema(resourceIdSchema)
  .action(async ({ parsedInput, ctx }) => {
    await resolveReports([parsedInput.resourceId], "dismissed", ctx.viewer.id);
    revalidateResources(parsedInput.resourceId);
    return { ok: true };
  });

/**
 * Deletes resources with everything that hangs off them: favourites,
 * ratings and reports (foreign keys cascade) and comments.
 */
export const deleteResourcesAction = permissionAction("resources.manage")
  .inputSchema(bulkIdsSchema)
  .action(async ({ parsedInput }) => {
    const ids = parsedInput.ids;
    await withTransaction(async (tx) => {
      await tx.delete(resources).where(inArray(resources.id, ids));
      await deleteTargetDiscussion("resource", ids, tx);
    });
    revalidateResources();
    return { count: ids.length };
  });

export const retryGeocodeAction = permissionAction("resources.manage")
  .inputSchema(resourceIdSchema)
  .action(async ({ parsedInput }) => {
    if (!geocodingEnabled()) {
      throw new UserFacingError("Geocoding isn't set up (GOOGLE_MAPS_API_KEY). Add coordinates by hand instead.");
    }
    const status = await geocodeResource(parsedInput.resourceId);
    revalidateResources(parsedInput.resourceId);
    return { status };
  });

// ——— CSV import ———

export type ImportPreviewRow = Pick<ImportRow, "line" | "guid" | "title" | "city" | "state" | "zip" | "tags" | "errors" | "warnings"> & {
  action: "create" | "update" | "skip" | "error";
  hasCoordinates: boolean;
};

async function planImport(csv: string, updateExisting: boolean) {
  const parsed = parseResourceCsv(csv);
  if (parsed.fatal) throw new UserFacingError(parsed.fatal);
  const guids = parsed.rows.map((row) => row.guid).filter((guid): guid is string => Boolean(guid));
  // Exports use the resource id as "Serial No" when there was no import GUID, so match either.
  const rowIds = guids.filter(isUuid);
  const existing = guids.length
    ? await db
        .select({ id: resources.id, importGuid: resources.importGuid })
        .from(resources)
        .where(or(inArray(resources.importGuid, guids), rowIds.length ? inArray(resources.id, rowIds) : undefined))
    : [];
  const existingByGuid = new Map<string, string>();
  for (const doc of existing) {
    existingByGuid.set(doc.id, doc.id);
    if (doc.importGuid) existingByGuid.set(doc.importGuid, doc.id);
  }
  const plan = parsed.rows.map((row) => {
    const existingId = row.guid ? (existingByGuid.get(row.guid) ?? existingByGuid.get(row.guid.toLowerCase())) : undefined;
    const action: ImportPreviewRow["action"] = row.errors.length ? "error" : existingId ? (updateExisting ? "update" : "skip") : "create";
    return { row, action, existingId };
  });
  return { parsed, plan };
}

export const previewImportAction = permissionAction("resources.manage")
  .inputSchema(importSchema)
  .action(async ({ parsedInput }) => {
    const { parsed, plan } = await planImport(parsedInput.csv, parsedInput.updateExisting);
    const rows: ImportPreviewRow[] = plan.map(({ row, action }) => ({
      line: row.line,
      guid: row.guid,
      title: row.title,
      city: row.city,
      state: row.state,
      zip: row.zip,
      tags: row.tags,
      errors: row.errors,
      warnings: row.warnings,
      action,
      hasCoordinates: Boolean(row.coordinates),
    }));
    return {
      rows,
      unknownHeaders: parsed.unknownHeaders,
      mappedFields: parsed.mappedFields,
      counts: {
        create: rows.filter((row) => row.action === "create").length,
        update: rows.filter((row) => row.action === "update").length,
        skip: rows.filter((row) => row.action === "skip").length,
        error: rows.filter((row) => row.action === "error").length,
        warnings: rows.filter((row) => row.warnings.length).length,
      },
      geocoding: geocodingEnabled(),
    };
  });

/** Imports valid rows. Rows with errors are skipped; existing Serial Nos are skipped unless updateExisting. */
export const runImportAction = permissionAction("resources.manage")
  .inputSchema(importSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { plan } = await planImport(parsedInput.csv, parsedInput.updateExisting);
    let created = 0;
    let updated = 0;
    const toGeocode: string[] = [];
    for (const { row, action, existingId } of plan) {
      if (action === "error" || action === "skip") continue;
      const fields: Partial<NewResource> = {
        title: row.title,
        address: row.address,
        city: row.city,
        state: row.state,
        zip: row.zip,
        website: websiteHref(row.website) ?? "",
        contact: row.contact,
        hours: row.hours,
        eligibility: row.eligibility,
        scheduling: row.scheduling,
        covidUpdates: row.covidUpdates,
        insuranceStatus: row.insuranceStatus,
        services: row.services,
        description: row.description,
        tagIds: await resolveTagIds(row.tags),
        ...(row.coordinates
          ? { lat: row.coordinates.lat, lng: row.coordinates.lng, geocodeStatus: "ok", geocodeAt: new Date(), geocodeSource: "import" }
          : { geocodeStatus: row.address || row.city || row.zip ? "pending" : "none", geocodeAt: null, geocodeSource: null }),
      };
      try {
        if (action === "update" && existingId) {
          await db.update(resources).set(fields).where(eq(resources.id, existingId));
          updated++;
          if (!row.coordinates) toGeocode.push(existingId);
        } else {
          const [doc] = await db
            .insert(resources)
            .values({
              ...fields,
              title: row.title,
              importGuid: row.guid ?? null,
              status: parsedInput.publish ? "published" : "unpublished",
              publishedAt: parsedInput.publish ? new Date() : null,
              authorId: ctx.viewer.id,
            })
            .returning({ id: resources.id });
          created++;
          if (!row.coordinates) toGeocode.push(doc.id);
        }
      } catch (error) {
        logger.warn({ line: row.line, err: (error as Error).message }, "resource import row failed");
      }
    }

    let geocodeQueued = false;
    if (toGeocode.length && geocodingEnabled()) {
      try {
        await inngest.send({ name: "resources/geocode.pending", data: {} });
        geocodeQueued = true;
      } catch {
        // No job runner locally: geocode a first batch now; the nightly job picks up the rest.
        for (const id of toGeocode.slice(0, 25)) await geocodeResource(id);
      }
    }
    revalidateResources();
    return { created, updated, needsGeocode: toGeocode.length, geocodeQueued, geocoding: geocodingEnabled() };
  });
