CREATE TABLE "apps" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(255) NOT NULL,
	"kakao_rest_api_key" varchar(255),
	"kakao_client_secret" varchar(255),
	"naver_client_id" varchar(255),
	"naver_client_secret" varchar(255),
	"google_client_id" varchar(255),
	"google_client_secret" varchar(255),
	"apple_client_id" varchar(255),
	"apple_team_id" varchar(255),
	"apple_key_id" varchar(255),
	"apple_private_key" varchar,
	"jwt_secret" varchar(255) NOT NULL,
	"jwt_expires_in" varchar(20) DEFAULT '7d' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "apps_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" integer NOT NULL,
	"provider" varchar(20) NOT NULL,
	"provider_id" varchar(100) NOT NULL,
	"email" varchar(255),
	"nickname" varchar(255),
	"profile_image" varchar(500),
	"app_metadata" jsonb DEFAULT '{}'::jsonb,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_app_id_provider_provider_id_unique" UNIQUE("app_id","provider","provider_id")
);
--> statement-breakpoint
COMMENT ON TABLE "apps" IS '앱 테이블 - 멀티 OAuth 제공자 크레덴셜 관리';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."id" IS '앱 ID (Primary Key)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."code" IS '앱 식별 코드 (예: gaegulzip-ios)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."name" IS '앱 이름';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."kakao_rest_api_key" IS '카카오 REST API 키';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."kakao_client_secret" IS '카카오 클라이언트 시크릿';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."naver_client_id" IS '네이버 클라이언트 ID (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."naver_client_secret" IS '네이버 클라이언트 시크릿 (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."google_client_id" IS '구글 클라이언트 ID (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."google_client_secret" IS '구글 클라이언트 시크릿 (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."apple_client_id" IS '애플 클라이언트 ID (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."apple_team_id" IS '애플 팀 ID (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."apple_key_id" IS '애플 키 ID (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."apple_private_key" IS '애플 Private Key (향후 사용)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."jwt_secret" IS '앱별 JWT 시크릿 (최소 32자)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."jwt_expires_in" IS 'JWT 만료 시간 (기본: 7d)';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."is_active" IS '앱 활성화 여부';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."created_at" IS '생성 일시';
--> statement-breakpoint
COMMENT ON COLUMN "apps"."updated_at" IS '수정 일시';
--> statement-breakpoint
COMMENT ON TABLE "users" IS '사용자 테이블 - 멀티 제공자 통합 관리';
--> statement-breakpoint
COMMENT ON COLUMN "users"."id" IS '사용자 ID (Primary Key)';
--> statement-breakpoint
COMMENT ON COLUMN "users"."app_id" IS '소속 앱 ID (Foreign Key)';
--> statement-breakpoint
COMMENT ON COLUMN "users"."provider" IS 'OAuth 제공자 (kakao, naver, google, apple)';
--> statement-breakpoint
COMMENT ON COLUMN "users"."provider_id" IS '제공자별 사용자 고유 ID';
--> statement-breakpoint
COMMENT ON COLUMN "users"."email" IS '이메일';
--> statement-breakpoint
COMMENT ON COLUMN "users"."nickname" IS '닉네임';
--> statement-breakpoint
COMMENT ON COLUMN "users"."profile_image" IS '프로필 이미지 URL';
--> statement-breakpoint
COMMENT ON COLUMN "users"."app_metadata" IS '앱별 추가 정보 (JSON)';
--> statement-breakpoint
COMMENT ON COLUMN "users"."last_login_at" IS '마지막 로그인 일시';
--> statement-breakpoint
COMMENT ON COLUMN "users"."created_at" IS '생성 일시';
--> statement-breakpoint
COMMENT ON COLUMN "users"."updated_at" IS '수정 일시';