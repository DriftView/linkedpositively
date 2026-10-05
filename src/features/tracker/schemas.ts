import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";

export const reminderSchema = z.object({
  enabled: z.boolean(),
  channel: z.enum(["sms", "in_app"]),
  frequency: z.enum(["daily", "weekly"]),
  weekday: z.number().int().min(0).max(6),
  hour: z.number().int().min(0).max(23),
  minute: z.union([z.literal(0), z.literal(30)]),
  text: z.string().trim().max(140).nullish(),
});

export const saveCheckinSchema = z
  .object({
    meds: z.boolean().optional(),
    mood: z.number().int().min(1).max(12).optional(),
  })
  .refine((value) => value.meds !== undefined || value.mood !== undefined, "Nothing to save");

export const createTrackerSchema = z
  .object({
    kind: z.enum(["hormones", "prep", "sex", "custom"]),
    label: z.string().trim().max(60).optional(),
    reminder: reminderSchema,
  })
  .refine((value) => value.kind !== "custom" || (value.label && value.label.length >= 2), {
    message: "Give your tracker a name",
    path: ["label"],
  });

export const trackerCheckinSchema = z.object({ trackerId: uuidSchema, done: z.boolean() });
export const trackerReminderSchema = z.object({ trackerId: uuidSchema, reminder: reminderSchema });
export const trackerIdSchema = z.object({ trackerId: uuidSchema });
