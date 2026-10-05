import { z } from "zod";
import { uuidSchema } from "@/server/db/ids";

/** Validation shared by the tip editor (client) and its actions (server). */
const optionalUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => !v || /^https?:\/\/\S+$/i.test(v), "Use a full web address starting with https://");

export const tipRuleSchema = z.object({
  field: z.string().regex(/^(i[1-9]|m[1-9]|b(1[0-7]|[1-9]))$/, "Choose a score"),
  operator: z.enum(["<", ">", "==", "<=", ">=", "!="]),
  value: z.number({ error: "Enter a number" }).int().min(-1000).max(1000),
});

const day = z.number().int().min(1, "Days run from 1 to 90").max(90, "Days run from 1 to 90").nullable();

export const tipInputSchema = z
  .object({
    id: uuidSchema.optional(),
    title: z.string().trim().min(3, "Give the tip a title").max(200),
    type: z.enum(["html", "video", "pdf", "offsite"]),
    template: z.string().max(40).nullable(),
    html: z.string().max(60_000),
    description: z.string().trim().max(2000),
    pullquote: z.string().trim().max(1000),
    videoUrl: optionalUrl,
    link: optionalUrl,
    // Only keys made by uploadTipPdf: a tip must not be able to point at (and sign URLs for) other private files.
    pdfKey: z
      .string()
      .max(300)
      .regex(/^tips\/(?!.*\.\.)[\w./-]+\.pdf$/, "Upload the PDF again")
      .nullable(),
    pdfName: z.string().max(200).nullable(),
    tagIds: z.array(uuidSchema).max(20),
    categoryId: uuidSchema.nullable(),
    displayDay: day,
    displayDayTwo: day,
    rule: tipRuleSchema.nullable(),
    published: z.boolean(),
  })
  .superRefine((tip, ctx) => {
    if (tip.type === "video" && !tip.videoUrl) ctx.addIssue({ code: "custom", path: ["videoUrl"], message: "Add the video link" });
    if (tip.type === "offsite" && !tip.link) ctx.addIssue({ code: "custom", path: ["link"], message: "Add the link" });
    if (tip.type === "pdf" && !tip.pdfKey) ctx.addIssue({ code: "custom", path: ["pdfKey"], message: "Upload the PDF" });
    if (tip.type === "html" && !tip.html.replace(/<[^>]*>/g, "").trim()) ctx.addIssue({ code: "custom", path: ["html"], message: "Write the tip" });
    if (!tip.tagIds.length) ctx.addIssue({ code: "custom", path: ["tagIds"], message: "Pick at least one topic" });
  });
export type TipInput = z.infer<typeof tipInputSchema>;

export const tagInputSchema = z.object({
  id: uuidSchema.optional(),
  kind: z.enum(["tag", "category"]),
  name: z.string().trim().min(2, "Name it").max(120),
  description: z.string().trim().max(2000).optional(),
});
