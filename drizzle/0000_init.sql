CREATE TYPE "public"."ledger_kind" AS ENUM('earn_ship', 'earn_topup', 'earn_quest', 'spend_order', 'refund_order', 'adjustment');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'fulfilled', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_ship_status" AS ENUM('draft', 'pending', 'pending_hq', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_kind" AS ENUM('approval', 'rejection', 'comment', 'internal_comment');--> statement-breakpoint
CREATE TYPE "public"."ship_status" AS ENUM('pending', 'pending_hq', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'synced', 'failed');--> statement-breakpoint
CREATE TYPE "public"."traction_kind" AS ENUM('github_repo', 'npm', 'pypi', 'crates', 'chrome_ext', 'firefox_addon');--> statement-breakpoint
CREATE TYPE "public"."trust_level" AS ENUM('blue', 'green', 'red');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('needs_submission', 'pending', 'verified', 'ineligible');--> statement-breakpoint
CREATE TABLE "address_reveal_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" integer NOT NULL,
	"revealed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request_ip" text
);
--> statement-breakpoint
CREATE TABLE "airtable_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"ship_id" integer NOT NULL,
	"review_id" uuid,
	"airtable_record_id" text,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"kind" "ledger_kind" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"project_id" integer,
	"ship_id" integer,
	"order_id" integer,
	"level" integer,
	"rate" numeric(6, 2),
	"hours_basis" numeric(8, 2),
	"note" text,
	"created_by_actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hackatime_project_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"hackatime_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"total_price" numeric(10, 2) NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"reference" text,
	"admin_notes" text,
	"user_notes" text,
	"fulfilled_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"quest_id" text NOT NULL,
	"proof_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "projects_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"demo_url" text,
	"repo_url" text,
	"screenshot_key" text,
	"ship_status" "project_ship_status" DEFAULT 'draft' NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"score" numeric(12, 2) DEFAULT 0 NOT NULL,
	"score_updated_at" timestamp with time zone,
	"max_reviewed_level" integer DEFAULT 6 NOT NULL,
	"score_flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ship_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"reviewer_actor_id" text NOT NULL,
	"kind" "review_kind" NOT NULL,
	"held" boolean DEFAULT false NOT NULL,
	"hours_assigned" numeric(8, 2),
	"feedback" text,
	"justification" text,
	"internal_message" text,
	"fields" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"user_id" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "ships" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ships_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"ship_number" integer NOT NULL,
	"status" "ship_status" DEFAULT 'pending' NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"window_end" timestamp with time zone NOT NULL,
	"seconds_submitted" integer NOT NULL,
	"key_seconds" jsonb NOT NULL,
	"snap_title" text NOT NULL,
	"snap_description" text NOT NULL,
	"snap_demo_url" text,
	"snap_repo_url" text,
	"snap_screenshot_url" text,
	"hours_assigned" numeric(8, 2),
	"decided_at" timestamp with time zone,
	"hard_rejected" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"fulfiller_context" text,
	"thumbnail_key" text,
	"category" text,
	"price" numeric(10, 2) NOT NULL,
	"usd_cost" numeric(10, 2),
	"stock" integer,
	"one_per_user" boolean DEFAULT false NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "traction_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"value" integer NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "traction_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" integer NOT NULL,
	"kind" "traction_kind" NOT NULL,
	"external_ref" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"last_polled_at" timestamp with time zone,
	"last_value" integer,
	"error_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"hca_id" text NOT NULL,
	"slack_id" text,
	"username" text,
	"email" text NOT NULL,
	"verification_status" "verification_status" DEFAULT 'needs_submission' NOT NULL,
	"ysws_eligible" boolean DEFAULT false NOT NULL,
	"verification_refreshed_at" timestamp with time zone,
	"hca_access_token" text,
	"hca_refresh_token" text,
	"hca_token_expires_at" timestamp with time zone,
	"hackatime_id" text,
	"hackatime_access_token" text,
	"hackatime_trust_level" "trust_level",
	"trust_checked_at" timestamp with time zone,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_banned" boolean DEFAULT false NOT NULL,
	"ban_reason" text,
	"internal_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_hca_id_unique" UNIQUE("hca_id"),
	CONSTRAINT "users_slack_id_unique" UNIQUE("slack_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "address_reveal_audits" ADD CONSTRAINT "address_reveal_audits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_syncs" ADD CONSTRAINT "airtable_syncs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_syncs" ADD CONSTRAINT "airtable_syncs_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "airtable_syncs" ADD CONSTRAINT "airtable_syncs_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_ledger" ADD CONSTRAINT "currency_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_ledger" ADD CONSTRAINT "currency_ledger_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_ledger" ADD CONSTRAINT "currency_ledger_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackatime_project_links" ADD CONSTRAINT "hackatime_project_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hackatime_project_links" ADD CONSTRAINT "hackatime_project_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_item_id_shop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."shop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_quests" ADD CONSTRAINT "project_quests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_quests" ADD CONSTRAINT "project_quests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_ship_id_ships_id_fk" FOREIGN KEY ("ship_id") REFERENCES "public"."ships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ships" ADD CONSTRAINT "ships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ships" ADD CONSTRAINT "ships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traction_snapshots" ADD CONSTRAINT "traction_snapshots_source_id_traction_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."traction_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "traction_sources" ADD CONSTRAINT "traction_sources_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "address_audits_order_idx" ON "address_reveal_audits" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "airtable_syncs_ship_uq" ON "airtable_syncs" USING btree ("ship_id");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ledger_user_idx" ON "currency_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_ship_earn_uq" ON "currency_ledger" USING btree ("ship_id","kind","level") WHERE "currency_ledger"."kind" in ('earn_ship', 'earn_topup');--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_order_uq" ON "currency_ledger" USING btree ("order_id","kind") WHERE "currency_ledger"."kind" in ('spend_order', 'refund_order');--> statement-breakpoint
CREATE UNIQUE INDEX "hackatime_links_user_key_uq" ON "hackatime_project_links" USING btree ("user_id","hackatime_key");--> statement-breakpoint
CREATE INDEX "hackatime_links_project_idx" ON "hackatime_project_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_item_idx" ON "orders" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "orders_created_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "project_quests_uq" ON "project_quests" USING btree ("project_id","quest_id");--> statement-breakpoint
CREATE INDEX "projects_user_idx" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("ship_status");--> statement-breakpoint
CREATE INDEX "reviews_project_idx" ON "reviews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "reviews_ship_idx" ON "reviews" USING btree ("ship_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ships_project_number_uq" ON "ships" USING btree ("project_id","ship_number");--> statement-breakpoint
CREATE INDEX "ships_status_idx" ON "ships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ships_project_window_idx" ON "ships" USING btree ("project_id","window_end");--> statement-breakpoint
CREATE INDEX "traction_snapshots_source_idx" ON "traction_snapshots" USING btree ("source_id","captured_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "traction_sources_uq" ON "traction_sources" USING btree ("project_id","kind","external_ref");--> statement-breakpoint
CREATE INDEX "users_slack_idx" ON "users" USING btree ("slack_id");--> statement-breakpoint
CREATE INDEX "users_hackatime_idx" ON "users" USING btree ("hackatime_id");