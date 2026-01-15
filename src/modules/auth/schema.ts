import { pgTable, serial, varchar, boolean, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';

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

  jwtSecret: varchar('jwt_secret', { length: 255 }).notNull(),
  jwtExpiresIn: varchar('jwt_expires_in', { length: 20 }).notNull().default('7d'),
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
