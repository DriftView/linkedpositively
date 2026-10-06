CREATE TABLE "ai_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text DEFAULT 'New conversation' NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"topic" text DEFAULT 'other' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"source_url" text,
	"published" boolean DEFAULT false NOT NULL,
	"needs_review" boolean DEFAULT true NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"updated_by" uuid,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("body", '')), 'D'))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_knowledge_articles_topic_ck" CHECK ("ai_knowledge_articles"."topic" in ('hiv', 'prep', 'pep', 'testing', 'treatment', 'sexual_health', 'mental_health', 'trauma', 'substance_use', 'wellness', 'other'))
);
--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"api_messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cards" jsonb,
	"risk" text DEFAULT 'none' NOT NULL,
	"risk_category" text,
	"via_voice" boolean DEFAULT false NOT NULL,
	"outcome" text,
	"model" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"feedback" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_messages_role_ck" CHECK ("ai_messages"."role" in ('user', 'assistant')),
	CONSTRAINT "ai_messages_risk_ck" CHECK ("ai_messages"."risk" in ('none', 'support', 'elevated', 'urgent')),
	CONSTRAINT "ai_messages_outcome_ck" CHECK ("ai_messages"."outcome" in ('answered', 'fallback_unavailable', 'fallback_refusal', 'fallback_error', 'fallback_limit')),
	CONSTRAINT "ai_messages_feedback_ck" CHECK ("ai_messages"."feedback" in (-1, 1))
);
--> statement-breakpoint
CREATE TABLE "ai_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"personalize" boolean DEFAULT true NOT NULL,
	"auto_speak" boolean DEFAULT false NOT NULL,
	"look" text DEFAULT 'amara' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_preferences_look_ck" CHECK ("ai_preferences"."look" in ('amara', 'jordan', 'luis', 'kai'))
);
--> statement-breakpoint
CREATE TABLE "ai_safety_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"message_id" uuid,
	"level" text NOT NULL,
	"category" text NOT NULL,
	"source" text NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"staff_note" text,
	"handled_by" uuid,
	"handled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_safety_alerts_level_ck" CHECK ("ai_safety_alerts"."level" in ('support', 'elevated', 'urgent')),
	CONSTRAINT "ai_safety_alerts_category_ck" CHECK ("ai_safety_alerts"."category" in ('suicide', 'self_harm', 'violence', 'abuse', 'overdose', 'medical', 'human_request', 'other')),
	CONSTRAINT "ai_safety_alerts_source_ck" CHECK ("ai_safety_alerts"."source" in ('keywords', 'classifier', 'assistant')),
	CONSTRAINT "ai_safety_alerts_status_ck" CHECK ("ai_safety_alerts"."status" in ('open', 'in_review', 'resolved'))
);
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_action_ck";--> statement-breakpoint
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_articles" ADD CONSTRAINT "ai_knowledge_articles_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_knowledge_articles" ADD CONSTRAINT "ai_knowledge_articles_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_preferences" ADD CONSTRAINT "ai_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_safety_alerts" ADD CONSTRAINT "ai_safety_alerts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_safety_alerts" ADD CONSTRAINT "ai_safety_alerts_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_safety_alerts" ADD CONSTRAINT "ai_safety_alerts_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_safety_alerts" ADD CONSTRAINT "ai_safety_alerts_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_conversations_user_hidden_last_idx" ON "ai_conversations" USING btree ("user_id","hidden_at","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_conversations_created_idx" ON "ai_conversations" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_knowledge_articles_published_topic_idx" ON "ai_knowledge_articles" USING btree ("published","topic");--> statement-breakpoint
CREATE INDEX "ai_knowledge_articles_search_vector_gin" ON "ai_knowledge_articles" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "ai_messages_conversation_created_idx" ON "ai_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_messages_user_created_idx" ON "ai_messages" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_messages_created_idx" ON "ai_messages" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_safety_alerts_status_created_idx" ON "ai_safety_alerts" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ai_safety_alerts_user_idx" ON "ai_safety_alerts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_safety_alerts_conversation_status_idx" ON "ai_safety_alerts" USING btree ("conversation_id","status");--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_action_ck" CHECK ("audit_log"."action" in ('user.create', 'user.update', 'user.roles', 'user.block', 'user.unblock', 'user.autoblock', 'user.passwordLink', 'user.welcomeLink', 'user.coach', 'user.impersonate', 'user.impersonateStop', 'randomize.participant', 'randomize.control', 'sms.template', 'sms.test', 'sms.resend', 'sms.cancel', 'sms.optout', 'survey.config', 'survey.sync', 'survey.complete', 'settings.update', 'ai.alert', 'ai.transcript', 'ai.knowledge'));