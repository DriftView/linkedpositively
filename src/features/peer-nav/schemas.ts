import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";
import { PN_CONTACT_METHODS_LIST } from "./constants";

export const rowId = uuidSchema;
export const serial = z.number().int().min(1).max(6);
export const method = z.enum(PN_CONTACT_METHODS_LIST);

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null)
    .nullable();

export const participantDetailsSchema = z.object({
  participantId: rowId,
  name: z.string().trim().min(1, "Enter a name").max(80),
  pronouns: optionalText(60),
  location: optionalText(120),
  age: z.number().int().min(0).max(120).nullable(),
  onPrep: z.boolean().nullable(),
  studyId: optionalText(60),
  participantCode: optionalText(60),
});
export type ParticipantDetailsInput = z.input<typeof participantDetailsSchema>;

export const reorderSchema = z.object({
  participantId: rowId,
  order: z
    .array(serial)
    .length(6)
    .refine((list) => new Set(list).size === 6, "Each session must appear once"),
});

export const startSessionSchema = z.object({ participantId: rowId, serial });

export const saveSessionSchema = z.object({
  participantId: rowId,
  serial,
  answers: z.record(z.string().max(40), z.union([z.boolean(), z.string().max(10000)])),
  complete: z.boolean(),
  note: z
    .object({ text: z.string().trim().max(20000), method: method.nullable() })
    .refine((note) => !note.text || note.method, { message: "Choose how you contacted them", path: ["method"] })
    .nullable(),
});
export type SaveSessionInput = z.input<typeof saveSessionSchema>;

export const createNoteSchema = z.object({
  participantId: rowId,
  text: z.string().trim().min(1, "Write a note first").max(20000),
  method,
  sessionSerial: serial.nullable(),
});

export const updateNoteSchema = z.object({
  noteId: rowId,
  text: z.string().trim().min(1, "A note can't be empty").max(20000),
  method,
  sessionSerial: serial.nullable(),
});

export const idSchema = z.object({ id: rowId });

export const assignCoachSchema = z.object({ participantId: rowId, coachId: rowId.nullable() });

export const startThreadSchema = z.object({
  /** Required for coaches; ignored for participants (their coach is the recipient). */
  participantId: rowId.optional(),
  subject: z.string().trim().max(120).optional(),
  body: z.string().trim().min(1, "Write a message first").max(5000),
});

export const replySchema = z.object({
  threadId: rowId,
  body: z.string().trim().min(1, "Write a message first").max(5000),
});
