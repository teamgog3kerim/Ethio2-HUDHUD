CREATE TABLE "renewal_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"device_id" uuid NOT NULL,
	"learner_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"state" text NOT NULL,
	"receipt" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "renewal_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"learner_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"subscription" jsonb NOT NULL,
	"timezone" text NOT NULL,
	"state" text DEFAULT 'enabled' NOT NULL,
	"revocation_hash" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "renewal_devices_address_unique" UNIQUE("address")
);
--> statement-breakpoint
CREATE TABLE "polar_sandbox_checkouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"checkout_url" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"subscription_id" uuid,
	"subscription_status" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"access_until" timestamp with time zone,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "polar_sandbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "polar_live_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"checkout_id" uuid,
	"subscription_id" uuid,
	"product_id" uuid,
	"body_hash" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "polar_live_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"checkout_id" uuid,
	"checkout_url" text,
	"status" text DEFAULT 'creating' NOT NULL,
	"expires_at" timestamp with time zone,
	"subscription_id" uuid,
	"subscription_status" text,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"paid_until" timestamp with time zone,
	"access_until" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"monthly_order_id" uuid,
	"monthly_paid_at" timestamp with time zone,
	"monthly_period_start" timestamp with time zone,
	"monthly_ordinal" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polar_live_purchases_checkout_id_unique" UNIQUE("checkout_id"),
	CONSTRAINT "polar_live_purchases_subscription_id_unique" UNIQUE("subscription_id"),
	CONSTRAINT "polar_live_purchases_monthly_order_id_unique" UNIQUE("monthly_order_id")
);
--> statement-breakpoint
CREATE TABLE "visitor_pageviews" (
	"page_view_id" uuid PRIMARY KEY NOT NULL,
	"visitor_id" uuid NOT NULL,
	"path" text NOT NULL,
	"country" text DEFAULT 'XX' NOT NULL,
	"device" text DEFAULT 'unknown' NOT NULL,
	"browser" text DEFAULT 'other' NOT NULL,
	"language" text DEFAULT 'other' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_users" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"username" text NOT NULL,
	"username_normalized" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sign_in_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "renewal_deliveries" ADD CONSTRAINT "renewal_deliveries_device_id_renewal_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."renewal_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_deliveries" ADD CONSTRAINT "renewal_deliveries_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_devices" ADD CONSTRAINT "renewal_devices_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "polar_sandbox_checkout_user_idx" ON "polar_sandbox_checkouts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "polar_live_events_pending_idx" ON "polar_live_events" USING btree ("state","received_at");--> statement-breakpoint
CREATE INDEX "polar_live_purchases_user_idx" ON "polar_live_purchases" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "polar_live_purchases_due_idx" ON "polar_live_purchases" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "visitor_pageviews_created_idx" ON "visitor_pageviews" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "visitor_pageviews_visitor_created_idx" ON "visitor_pageviews" USING btree ("visitor_id","created_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_user_idx" ON "auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_sessions_expiry_idx" ON "auth_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_users_username_normalized_idx" ON "auth_users" USING btree ("username_normalized");