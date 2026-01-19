import { pgTable, serial, varchar, boolean, timestamp, integer, jsonb, unique, index } from 'drizzle-orm/pg-core';

/**
 * 앱 테이블 (멀티 OAuth 제공자 크레덴셜 관리)
 */
export const apps = pgTable('apps', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),

  // 카카오 OAuth
  kakaoRestApiKey: varchar('kakao_rest_api_key', { length: 255 }),
  kakaoClientSecret: varchar('kakao_client_secret', { length: 255 }),

  // 네이버 OAuth (향후)
  naverClientId: varchar('naver_client_id', { length: 255 }),
  naverClientSecret: varchar('naver_client_secret', { length: 255 }),

  // 구글 OAuth (향후)
  googleClientId: varchar('google_client_id', { length: 255 }),
  googleClientSecret: varchar('google_client_secret', { length: 255 }),

  // 애플 OAuth (향후)
  appleClientId: varchar('apple_client_id', { length: 255 }),
  appleTeamId: varchar('apple_team_id', { length: 255 }),
  appleKeyId: varchar('apple_key_id', { length: 255 }),
  applePrivateKey: varchar('apple_private_key'),

  // Firebase Cloud Messaging (FCM)
  /** Firebase 프로젝트 ID */
  fcmProjectId: varchar('fcm_project_id', { length: 255 }),
  /** Firebase Service Account Private Key (JSON 문자열) */
  fcmPrivateKey: varchar('fcm_private_key'),
  /** Firebase Service Account Client Email */
  fcmClientEmail: varchar('fcm_client_email', { length: 255 }),

  jwtSecret: varchar('jwt_secret', { length: 255 }).notNull(),
  jwtExpiresIn: varchar('jwt_expires_in', { length: 20 }).notNull().default('7d'),

  /** Access Token 만료 시간 (기본: 30분) */
  accessTokenExpiresIn: varchar('access_token_expires_in', { length: 20 }).notNull().default('30m'),
  /** Refresh Token 만료 시간 (기본: 14일) */
  refreshTokenExpiresIn: varchar('refresh_token_expires_in', { length: 20 }).notNull().default('14d'),

  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * 사용자 테이블 (멀티 제공자 통합 관리)
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  appId: integer('app_id').notNull(),

  provider: varchar('provider', { length: 20 }).notNull(), // 'kakao' | 'naver' | 'google' | 'apple'
  providerId: varchar('provider_id', { length: 100 }).notNull(),

  email: varchar('email', { length: 255 }),
  nickname: varchar('nickname', { length: 255 }),
  profileImage: varchar('profile_image', { length: 500 }),

  appMetadata: jsonb('app_metadata').default({}),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueProviderUser: unique().on(table.appId, table.provider, table.providerId),
}));

/**
 * Refresh Token 저장소 (Token Rotation 및 Reuse Detection 지원)
 */
export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  /** bcrypt 해시된 Refresh Token (보안) */
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  /** 사용자 ID (외래키, FK 제약조건 없음) */
  userId: integer('user_id').notNull(),
  /** 앱 ID (외래키, FK 제약조건 없음) */
  appId: integer('app_id').notNull(),
  /** JWT ID (고유 식별자, UUID v4) */
  jti: varchar('jti', { length: 36 }).notNull().unique(),
  /** Token Family ID (Rotation 추적, UUID v4) */
  tokenFamily: varchar('token_family', { length: 36 }).notNull(),
  /** 만료 시간 (14일) */
  expiresAt: timestamp('expires_at').notNull(),
  /** 무효화 여부 (Rotation 시 true) */
  revoked: boolean('revoked').notNull().default(false),
  /** 무효화 시간 (Reuse Detection 시 Grace Period 계산) */
  revokedAt: timestamp('revoked_at'),
  /** 생성 시간 */
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  tokenHashIdx: index('idx_refresh_tokens_token_hash').on(table.tokenHash),
  userIdIdx: index('idx_refresh_tokens_user_id').on(table.userId),
  expiresAtIdx: index('idx_refresh_tokens_expires_at').on(table.expiresAt),
  tokenFamilyIdx: index('idx_refresh_tokens_token_family').on(table.tokenFamily),
}));
