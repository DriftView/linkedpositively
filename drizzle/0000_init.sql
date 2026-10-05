CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"impersonated_by" uuid,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"username" text,
	"display_username" text,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp with time zone,
	"timezone" text DEFAULT 'America/New_York',
	"programs" text[] DEFAULT ARRAY['lp']::text[],
	"legacy" jsonb,
	"legacy_site" text GENERATED ALWAYS AS (("legacy"->>'site')) STORED,
	"legacy_id" integer GENERATED ALWAYS AS ((case when ("legacy"->>'id') ~ '^[0-9]{1,9}$' then ("legacy"->>'id')::integer end)) STORED,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"first_name" text,
	"pronouns" text,
	"location" text,
	"about_me" text,
	"age" integer,
	"avatar_id" text,
	"photo_key" text,
	"badges" text[] DEFAULT '{}' NOT NULL,
	"color_theme" text DEFAULT 'theme-1' NOT NULL,
	"study_id" text,
	"phone" text,
	"intervention_start_date" timestamp with time zone,
	"role_changed_at" timestamp with time zone,
	"sms_opt_out" boolean DEFAULT false NOT NULL,
	"coach_id" uuid,
	"zoom_link" text,
	"on_prep" boolean,
	"participant_code" text,
	"last_wall_visit_at" timestamp with time zone,
	"last_notifications_seen_at" timestamp with time zone,
	"last_tips_seen_at" timestamp with time zone,
	"last_active_at" timestamp with time zone,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "profiles_legacy_ck" CHECK ("profiles"."legacy_id" is null or ("profiles"."legacy_site" in ('lp', 'peernav') and "profiles"."legacy_table" is not null)),
	CONSTRAINT "profiles_color_theme_ck" CHECK ("profiles"."color_theme" in ('theme-1', 'theme-2', 'theme-3', 'theme-4')),
	CONSTRAINT "profiles_age_ck" CHECK ("profiles"."age" between 0 and 120)
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"author_id" uuid,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"photo" jsonb,
	"video_id" text,
	"video_start" integer,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"mention_ids" uuid[] DEFAULT '{}' NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"last_reported_at" timestamp with time zone,
	"whitelisted_at" timestamp with time zone,
	"whitelisted_by" uuid,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "comments_legacy_ck" CHECK ("comments"."legacy_id" is null or ("comments"."legacy_site" in ('lp', 'peernav') and "comments"."legacy_table" is not null)),
	CONSTRAINT "comments_target_type_ck" CHECK ("comments"."target_type" in ('post', 'tip', 'resource'))
);
--> statement-breakpoint
CREATE TABLE "community_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"key" text NOT NULL,
	"type" text NOT NULL,
	"width" integer,
	"height" integer,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "content_reports_legacy_ck" CHECK ("content_reports"."legacy_id" is null or ("content_reports"."legacy_site" in ('lp', 'peernav') and "content_reports"."legacy_table" is not null)),
	CONSTRAINT "content_reports_target_type_ck" CHECK ("content_reports"."target_type" in ('post', 'comment')),
	CONSTRAINT "content_reports_status_ck" CHECK ("content_reports"."status" in ('open', 'cleared', 'whitelisted', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "hashtags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"use_count" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp with time zone,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "hashtags_name_unique" UNIQUE("name"),
	CONSTRAINT "hashtags_legacy_ck" CHECK ("hashtags"."legacy_id" is null or ("hashtags"."legacy_site" in ('lp', 'peernav') and "hashtags"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "mentions_legacy_ck" CHECK ("mentions"."legacy_id" is null or ("mentions"."legacy_site" in ('lp', 'peernav') and "mentions"."legacy_table" is not null)),
	CONSTRAINT "mentions_entity_type_ck" CHECK ("mentions"."entity_type" in ('post', 'comment'))
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'post' NOT NULL,
	"author_id" uuid,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"headline" text,
	"photo" jsonb,
	"video_id" text,
	"video_start" integer,
	"post_bg" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"body_tags" text[] DEFAULT '{}' NOT NULL,
	"mention_ids" uuid[] DEFAULT '{}' NOT NULL,
	"tip_id" uuid,
	"tip_comment_id" uuid,
	"tip_title" text,
	"comment_count" integer DEFAULT 0 NOT NULL,
	"report_count" integer DEFAULT 0 NOT NULL,
	"last_reported_at" timestamp with time zone,
	"whitelisted_at" timestamp with time zone,
	"whitelisted_by" uuid,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "posts_legacy_ck" CHECK ("posts"."legacy_id" is null or ("posts"."legacy_site" in ('lp', 'peernav') and "posts"."legacy_table" is not null)),
	CONSTRAINT "posts_kind_ck" CHECK ("posts"."kind" in ('post', 'tip_comment'))
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"author_id" uuid,
	"kind" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "reactions_legacy_ck" CHECK ("reactions"."legacy_id" is null or ("reactions"."legacy_site" in ('lp', 'peernav') and "reactions"."legacy_table" is not null)),
	CONSTRAINT "reactions_target_type_ck" CHECK ("reactions"."target_type" in ('post', 'comment', 'tip', 'resource')),
	CONSTRAINT "reactions_kind_ck" CHECK ("reactions"."kind" in ('haha', 'love', 'thumbs_up', 'hundred', 'target'))
);
--> statement-breakpoint
CREATE TABLE "tip_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tip_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "tip_favorites_legacy_ck" CHECK ("tip_favorites"."legacy_id" is null or ("tip_favorites"."legacy_site" in ('lp', 'peernav') and "tip_favorites"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "tip_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'tag' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"weight" integer DEFAULT 0 NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tip_tags_legacy_ck" CHECK ("tip_tags"."legacy_id" is null or ("tip_tags"."legacy_site" in ('lp', 'peernav') and "tip_tags"."legacy_table" is not null)),
	CONSTRAINT "tip_tags_kind_ck" CHECK ("tip_tags"."kind" in ('tag', 'category'))
);
--> statement-breakpoint
CREATE TABLE "tip_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tip_id" uuid NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"recommended" boolean DEFAULT false NOT NULL,
	"first_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_viewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "tip_views_legacy_ck" CHECK ("tip_views"."legacy_id" is null or ("tip_views"."legacy_site" in ('lp', 'peernav') and "tip_views"."legacy_table" is not null)),
	CONSTRAINT "tip_views_count_ck" CHECK ("tip_views"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'html' NOT NULL,
	"template" text,
	"html" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"pullquote" text,
	"video_url" text,
	"pdf_key" text,
	"pdf_name" text,
	"link" text,
	"tag_ids" uuid[] DEFAULT '{}' NOT NULL,
	"category_id" uuid,
	"display_day" integer,
	"display_day_two" integer,
	"rule" jsonb,
	"published" boolean DEFAULT true NOT NULL,
	"author_id" uuid,
	"search_text" text DEFAULT '' NOT NULL,
	"search_vector" "tsvector" GENERATED ALWAYS AS ((setweight(to_tsvector('english', coalesce("title", '')), 'A') || setweight(to_tsvector('english', coalesce("search_text", '')), 'D'))) STORED,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tips_legacy_ck" CHECK ("tips"."legacy_id" is null or ("tips"."legacy_site" in ('lp', 'peernav') and "tips"."legacy_table" is not null)),
	CONSTRAINT "tips_type_ck" CHECK ("tips"."type" in ('html', 'video', 'pdf', 'offsite')),
	CONSTRAINT "tips_template_ck" CHECK ("tips"."template" in ('text_linequote', 'text_blockquote', 'text_paragraph', 'image_only', 'image_text', 'video_only', 'video_text', 'text_bullet')),
	CONSTRAINT "tips_display_day_ck" CHECK ("tips"."display_day" between 1 and 90),
	CONSTRAINT "tips_display_day_two_ck" CHECK ("tips"."display_day_two" between 1 and 90)
);
--> statement-breakpoint
CREATE TABLE "checkin_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" integer NOT NULL,
	"title" text NOT NULL,
	"likert_text" text NOT NULL,
	"likert_options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"open_text" text NOT NULL,
	"open_placeholder" text DEFAULT '' NOT NULL,
	"feedback_low" text DEFAULT '' NOT NULL,
	"feedback_medium" text DEFAULT '' NOT NULL,
	"feedback_high" text DEFAULT '' NOT NULL,
	"more_adherent_feedback" text DEFAULT '' NOT NULL,
	"less_adherent_feedback" text DEFAULT '' NOT NULL,
	"medication_feedback" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_prompts_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "checkin_prompts_legacy_ck" CHECK ("checkin_prompts"."legacy_id" is null or ("checkin_prompts"."legacy_site" in ('lp', 'peernav') and "checkin_prompts"."legacy_table" is not null)),
	CONSTRAINT "checkin_prompts_sequence_ck" CHECK ("checkin_prompts"."sequence" between 1 and 10)
);
--> statement-breakpoint
CREATE TABLE "daily_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" date NOT NULL,
	"meds" boolean,
	"mood" integer,
	"meds_at" timestamp with time zone,
	"mood_at" timestamp with time zone,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_checkins_legacy_ck" CHECK ("daily_checkins"."legacy_id" is null or ("daily_checkins"."legacy_site" in ('lp', 'peernav') and "daily_checkins"."legacy_table" is not null)),
	CONSTRAINT "daily_checkins_mood_ck" CHECK ("daily_checkins"."mood" between 1 and 12)
);
--> statement-breakpoint
CREATE TABLE "weekly_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week" integer NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_id" uuid,
	"prompt_sequence" integer,
	"likert_text" text,
	"open_text" text,
	"likert_value" integer,
	"likert_label" text,
	"open_answer" text,
	"feedback_long" text,
	"feedback_short" text,
	"submitted_at" timestamp with time zone,
	"auto_submitted" boolean DEFAULT false NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_checkins_legacy_ck" CHECK ("weekly_checkins"."legacy_id" is null or ("weekly_checkins"."legacy_site" in ('lp', 'peernav') and "weekly_checkins"."legacy_table" is not null)),
	CONSTRAINT "weekly_checkins_week_ck" CHECK ("weekly_checkins"."week" >= 1),
	CONSTRAINT "weekly_checkins_likert_ck" CHECK ("weekly_checkins"."likert_value" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "checkin_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder" jsonb DEFAULT '{"enabled":false,"channel":"in_app","frequency":"daily","weekday":1,"hour":20,"minute":0}'::jsonb NOT NULL,
	"reminder_enabled" boolean GENERATED ALWAYS AS ((coalesce(("reminder"->>'enabled')::boolean, false))) STORED NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "checkin_reminders_userId_unique" UNIQUE("user_id"),
	CONSTRAINT "checkin_reminders_legacy_ck" CHECK ("checkin_reminders"."legacy_id" is null or ("checkin_reminders"."legacy_site" in ('lp', 'peernav') and "checkin_reminders"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "tracker_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tracker_id" uuid NOT NULL,
	"day" date NOT NULL,
	"done" boolean NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracker_entries_legacy_ck" CHECK ("tracker_entries"."legacy_id" is null or ("tracker_entries"."legacy_site" in ('lp', 'peernav') and "tracker_entries"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "tracker_reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"user_id" uuid NOT NULL,
	"target" text NOT NULL,
	"tracker_id" uuid,
	"day" date NOT NULL,
	"channel" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tracker_reminder_logs_key_unique" UNIQUE("key"),
	CONSTRAINT "tracker_reminder_logs_target_ck" CHECK ("tracker_reminder_logs"."target" in ('checkin', 'tracker')),
	CONSTRAINT "tracker_reminder_logs_channel_ck" CHECK ("tracker_reminder_logs"."channel" in ('sms', 'in_app')),
	CONSTRAINT "tracker_reminder_logs_status_ck" CHECK ("tracker_reminder_logs"."status" in ('pending', 'sent', 'failed', 'skipped_no_phone', 'skipped_opt_out', 'skipped_done'))
);
--> statement-breakpoint
CREATE TABLE "trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"legacy_term_id" integer,
	"reminder" jsonb DEFAULT '{"enabled":false,"channel":"in_app","frequency":"daily","weekday":1,"hour":20,"minute":0}'::jsonb NOT NULL,
	"reminder_enabled" boolean GENERATED ALWAYS AS ((coalesce(("reminder"->>'enabled')::boolean, false))) STORED NOT NULL,
	"deleted_at" timestamp with time zone,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trackers_legacy_ck" CHECK ("trackers"."legacy_id" is null or ("trackers"."legacy_site" in ('lp', 'peernav') and "trackers"."legacy_table" is not null)),
	CONSTRAINT "trackers_kind_ck" CHECK ("trackers"."kind" in ('hormones', 'prep', 'sex', 'custom'))
);
--> statement-breakpoint
CREATE TABLE "gamification_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"celebrated_level" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gamification_states_userId_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "level_copy" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" integer NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "level_copy_level_unique" UNIQUE("level"),
	CONSTRAINT "level_copy_legacy_ck" CHECK ("level_copy"."legacy_id" is null or ("level_copy"."legacy_site" in ('lp', 'peernav') and "level_copy"."legacy_table" is not null)),
	CONSTRAINT "level_copy_level_ck" CHECK ("level_copy"."level" between 1 and 8)
);
--> statement-breakpoint
CREATE TABLE "point_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"points" integer NOT NULL,
	"key" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "point_entries_legacy_ck" CHECK ("point_entries"."legacy_id" is null or ("point_entries"."legacy_site" in ('lp', 'peernav') and "point_entries"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "resource_favorites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "resource_favorites_legacy_ck" CHECK ("resource_favorites"."legacy_id" is null or ("resource_favorites"."legacy_site" in ('lp', 'peernav') and "resource_favorites"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "resource_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resource_ratings_legacy_ck" CHECK ("resource_ratings"."legacy_id" is null or ("resource_ratings"."legacy_site" in ('lp', 'peernav') and "resource_ratings"."legacy_table" is not null)),
	CONSTRAINT "resource_ratings_value_ck" CHECK ("resource_ratings"."value" between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "resource_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"resource_id" uuid NOT NULL,
	"reason" text DEFAULT 'closed' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution" text,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "resource_reports_legacy_ck" CHECK ("resource_reports"."legacy_id" is null or ("resource_reports"."legacy_site" in ('lp', 'peernav') and "resource_reports"."legacy_table" is not null)),
	CONSTRAINT "resource_reports_reason_ck" CHECK ("resource_reports"."reason" in ('closed', 'wrong_info', 'not_helpful', 'other')),
	CONSTRAINT "resource_reports_resolution_ck" CHECK ("resource_reports"."resolution" in ('unpublished', 'dismissed', 'deleted'))
);
--> statement-breakpoint
CREATE TABLE "resource_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "resource_tags_key_unique" UNIQUE("key"),
	CONSTRAINT "resource_tags_slug_unique" UNIQUE("slug"),
	CONSTRAINT "resource_tags_legacy_ck" CHECK ("resource_tags"."legacy_id" is null or ("resource_tags"."legacy_site" in ('lp', 'peernav') and "resource_tags"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"address" text,
	"city" text,
	"state" text,
	"zip" text,
	"website" text,
	"contact" text,
	"hours" text,
	"eligibility" text,
	"scheduling" text,
	"covid_updates" text,
	"insurance_status" text,
	"services" text,
	"tag_ids" uuid[] DEFAULT '{}' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"geocode_status" text DEFAULT 'none' NOT NULL,
	"geocode_at" timestamp with time zone,
	"geocode_source" text,
	"status" text DEFAULT 'published' NOT NULL,
	"author_id" uuid,
	"suggested_by" uuid,
	"published_at" timestamp with time zone,
	"import_guid" text,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"rating_average" double precision DEFAULT 0 NOT NULL,
	"favorite_count" integer DEFAULT 0 NOT NULL,
	"open_report_count" integer DEFAULT 0 NOT NULL,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "resources_legacy_ck" CHECK ("resources"."legacy_id" is null or ("resources"."legacy_site" in ('lp', 'peernav') and "resources"."legacy_table" is not null)),
	CONSTRAINT "resources_status_ck" CHECK ("resources"."status" in ('published', 'suggested', 'unpublished')),
	CONSTRAINT "resources_geocode_status_ck" CHECK ("resources"."geocode_status" in ('ok', 'pending', 'failed', 'none')),
	CONSTRAINT "resources_lat_lng_ck" CHECK (("resources"."lat" is null) = ("resources"."lng" is null)),
	CONSTRAINT "resources_lat_ck" CHECK ("resources"."lat" between -90 and 90),
	CONSTRAINT "resources_lng_ck" CHECK ("resources"."lng" between -180 and 180)
);
--> statement-breakpoint
CREATE TABLE "message_thread_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "message_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_author_id" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_threads_legacy_ck" CHECK ("message_threads"."legacy_id" is null or ("message_threads"."legacy_site" in ('lp', 'peernav') and "message_threads"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"deleted_for" uuid[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "messages_legacy_ck" CHECK ("messages"."legacy_id" is null or ("messages"."legacy_site" in ('lp', 'peernav') and "messages"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "peer_nav_coach_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"coach_id" uuid,
	"previous_coach_id" uuid,
	"assigned_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "peer_nav_coach_assignments_legacy_ck" CHECK ("peer_nav_coach_assignments"."legacy_id" is null or ("peer_nav_coach_assignments"."legacy_site" in ('lp', 'peernav') and "peer_nav_coach_assignments"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "peer_nav_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"uploaded_by" uuid,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "peer_nav_files_legacy_ck" CHECK ("peer_nav_files"."legacy_id" is null or ("peer_nav_files"."legacy_site" in ('lp', 'peernav') and "peer_nav_files"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "peer_nav_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"author_id" uuid,
	"session_serial" integer,
	"session_id" uuid,
	"revision_id" uuid,
	"text" text NOT NULL,
	"method_of_contact" text,
	"deleted_at" timestamp with time zone,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_nav_notes_legacy_ck" CHECK ("peer_nav_notes"."legacy_id" is null or ("peer_nav_notes"."legacy_site" in ('lp', 'peernav') and "peer_nav_notes"."legacy_table" is not null)),
	CONSTRAINT "peer_nav_notes_method_ck" CHECK ("peer_nav_notes"."method_of_contact" in ('voice', 'voicemail', 'sms', 'email'))
);
--> statement-breakpoint
CREATE TABLE "peer_nav_session_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"serial" integer NOT NULL,
	"coach_id" uuid,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "peer_nav_session_revisions_legacy_ck" CHECK ("peer_nav_session_revisions"."legacy_id" is null or ("peer_nav_session_revisions"."legacy_site" in ('lp', 'peernav') and "peer_nav_session_revisions"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "peer_nav_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"serial" integer NOT NULL,
	"order" integer NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone,
	"created_by" uuid,
	"updated_by" uuid,
	"extra" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "peer_nav_sessions_legacy_ck" CHECK ("peer_nav_sessions"."legacy_id" is null or ("peer_nav_sessions"."legacy_site" in ('lp', 'peernav') and "peer_nav_sessions"."legacy_table" is not null)),
	CONSTRAINT "peer_nav_sessions_status_ck" CHECK ("peer_nav_sessions"."status" in ('not_started', 'in_progress', 'complete')),
	CONSTRAINT "peer_nav_sessions_serial_ck" CHECK ("peer_nav_sessions"."serial" between 1 and 99)
);
--> statement-breakpoint
CREATE TABLE "sms_clicks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"send_id" uuid,
	"flag" text NOT NULL,
	"week" integer DEFAULT 0 NOT NULL,
	"cycle" text DEFAULT 'legacy' NOT NULL,
	"first_click_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_click_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "sms_clicks_legacy_ck" CHECK ("sms_clicks"."legacy_id" is null or ("sms_clicks"."legacy_site" in ('lp', 'peernav') and "sms_clicks"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "sms_inbound" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from" text NOT NULL,
	"user_id" uuid,
	"body" text DEFAULT '' NOT NULL,
	"kind" text DEFAULT 'message' NOT NULL,
	"message_sid" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "sms_inbound_kind_ck" CHECK ("sms_inbound"."kind" in ('stop', 'start', 'help', 'message'))
);
--> statement-breakpoint
CREATE TABLE "sms_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"flag" text NOT NULL,
	"week" integer DEFAULT 0 NOT NULL,
	"cycle" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'America/New_York' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"reason" text,
	"to" text,
	"from" text,
	"body" text,
	"media_url" text,
	"link_path" text,
	"message_sid" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"clicks" integer DEFAULT 0 NOT NULL,
	"handled_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_sends_legacy_ck" CHECK ("sms_sends"."legacy_id" is null or ("sms_sends"."legacy_site" in ('lp', 'peernav') and "sms_sends"."legacy_table" is not null)),
	CONSTRAINT "sms_sends_status_ck" CHECK ("sms_sends"."status" in ('scheduled', 'sending', 'sent', 'failed', 'skipped', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "sms_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"week" integer NOT NULL,
	"body" text NOT NULL,
	"link_path" text DEFAULT '/' NOT NULL,
	"media_path" text DEFAULT '' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_templates_key_unique" UNIQUE("key"),
	CONSTRAINT "sms_templates_key_ck" CHECK ("sms_templates"."key" ~ '^(WELCOME|WEEK-[0-9]{1,2})$'),
	CONSTRAINT "sms_templates_week_ck" CHECK ("sms_templates"."week" between 0 and 52)
);
--> statement-breakpoint
CREATE TABLE "survey_prompts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"survey_key" text NOT NULL,
	"cycle" text NOT NULL,
	"opened_at" timestamp with time zone,
	"opens" integer DEFAULT 0 NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "survey_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"survey_key" text NOT NULL,
	"user_id" uuid,
	"study_id" text,
	"response_id" text,
	"source" text NOT NULL,
	"outcome" text DEFAULT 'completed' NOT NULL,
	"note" text,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "survey_responses_legacy_ck" CHECK ("survey_responses"."legacy_id" is null or ("survey_responses"."legacy_site" in ('lp', 'peernav') and "survey_responses"."legacy_table" is not null)),
	CONSTRAINT "survey_responses_source_ck" CHECK ("survey_responses"."source" in ('qualtrics', 'participant', 'staff')),
	CONSTRAINT "survey_responses_outcome_ck" CHECK ("survey_responses"."outcome" in ('completed', 'created_user', 'updated_user', 'skipped', 'error'))
);
--> statement-breakpoint
CREATE TABLE "surveys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"qualtrics_survey_id" text DEFAULT '' NOT NULL,
	"sync_mode" text DEFAULT 'off' NOT NULL,
	"field_map" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"prompt_enabled" boolean DEFAULT false NOT NULL,
	"open_week" integer DEFAULT 10 NOT NULL,
	"close_week" integer DEFAULT 11 NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"updated_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "surveys_key_unique" UNIQUE("key"),
	CONSTRAINT "surveys_legacy_ck" CHECK ("surveys"."legacy_id" is null or ("surveys"."legacy_site" in ('lp', 'peernav') and "surveys"."legacy_table" is not null)),
	CONSTRAINT "surveys_key_ck" CHECK ("surveys"."key" in ('baseline', 'midpoint', 'followup')),
	CONSTRAINT "surveys_sync_mode_ck" CHECK ("surveys"."sync_mode" in ('off', 'create_users', 'update_users')),
	CONSTRAINT "surveys_open_week_ck" CHECK ("surveys"."open_week" between 1 and 52),
	CONSTRAINT "surveys_close_week_ck" CHECK ("surveys"."close_week" between 1 and 52)
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"topic" text DEFAULT 'other' NOT NULL,
	"title" text DEFAULT 'Tech Support Feedback' NOT NULL,
	"body" text NOT NULL,
	"device" text,
	"status" text DEFAULT 'open' NOT NULL,
	"staff_note" text,
	"reply" text,
	"handled_by" uuid,
	"resolved_at" timestamp with time zone,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_tickets_legacy_ck" CHECK ("support_tickets"."legacy_id" is null or ("support_tickets"."legacy_site" in ('lp', 'peernav') and "support_tickets"."legacy_table" is not null)),
	CONSTRAINT "support_tickets_topic_ck" CHECK ("support_tickets"."topic" in ('login', 'app', 'notifications', 'sms', 'other')),
	CONSTRAINT "support_tickets_status_ck" CHECK ("support_tickets"."status" in ('open', 'in_progress', 'resolved'))
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"letter" text NOT NULL,
	"definition_html" text DEFAULT '' NOT NULL,
	"definition_text" text DEFAULT '' NOT NULL,
	"updated_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "glossary_terms_slug_unique" UNIQUE("slug"),
	CONSTRAINT "glossary_terms_legacy_ck" CHECK ("glossary_terms"."legacy_id" is null or ("glossary_terms"."legacy_site" in ('lp', 'peernav') and "glossary_terms"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "journey_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"accent" text DEFAULT 'plum' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_categories_slug_unique" UNIQUE("slug"),
	CONSTRAINT "journey_categories_legacy_ck" CHECK ("journey_categories"."legacy_id" is null or ("journey_categories"."legacy_site" in ('lp', 'peernav') and "journey_categories"."legacy_table" is not null)),
	CONSTRAINT "journey_categories_accent_ck" CHECK ("journey_categories"."accent" in ('plum', 'magenta', 'sky', 'apricot', 'pink'))
);
--> statement-breakpoint
CREATE TABLE "journey_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"method_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_goals_legacy_ck" CHECK ("journey_goals"."legacy_id" is null or ("journey_goals"."legacy_site" in ('lp', 'peernav') and "journey_goals"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "journey_methods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_methods_legacy_ck" CHECK ("journey_methods"."legacy_id" is null or ("journey_methods"."legacy_site" in ('lp', 'peernav') and "journey_methods"."legacy_table" is not null))
);
--> statement-breakpoint
CREATE TABLE "journey_user_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"category_id" uuid,
	"category_name" text,
	"method_id" uuid,
	"method_name" text,
	"goal_id" uuid,
	"goal_name" text,
	"own_category" text,
	"own_goal" text,
	"step" integer DEFAULT 1 NOT NULL,
	"current_step_note" text,
	"next_step_note" text,
	"goal_in" text,
	"target_date" timestamp with time zone,
	"percentage" integer,
	"dismissed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"update_count" integer DEFAULT 0 NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journey_user_goals_legacy_ck" CHECK ("journey_user_goals"."legacy_id" is null or ("journey_user_goals"."legacy_site" in ('lp', 'peernav') and "journey_user_goals"."legacy_table" is not null)),
	CONSTRAINT "journey_user_goals_step_ck" CHECK ("journey_user_goals"."step" between 1 and 7),
	CONSTRAINT "journey_user_goals_percentage_ck" CHECK ("journey_user_goals"."percentage" between 0 and 100)
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"body_html" text DEFAULT '' NOT NULL,
	"video_url" text,
	"status" text DEFAULT 'published' NOT NULL,
	"audience" text DEFAULT 'everyone' NOT NULL,
	"in_menu" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"aliases" text[] DEFAULT '{}' NOT NULL,
	"updated_by" uuid,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pages_slug_unique" UNIQUE("slug"),
	CONSTRAINT "pages_legacy_ck" CHECK ("pages"."legacy_id" is null or ("pages"."legacy_site" in ('lp', 'peernav') and "pages"."legacy_table" is not null)),
	CONSTRAINT "pages_status_ck" CHECK ("pages"."status" in ('published', 'draft')),
	CONSTRAINT "pages_audience_ck" CHECK ("pages"."audience" in ('everyone', 'staff'))
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"impersonated_by" uuid,
	"action" text NOT NULL,
	"target_ids" uuid[] DEFAULT '{}' NOT NULL,
	"summary" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_ck" CHECK ("audit_log"."action" in ('user.create', 'user.update', 'user.roles', 'user.block', 'user.unblock', 'user.autoblock', 'user.passwordLink', 'user.welcomeLink', 'user.coach', 'user.impersonate', 'user.impersonateStop', 'randomize.participant', 'randomize.control', 'sms.template', 'sms.test', 'sms.resend', 'sms.cancel', 'sms.optout', 'survey.config', 'survey.sync', 'survey.complete', 'settings.update'))
);
--> statement-breakpoint
CREATE TABLE "login_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"login_at" timestamp with time zone DEFAULT now() NOT NULL,
	"logout_at" timestamp with time zone,
	"user_agent" text DEFAULT '' NOT NULL,
	"program" text DEFAULT 'lp' NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "login_sessions_legacy_ck" CHECK ("login_sessions"."legacy_id" is null or ("login_sessions"."legacy_site" in ('lp', 'peernav') and "login_sessions"."legacy_table" is not null)),
	CONSTRAINT "login_sessions_program_ck" CHECK ("login_sessions"."program" in ('lp', 'peernav'))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"actor_id" uuid,
	"text" text NOT NULL,
	"excerpt" text,
	"reaction" text,
	"href" text,
	"dedupe_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"hidden_until" timestamp with time zone,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "notifications_legacy_ck" CHECK ("notifications"."legacy_id" is null or ("notifications"."legacy_site" in ('lp', 'peernav') and "notifications"."legacy_table" is not null)),
	CONSTRAINT "notifications_kind_ck" CHECK ("notifications"."kind" in ('post_comment', 'also_commented', 'post_reaction', 'comment_reaction', 'post_mention', 'comment_mention', 'welcome', 'time_on_site', 'level', 'tracker_reminder', 'checkin_reminder', 'survey', 'message', 'system'))
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"meta" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_site" text,
	"legacy_table" text,
	"legacy_id" integer,
	CONSTRAINT "usage_events_legacy_ck" CHECK ("usage_events"."legacy_id" is null or ("usage_events"."legacy_site" in ('lp', 'peernav') and "usage_events"."legacy_table" is not null))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_whitelisted_by_user_id_fk" FOREIGN KEY ("whitelisted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_uploads" ADD CONSTRAINT "community_uploads_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_tip_id_tips_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_tip_comment_id_comments_id_fk" FOREIGN KEY ("tip_comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_whitelisted_by_user_id_fk" FOREIGN KEY ("whitelisted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_favorites" ADD CONSTRAINT "tip_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_favorites" ADD CONSTRAINT "tip_favorites_tip_id_tips_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_views" ADD CONSTRAINT "tip_views_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tip_views" ADD CONSTRAINT "tip_views_tip_id_tips_id_fk" FOREIGN KEY ("tip_id") REFERENCES "public"."tips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_category_id_tip_tags_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tip_tags"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_prompts" ADD CONSTRAINT "checkin_prompts_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_checkins" ADD CONSTRAINT "weekly_checkins_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_checkins" ADD CONSTRAINT "weekly_checkins_prompt_id_checkin_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."checkin_prompts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkin_reminders" ADD CONSTRAINT "checkin_reminders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_entries" ADD CONSTRAINT "tracker_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_entries" ADD CONSTRAINT "tracker_entries_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_reminder_logs" ADD CONSTRAINT "tracker_reminder_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tracker_reminder_logs" ADD CONSTRAINT "tracker_reminder_logs_tracker_id_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trackers" ADD CONSTRAINT "trackers_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gamification_states" ADD CONSTRAINT "gamification_states_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_copy" ADD CONSTRAINT "level_copy_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_entries" ADD CONSTRAINT "point_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_favorites" ADD CONSTRAINT "resource_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_favorites" ADD CONSTRAINT "resource_favorites_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_ratings" ADD CONSTRAINT "resource_ratings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_ratings" ADD CONSTRAINT "resource_ratings_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reports" ADD CONSTRAINT "resource_reports_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reports" ADD CONSTRAINT "resource_reports_resource_id_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."resources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_reports" ADD CONSTRAINT "resource_reports_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resources" ADD CONSTRAINT "resources_suggested_by_user_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_members" ADD CONSTRAINT "message_thread_members_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_thread_members" ADD CONSTRAINT "message_thread_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_threads" ADD CONSTRAINT "message_threads_last_author_id_user_id_fk" FOREIGN KEY ("last_author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_thread_id_message_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."message_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_coach_assignments" ADD CONSTRAINT "peer_nav_coach_assignments_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_coach_assignments" ADD CONSTRAINT "peer_nav_coach_assignments_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_coach_assignments" ADD CONSTRAINT "peer_nav_coach_assignments_previous_coach_id_user_id_fk" FOREIGN KEY ("previous_coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_coach_assignments" ADD CONSTRAINT "peer_nav_coach_assignments_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_files" ADD CONSTRAINT "peer_nav_files_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_files" ADD CONSTRAINT "peer_nav_files_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_notes" ADD CONSTRAINT "peer_nav_notes_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_notes" ADD CONSTRAINT "peer_nav_notes_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_notes" ADD CONSTRAINT "peer_nav_notes_session_id_peer_nav_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."peer_nav_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_notes" ADD CONSTRAINT "peer_nav_notes_revision_id_peer_nav_session_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."peer_nav_session_revisions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_session_revisions" ADD CONSTRAINT "peer_nav_session_revisions_session_id_peer_nav_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."peer_nav_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_session_revisions" ADD CONSTRAINT "peer_nav_session_revisions_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_session_revisions" ADD CONSTRAINT "peer_nav_session_revisions_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_sessions" ADD CONSTRAINT "peer_nav_sessions_participant_id_user_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_sessions" ADD CONSTRAINT "peer_nav_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "peer_nav_sessions" ADD CONSTRAINT "peer_nav_sessions_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_clicks" ADD CONSTRAINT "sms_clicks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_clicks" ADD CONSTRAINT "sms_clicks_send_id_sms_sends_id_fk" FOREIGN KEY ("send_id") REFERENCES "public"."sms_sends"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_inbound" ADD CONSTRAINT "sms_inbound_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sends" ADD CONSTRAINT "sms_sends_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_sends" ADD CONSTRAINT "sms_sends_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sms_templates" ADD CONSTRAINT "sms_templates_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_prompts" ADD CONSTRAINT "survey_prompts_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "surveys" ADD CONSTRAINT "surveys_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_handled_by_user_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_goals" ADD CONSTRAINT "journey_goals_method_id_journey_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."journey_methods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_methods" ADD CONSTRAINT "journey_methods_category_id_journey_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."journey_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_user_goals" ADD CONSTRAINT "journey_user_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_user_goals" ADD CONSTRAINT "journey_user_goals_category_id_journey_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."journey_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_user_goals" ADD CONSTRAINT "journey_user_goals_method_id_journey_methods_id_fk" FOREIGN KEY ("method_id") REFERENCES "public"."journey_methods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_user_goals" ADD CONSTRAINT "journey_user_goals_goal_id_journey_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."journey_goals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_impersonated_by_user_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_sessions" ADD CONSTRAINT "login_sessions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_legacy_uq" ON "user" USING btree ("legacy_site","legacy_id") WHERE "user"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "profiles_legacy_uq" ON "profiles" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "profiles"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "profiles_study_id_idx" ON "profiles" USING btree ("study_id");--> statement-breakpoint
CREATE INDEX "profiles_coach_id_idx" ON "profiles" USING btree ("coach_id");--> statement-breakpoint
CREATE UNIQUE INDEX "comments_legacy_uq" ON "comments" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "comments"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "comments_target_created_idx" ON "comments" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_author_created_idx" ON "comments" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "comments_report_idx" ON "comments" USING btree ("report_count","last_reported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "community_uploads_attached_created_idx" ON "community_uploads" USING btree ("attached_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_legacy_uq" ON "content_reports" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "content_reports"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_target_reporter_uq" ON "content_reports" USING btree ("target_type","target_id","reporter_id");--> statement-breakpoint
CREATE INDEX "content_reports_status_idx" ON "content_reports" USING btree ("status","target_type","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "hashtags_legacy_uq" ON "hashtags" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "hashtags"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "hashtags_use_count_idx" ON "hashtags" USING btree ("use_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "hashtags_name_pattern_idx" ON "hashtags" USING btree ("name" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_legacy_uq" ON "mentions" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "mentions"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "mentions_entity_user_uq" ON "mentions" USING btree ("entity_type","entity_id","user_id");--> statement-breakpoint
CREATE INDEX "mentions_user_created_idx" ON "mentions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "posts_legacy_uq" ON "posts" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "posts"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "posts_created_idx" ON "posts" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_author_created_idx" ON "posts" USING btree ("author_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "posts_tags_gin" ON "posts" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "posts_tip_comment_idx" ON "posts" USING btree ("tip_comment_id") WHERE "posts"."tip_comment_id" is not null;--> statement-breakpoint
CREATE INDEX "posts_report_idx" ON "posts" USING btree ("report_count","last_reported_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_legacy_uq" ON "reactions" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "reactions"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "reactions_target_user_uq" ON "reactions" USING btree ("target_type","target_id","user_id");--> statement-breakpoint
CREATE INDEX "reactions_target_created_idx" ON "reactions" USING btree ("target_type","target_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reactions_user_created_idx" ON "reactions" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tip_favorites_legacy_uq" ON "tip_favorites" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "tip_favorites"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tip_favorites_user_tip_uq" ON "tip_favorites" USING btree ("user_id","tip_id");--> statement-breakpoint
CREATE INDEX "tip_favorites_user_created_idx" ON "tip_favorites" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "tip_favorites_tip_idx" ON "tip_favorites" USING btree ("tip_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tip_tags_legacy_uq" ON "tip_tags" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "tip_tags"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tip_tags_kind_slug_uq" ON "tip_tags" USING btree ("kind","slug");--> statement-breakpoint
CREATE INDEX "tip_tags_kind_name_idx" ON "tip_tags" USING btree ("kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "tip_views_legacy_uq" ON "tip_views" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "tip_views"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tip_views_user_tip_uq" ON "tip_views" USING btree ("user_id","tip_id");--> statement-breakpoint
CREATE INDEX "tip_views_tip_idx" ON "tip_views" USING btree ("tip_id");--> statement-breakpoint
CREATE INDEX "tip_views_last_viewed_idx" ON "tip_views" USING btree ("last_viewed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "tips_legacy_uq" ON "tips" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "tips"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "tips_published_display_day_idx" ON "tips" USING btree ("published","display_day");--> statement-breakpoint
CREATE INDEX "tips_published_display_day_two_idx" ON "tips" USING btree ("published","display_day_two");--> statement-breakpoint
CREATE INDEX "tips_tag_ids_gin" ON "tips" USING gin ("tag_ids");--> statement-breakpoint
CREATE INDEX "tips_search_vector_gin" ON "tips" USING gin ("search_vector");--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_prompts_legacy_uq" ON "checkin_prompts" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "checkin_prompts"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkins_legacy_uq" ON "daily_checkins" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "daily_checkins"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_checkins_user_day_uq" ON "daily_checkins" USING btree ("user_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_checkins_legacy_uq" ON "weekly_checkins" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "weekly_checkins"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_checkins_user_week_uq" ON "weekly_checkins" USING btree ("user_id","week");--> statement-breakpoint
CREATE INDEX "weekly_checkins_user_created_idx" ON "weekly_checkins" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "checkin_reminders_legacy_uq" ON "checkin_reminders" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "checkin_reminders"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "checkin_reminders_enabled_idx" ON "checkin_reminders" USING btree ("reminder_enabled") WHERE "checkin_reminders"."reminder_enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_entries_legacy_uq" ON "tracker_entries" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "tracker_entries"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "tracker_entries_tracker_day_uq" ON "tracker_entries" USING btree ("tracker_id","day");--> statement-breakpoint
CREATE INDEX "tracker_entries_user_day_idx" ON "tracker_entries" USING btree ("user_id","day");--> statement-breakpoint
CREATE INDEX "tracker_reminder_logs_user_created_idx" ON "tracker_reminder_logs" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "trackers_legacy_uq" ON "trackers" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "trackers"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "trackers_user_deleted_created_idx" ON "trackers" USING btree ("user_id","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "trackers_reminder_enabled_idx" ON "trackers" USING btree ("reminder_enabled","deleted_at") WHERE "trackers"."reminder_enabled";--> statement-breakpoint
CREATE UNIQUE INDEX "level_copy_legacy_uq" ON "level_copy" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "level_copy"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "point_entries_legacy_uq" ON "point_entries" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "point_entries"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "point_entries_user_at_idx" ON "point_entries" USING btree ("user_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "point_entries_at_idx" ON "point_entries" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "point_entries_user_key_uq" ON "point_entries" USING btree ("user_id","key") WHERE "point_entries"."key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_favorites_legacy_uq" ON "resource_favorites" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "resource_favorites"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_favorites_user_resource_uq" ON "resource_favorites" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX "resource_favorites_user_created_idx" ON "resource_favorites" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resource_favorites_resource_idx" ON "resource_favorites" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_ratings_legacy_uq" ON "resource_ratings" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "resource_ratings"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_ratings_user_resource_uq" ON "resource_ratings" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX "resource_ratings_resource_idx" ON "resource_ratings" USING btree ("resource_id");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_reports_legacy_uq" ON "resource_reports" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "resource_reports"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resource_reports_user_resource_uq" ON "resource_reports" USING btree ("user_id","resource_id");--> statement-breakpoint
CREATE INDEX "resource_reports_resource_resolved_idx" ON "resource_reports" USING btree ("resource_id","resolved_at");--> statement-breakpoint
CREATE UNIQUE INDEX "resource_tags_legacy_uq" ON "resource_tags" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "resource_tags"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "resources_legacy_uq" ON "resources" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "resources"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "resources_lat_lng_idx" ON "resources" USING btree ("lat","lng") WHERE "resources"."lat" is not null;--> statement-breakpoint
CREATE INDEX "resources_status_title_idx" ON "resources" USING btree ("status",lower("title"));--> statement-breakpoint
CREATE INDEX "resources_status_open_reports_idx" ON "resources" USING btree ("status","open_report_count" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resources_status_zip_idx" ON "resources" USING btree ("status","zip");--> statement-breakpoint
CREATE INDEX "resources_status_city_idx" ON "resources" USING btree ("status","city");--> statement-breakpoint
CREATE INDEX "resources_status_created_idx" ON "resources" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "resources_tag_ids_gin" ON "resources" USING gin ("tag_ids");--> statement-breakpoint
CREATE INDEX "resources_geocode_status_idx" ON "resources" USING btree ("geocode_status");--> statement-breakpoint
CREATE UNIQUE INDEX "resources_import_guid_uq" ON "resources" USING btree ("import_guid") WHERE "resources"."import_guid" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "message_thread_members_thread_user_uq" ON "message_thread_members" USING btree ("thread_id","user_id");--> statement-breakpoint
CREATE INDEX "message_thread_members_user_idx" ON "message_thread_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "message_threads_legacy_uq" ON "message_threads" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "message_threads"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "message_threads_participant_coach_last_idx" ON "message_threads" USING btree ("participant_id","coach_id","last_message_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "messages_legacy_uq" ON "messages" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "messages"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "messages_thread_created_idx" ON "messages" USING btree ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_author_created_idx" ON "messages" USING btree ("author_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "peer_nav_coach_assignments_legacy_uq" ON "peer_nav_coach_assignments" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "peer_nav_coach_assignments"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "peer_nav_coach_assignments_participant_created_idx" ON "peer_nav_coach_assignments" USING btree ("participant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "peer_nav_coach_assignments_created_idx" ON "peer_nav_coach_assignments" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "peer_nav_files_legacy_uq" ON "peer_nav_files" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "peer_nav_files"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "peer_nav_files_participant_created_idx" ON "peer_nav_files" USING btree ("participant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "peer_nav_notes_legacy_uq" ON "peer_nav_notes" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "peer_nav_notes"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "peer_nav_notes_participant_deleted_created_idx" ON "peer_nav_notes" USING btree ("participant_id","deleted_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "peer_nav_notes_participant_serial_created_idx" ON "peer_nav_notes" USING btree ("participant_id","session_serial","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "peer_nav_session_revisions_legacy_uq" ON "peer_nav_session_revisions" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "peer_nav_session_revisions"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "peer_nav_session_revisions_session_created_idx" ON "peer_nav_session_revisions" USING btree ("session_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "peer_nav_session_revisions_participant_created_idx" ON "peer_nav_session_revisions" USING btree ("participant_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "peer_nav_sessions_legacy_uq" ON "peer_nav_sessions" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "peer_nav_sessions"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "peer_nav_sessions_participant_serial_uq" ON "peer_nav_sessions" USING btree ("participant_id","serial");--> statement-breakpoint
CREATE INDEX "peer_nav_sessions_participant_order_idx" ON "peer_nav_sessions" USING btree ("participant_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "sms_clicks_legacy_uq" ON "sms_clicks" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "sms_clicks"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_clicks_user_flag_cycle_uq" ON "sms_clicks" USING btree ("user_id","flag","cycle");--> statement-breakpoint
CREATE INDEX "sms_clicks_first_click_idx" ON "sms_clicks" USING btree ("first_click_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sms_inbound_received_idx" ON "sms_inbound" USING btree ("received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sms_inbound_user_received_idx" ON "sms_inbound" USING btree ("user_id","received_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sms_inbound_message_sid_uq" ON "sms_inbound" USING btree ("message_sid") WHERE "sms_inbound"."message_sid" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_sends_legacy_uq" ON "sms_sends" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "sms_sends"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "sms_sends_user_flag_cycle_uq" ON "sms_sends" USING btree ("user_id","flag","cycle");--> statement-breakpoint
CREATE INDEX "sms_sends_status_scheduled_idx" ON "sms_sends" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "sms_sends_scheduled_idx" ON "sms_sends" USING btree ("scheduled_for" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sms_sends_sent_idx" ON "sms_sends" USING btree ("sent_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sms_templates_week_idx" ON "sms_templates" USING btree ("week");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_prompts_user_survey_cycle_uq" ON "survey_prompts" USING btree ("user_id","survey_key","cycle");--> statement-breakpoint
CREATE UNIQUE INDEX "survey_responses_legacy_uq" ON "survey_responses" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "survey_responses"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "survey_responses_response_id_uq" ON "survey_responses" USING btree ("response_id") WHERE "survey_responses"."response_id" is not null;--> statement-breakpoint
CREATE INDEX "survey_responses_user_survey_idx" ON "survey_responses" USING btree ("user_id","survey_key");--> statement-breakpoint
CREATE INDEX "survey_responses_survey_completed_idx" ON "survey_responses" USING btree ("survey_key","completed_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "surveys_legacy_uq" ON "surveys" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "surveys"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_legacy_uq" ON "support_tickets" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "support_tickets"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "support_tickets_status_created_idx" ON "support_tickets" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "support_tickets_user_created_idx" ON "support_tickets" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "glossary_terms_legacy_uq" ON "glossary_terms" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "glossary_terms"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "glossary_terms_letter_name_idx" ON "glossary_terms" USING btree ("letter","name");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_categories_legacy_uq" ON "journey_categories" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "journey_categories"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "journey_categories_published_order_idx" ON "journey_categories" USING btree ("published","order");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_goals_legacy_uq" ON "journey_goals" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "journey_goals"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "journey_goals_method_order_idx" ON "journey_goals" USING btree ("method_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_methods_legacy_uq" ON "journey_methods" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "journey_methods"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "journey_methods_category_order_idx" ON "journey_methods" USING btree ("category_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_user_goals_legacy_uq" ON "journey_user_goals" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "journey_user_goals"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "journey_user_goals_user_dismissed_created_idx" ON "journey_user_goals" USING btree ("user_id","dismissed","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "pages_legacy_uq" ON "pages" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "pages"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "pages_status_menu_order_idx" ON "pages" USING btree ("status","in_menu","order");--> statement-breakpoint
CREATE INDEX "pages_aliases_gin" ON "pages" USING gin ("aliases");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_log_target_ids_gin" ON "audit_log" USING gin ("target_ids");--> statement-breakpoint
CREATE INDEX "audit_log_action_at_idx" ON "audit_log" USING btree ("action","at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "login_sessions_legacy_uq" ON "login_sessions" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "login_sessions"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "login_sessions_user_idx" ON "login_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "login_sessions_login_at_idx" ON "login_sessions" USING btree ("login_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "login_sessions_user_logout_idx" ON "login_sessions" USING btree ("user_id","logout_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_legacy_uq" ON "notifications" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "notifications"."legacy_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_user_dedupe_uq" ON "notifications" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "notifications_user_dismissed_created_idx" ON "notifications" USING btree ("user_id","dismissed_at","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "usage_events_legacy_uq" ON "usage_events" USING btree ("legacy_site","legacy_table","legacy_id") WHERE "usage_events"."legacy_id" is not null;--> statement-breakpoint
CREATE INDEX "usage_events_type_at_idx" ON "usage_events" USING btree ("type","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "usage_events_user_type_at_idx" ON "usage_events" USING btree ("user_id","type","at" DESC NULLS LAST);