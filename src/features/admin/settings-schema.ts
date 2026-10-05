import { z } from "zod";

/**
 * Staff-editable site settings with their defaults. Client-safe (the settings
 * form validates with the same schema). Stored one row per key in `app_settings`.
 */
export const settingsSchema = z.object({
  studyName: z.string().trim().min(1, "Give the study a name.").max(120),
  contactEmail: z.union([z.literal(""), z.email("Enter a valid email address.")]),
  contactPhone: z.string().trim().max(40),
  smsProgramEnabled: z.boolean(),
  smsWelcomeEnabled: z.boolean(),
  accountEmailOnRandomize: z.boolean(),
  autoBlockEnabled: z.boolean(),
  autoBlockDays: z.number().int().min(30, "At least 30 days.").max(730, "At most 730 days."),
  surveyPromptsEnabled: z.boolean(),
  qualtricsSyncEnabled: z.boolean(),
});

export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = {
  studyName: "Link Positively",
  contactEmail: "",
  contactPhone: "",
  smsProgramEnabled: true,
  smsWelcomeEnabled: true,
  accountEmailOnRandomize: true,
  // Legacy twm_general_cron: participants blocked 150 days after their start date.
  autoBlockEnabled: true,
  autoBlockDays: 150,
  surveyPromptsEnabled: true,
  qualtricsSyncEnabled: false,
};

export const SETTING_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[];
