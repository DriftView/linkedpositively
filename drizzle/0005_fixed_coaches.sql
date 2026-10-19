ALTER TABLE "ai_preferences" DROP CONSTRAINT "ai_preferences_look_ck";--> statement-breakpoint
-- Coaches are now chosen, not designed: every member's coach becomes Mina (old designs stay in their columns, unused).
UPDATE "ai_preferences" SET "look" = 'mina' WHERE "look" <> 'mina';--> statement-breakpoint
ALTER TABLE "ai_preferences" ALTER COLUMN "look" SET DEFAULT 'mina';--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_look_ck" CHECK ("ai_preferences"."look" in ('mina'));
