import { z } from "zod";
import { RESOURCE_REPORT_REASONS } from "@/server/db/schema/resources";
import { uuidSchema } from "@/server/db/ids";
import { RADIUS_OPTIONS } from "./lib";

const text = (max: number) => z.string().trim().max(max).optional().default("");

export const resourceIdSchema = z.object({ resourceId: uuidSchema });

export const favoriteSchema = z.object({ resourceId: uuidSchema, favorite: z.boolean() });

export const rateSchema = z.object({ resourceId: uuidSchema, value: z.number().int().min(1).max(5) });

export const reportSchema = z.object({
  resourceId: uuidSchema,
  reason: z.enum(RESOURCE_REPORT_REASONS),
  note: text(1000),
});

export const suggestSchema = z.object({
  name: z.string().trim().min(2, "Add the name of the place").max(200),
  phone: text(60),
  street: text(300),
  city: text(120),
  state: text(60),
  zip: z
    .string()
    .trim()
    .max(10)
    .refine((value) => value === "" || /^\d{5}(-\d{4})?$/.test(value), "Use a 5-digit ZIP code")
    .optional()
    .default(""),
  website: text(500),
  notes: text(2000),
});
export type SuggestInput = z.input<typeof suggestSchema>;

export const resourceFormSchema = z.object({
  id: uuidSchema.optional(),
  title: z.string().trim().min(2, "Add a name").max(200),
  description: text(5000),
  address: text(300),
  city: text(120),
  state: text(60),
  zip: text(12),
  website: text(500),
  contact: text(500),
  hours: text(2000),
  eligibility: text(4000),
  scheduling: text(4000),
  covidUpdates: text(4000),
  insuranceStatus: text(4000),
  services: text(4000),
  tags: z.array(z.string().trim().min(1).max(80)).max(40).default([]),
  status: z.enum(["published", "suggested", "unpublished"]),
  /** Optional manual pin, "lat,lng". Empty = geocode from the address. */
  coordinates: text(60),
});
export type ResourceFormInput = z.input<typeof resourceFormSchema>;

export const bulkIdsSchema = z.object({ ids: z.array(uuidSchema).min(1).max(500) });
export const bulkStatusSchema = bulkIdsSchema.extend({ status: z.enum(["published", "unpublished"]) });

export const importSchema = z.object({
  csv: z.string().min(1).max(2 * 1024 * 1024),
  updateExisting: z.boolean().default(false),
  publish: z.boolean().default(true),
});

export const searchParamsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  tags: z.string().max(400).optional().catch(undefined),
  near: z.string().max(40).optional().catch(undefined),
  loc: z.string().trim().max(120).optional().catch(undefined),
  radius: z.coerce
    .number()
    .refine((value) => (RADIUS_OPTIONS as readonly number[]).includes(value))
    .optional()
    .catch(undefined),
  sort: z.enum(["distance", "name", "rating"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(50).optional().catch(undefined),
});
export type SearchParams = z.infer<typeof searchParamsSchema>;
