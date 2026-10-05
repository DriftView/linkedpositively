import { z } from "zod";
import { ROLES } from "@/server/auth/roles";
import { uuidSchema } from "@/server/db/ids";

/** Validation for the staff admin forms (shared by client forms and server actions). */

export const TIMEZONES = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Arizona (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska (Anchorage)" },
  { value: "Pacific/Honolulu", label: "Hawaii (Honolulu)" },
  { value: "America/Puerto_Rico", label: "Atlantic (Puerto Rico)" },
] as const;
const TIMEZONE_VALUES = TIMEZONES.map((zone) => zone.value) as [string, ...string[]];

export const idsSchema = z.object({ ids: z.array(uuidSchema).min(1, "Select at least one person.").max(500) });

const PHONE_MESSAGE = "Enter a valid phone number with country code. Eg. +19879543210";

export const phoneField = z
  .string()
  .trim()
  .max(30)
  .refine((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15;
  }, PHONE_MESSAGE);

export const createParticipantSchema = z
  .object({
    studyId: z.string().trim().min(1, "Enter the study ID.").max(60),
    username: z
      .string()
      .trim()
      .min(2, "Enter a username of at least 2 characters.")
      .max(60)
      .regex(/^\S+$/, "Enter the user's name without spaces.")
      .regex(/^[\p{L}\p{N}._@'-]+$/u, "Use letters, numbers, dots, dashes or underscores."),
    email: z.string().trim().max(200).pipe(z.email("This email address is not valid.")),
    phone: phoneField,
    participant: z.boolean(),
    ecoach: z.boolean(),
    coachId: uuidSchema.nullable(),
    pronouns: z.string().trim().max(60),
    age: z
      .number()
      .int()
      .min(10, "Enter an age between 10 and 99.")
      .max(99, "Enter an age between 10 and 99.")
      .nullable(),
    timezone: z.enum(TIMEZONE_VALUES),
    sendWelcome: z.boolean(),
  })
  .refine((value) => !value.ecoach || value.coachId, { message: "Choose a peer navigator.", path: ["coachId"] });
export type CreateParticipantInput = z.infer<typeof createParticipantSchema>;

export const updateAccountSchema = z.object({
  userId: uuidSchema,
  name: z.string().trim().min(1, "Enter a name.").max(120),
  email: z.string().trim().max(200).pipe(z.email("This email address is not valid.")),
  studyId: z.string().trim().max(60),
  phone: z.union([z.literal(""), phoneField]),
  timezone: z.enum(TIMEZONE_VALUES),
  pronouns: z.string().trim().max(60),
  age: z.number().int().min(10).max(99).nullable(),
  smsOptOut: z.boolean(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const setRolesSchema = z.object({ userId: uuidSchema, roles: z.array(z.enum(ROLES)).max(ROLES.length) });

export const studyRolesSchema = idsSchema.extend({ participant: z.boolean(), ecoach: z.boolean() });

export const assignCoachSchema = idsSchema.extend({ coachId: uuidSchema.nullable() });

export const blockSchema = idsSchema.extend({ reason: z.string().trim().max(200).optional() });

export const userIdSchema = z.object({ userId: uuidSchema });
