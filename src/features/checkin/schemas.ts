import { z } from "zod";

/** Weekly check-in prompt form (client) and action input (server). */
export const promptInputSchema = z.object({
  sequence: z.number().int().min(1).max(10),
  title: z.string().trim().min(2, "Give it a name staff will recognise").max(200),
  likertText: z.string().trim().min(5, "Write the question").max(1000),
  likertOptions: z
    .array(z.object({ value: z.number().int().min(1).max(5), label: z.string().trim().min(1, "Label every answer").max(120) }))
    .length(5, "Use five answers"),
  openText: z.string().trim().min(5, "Write the question").max(1000),
  openPlaceholder: z.string().trim().max(500),
  feedbackLow: z.string().max(20_000),
  feedbackMedium: z.string().max(20_000),
  feedbackHigh: z.string().max(20_000),
  moreAdherentFeedback: z.string().trim().max(2000),
  lessAdherentFeedback: z.string().trim().max(2000),
});
export type PromptInput = z.infer<typeof promptInputSchema>;
