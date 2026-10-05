import { z } from "zod";
import { COLOR_THEME_IDS } from "@/features/gamification/catalog";

export const ABOUT_ME_MAX = 1000;

export const aboutMeSchema = z.object({
  aboutMe: z.string().trim().max(ABOUT_ME_MAX, `Keep it under ${ABOUT_ME_MAX} characters.`),
});

export const avatarSchema = z.object({ avatarId: z.string().regex(/^pack-\d-\d{2}$/) });

export const badgesSchema = z.object({
  badges: z.array(z.string().regex(/^[a-z-]{2,40}$/)).max(20),
});

export const colorThemeSchema = z.object({ theme: z.enum(COLOR_THEME_IDS) });

export const accountSchema = z.object({
  name: z.string().trim().min(1, "Add the name people will see.").max(80),
  email: z.email("Enter a valid email address.").trim().max(200),
  timezone: z.string().trim().min(1).max(64),
  /** Empty clears the number. */
  phone: z.string().trim().max(32).optional(),
  /** Required only when the email changes. */
  currentPassword: z.string().max(200).optional(),
});

const optionalText = (max: number) => z.string().trim().max(max);

export const peerNavProfileSchema = z.object({
  firstName: optionalText(80),
  pronouns: optionalText(60),
  location: optionalText(120),
  aboutMe: optionalText(2000),
  zoomLink: z
    .string()
    .trim()
    .max(500)
    .refine((value) => !value || /^https:\/\/[^\s]+$/i.test(value), "Use a full link that starts with https://"),
});

/** Photos: formats a browser can crop and every device can show. */
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
