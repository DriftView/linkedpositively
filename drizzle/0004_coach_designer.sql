ALTER TABLE "ai_preferences" ADD COLUMN "coach_name" text;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD COLUMN "coach_pronouns" text;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD COLUMN "appearance" jsonb;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD COLUMN "voice" text;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD COLUMN "tone" text DEFAULT 'warm' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD COLUMN "reply_length" text DEFAULT 'balanced' NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_coach_pronouns_ck" CHECK ("ai_preferences"."coach_pronouns" in ('she', 'he', 'they'));--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_voice_ck" CHECK ("ai_preferences"."voice" in ('gentle', 'lively', 'upbeat', 'relaxed', 'easygoing', 'warm', 'deep', 'british'));--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_tone_ck" CHECK ("ai_preferences"."tone" in ('warm', 'upbeat', 'calm', 'direct'));--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_reply_length_ck" CHECK ("ai_preferences"."reply_length" in ('brief', 'balanced', 'detailed'));