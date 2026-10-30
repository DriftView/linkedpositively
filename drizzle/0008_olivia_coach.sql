ALTER TABLE "ai_preferences" DROP CONSTRAINT "ai_preferences_look_ck";--> statement-breakpoint
ALTER TABLE "ai_preferences" ALTER COLUMN "look" SET DEFAULT 'olivia';--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_look_ck" CHECK ("ai_preferences"."look" in ('mina', 'marcus', 'elena', 'arthur', 'mei', 'liam', 'olivia'));