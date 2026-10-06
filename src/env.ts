import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Every environment variable the app reads. The app refuses to start when a
 * required one is missing or malformed, so a bad deploy fails loudly instead
 * of, say, silently skipping SMS reminders.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    // PostgreSQL, e.g. postgres://postgres:postgres@127.0.0.1:54329/linkpositively (`pnpm db`).
    DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// URL"),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),

    // Delivery. With DELIVERY_MODE=log, SMS and email are written to the log
    // instead of being sent, so local copies never contact real participants.
    DELIVERY_MODE: z.enum(["log", "live"]).default("log"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM_NUMBER: z.string().optional(),
    SMTP_URL: z.string().optional(),
    MAIL_FROM: z.string().default("Link Positively <no-reply@localhost>"),

    // Private file storage. Without credentials, uploads go to ./.data/uploads.
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),

    // Background jobs.
    INNGEST_EVENT_KEY: z.string().optional(),
    INNGEST_SIGNING_KEY: z.string().optional(),

    // Integrations.
    QUALTRICS_API_TOKEN: z.string().optional(),
    QUALTRICS_DATA_CENTER: z.string().optional(),
    TECHSTEP_SSO_SECRET: z.string().optional(),
    // Geocoding for the resource locator (distance search). Optional: without it, search by city/ZIP text only.
    GOOGLE_MAPS_API_KEY: z.string().optional(),

    // AI Coach (Claude). Without a key the coach shows its fallback (approved content, resources, people to contact).
    ANTHROPIC_API_KEY: z.string().optional(),
    // Voice (ElevenLabs). Without a key, voice uses the browser's built-in speech where available.
    ELEVENLABS_API_KEY: z.string().optional(),
    ELEVENLABS_VOICE_ID: z.string().default("JBFqnCBsd6RMkjVDRZzb"),
    ELEVENLABS_MODEL_ID: z.string().default("eleven_multilingual_v2"),

    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DELIVERY_MODE: process.env.DELIVERY_MODE,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
    SMTP_URL: process.env.SMTP_URL,
    MAIL_FROM: process.env.MAIL_FROM,
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
    INNGEST_EVENT_KEY: process.env.INNGEST_EVENT_KEY,
    INNGEST_SIGNING_KEY: process.env.INNGEST_SIGNING_KEY,
    QUALTRICS_API_TOKEN: process.env.QUALTRICS_API_TOKEN,
    QUALTRICS_DATA_CENTER: process.env.QUALTRICS_DATA_CENTER,
    TECHSTEP_SSO_SECRET: process.env.TECHSTEP_SSO_SECRET,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
    ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
    ELEVENLABS_MODEL_ID: process.env.ELEVENLABS_MODEL_ID,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },
  skipValidation: process.env.SKIP_ENV_VALIDATION === "1",
  emptyStringAsUndefined: true,
});
