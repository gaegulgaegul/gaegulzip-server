CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"user_id" integer NOT NULL,
	"app_id" integer NOT NULL,
	"jti" varchar(36) NOT NULL,
	"token_family" varchar(36) NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "refresh_tokens_jti_unique" UNIQUE("jti")
);
--> statement-breakpoint
COMMENT ON TABLE "refresh_tokens" IS 'Refresh Token 저장소 (Token Rotation 및 Reuse Detection 지원)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."token_hash" IS 'bcrypt 해시된 Refresh Token (보안)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."user_id" IS '사용자 ID (외래키, FK 제약조건 없음)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."app_id" IS '앱 ID (외래키, FK 제약조건 없음)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."jti" IS 'JWT ID (고유 식별자, UUID v4)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."token_family" IS 'Token Family ID (Rotation 추적, UUID v4)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."expires_at" IS '만료 시간 (14일)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."revoked" IS '무효화 여부 (Rotation 시 true)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."revoked_at" IS '무효화 시간 (Reuse Detection 시 Grace Period 계산)';
--> statement-breakpoint
COMMENT ON COLUMN "refresh_tokens"."created_at" IS '생성 시간';
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_app_id_apps_id_fk";
--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "access_token_expires_in" varchar(20) DEFAULT '30m' NOT NULL;--> statement-breakpoint
ALTER TABLE "apps" ADD COLUMN "refresh_token_expires_in" varchar(20) DEFAULT '14d' NOT NULL;--> statement-breakpoint
COMMENT ON COLUMN "apps"."access_token_expires_in" IS 'Access Token 만료 시간 (기본: 30분)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."refresh_token_expires_in" IS 'Refresh Token 만료 시간 (기본: 14일)';
--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_token_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_expires_at" ON "refresh_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_refresh_tokens_token_family" ON "refresh_tokens" USING btree ("token_family");