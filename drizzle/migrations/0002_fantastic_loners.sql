CREATE TABLE push_notifications (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"user_id" integer,
	"title" varchar(255) NOT NULL,
	"body" varchar(1000) NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"image_url" varchar(500),
	"target_type" varchar(20) NOT NULL,
	"target_user_ids" jsonb DEFAULT '[]'::jsonb,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" varchar(1000),
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "push_device_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"app_id" integer NOT NULL,
	"token" varchar(500) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"device_id" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"last_used_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "push_device_tokens_user_id_app_id_token_unique" UNIQUE("user_id","app_id","token")
);
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "fcm_project_id" varchar(255);--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "fcm_private_key" varchar;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "fcm_client_email" varchar(255);--> statement-breakpoint
CREATE INDEX "idx_push_notifications_app_id" ON push_notifications USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "idx_push_notifications_user_id" ON push_notifications USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_push_notifications_status" ON push_notifications USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_push_notifications_created_at" ON push_notifications USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_push_device_tokens_user_id" ON "push_device_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_push_device_tokens_app_id" ON "push_device_tokens" USING btree ("app_id");--> statement-breakpoint
CREATE INDEX "idx_push_device_tokens_token" ON "push_device_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_push_device_tokens_is_active" ON "push_device_tokens" USING btree ("is_active");