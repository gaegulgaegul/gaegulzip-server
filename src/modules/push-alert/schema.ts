import { pgTable, serial, varchar, boolean, timestamp, integer, jsonb, unique, index } from 'drizzle-orm/pg-core';

/**
 * 푸시 디바이스 토큰 테이블 (FCM 토큰 저장)
 */
export const pushDeviceTokens = pgTable('push_device_tokens', {
  /** 고유 ID */
  id: serial('id').primaryKey(),
  /** 사용자 ID (외래키, FK 제약조건 없음) */
  userId: integer('user_id').notNull(),
  /** 앱 ID (외래키, FK 제약조건 없음) */
  appId: integer('app_id').notNull(),
  /** FCM 디바이스 토큰 */
  token: varchar('token', { length: 500 }).notNull(),
  /** 플랫폼 (ios, android, web) */
  platform: varchar('platform', { length: 20 }).notNull(),
  /** 디바이스 고유 ID (선택) */
  deviceId: varchar('device_id', { length: 255 }),
  /** 활성 상태 (FCM에서 invalid token 시 false) */
  isActive: boolean('is_active').notNull().default(true),
  /** 마지막 사용 시간 */
  lastUsedAt: timestamp('last_used_at').defaultNow(),
  /** 생성 시간 */
  createdAt: timestamp('created_at').defaultNow(),
  /** 수정 시간 */
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueUserToken: unique().on(table.userId, table.appId, table.token),
  userIdIdx: index('idx_push_device_tokens_user_id').on(table.userId),
  appIdIdx: index('idx_push_device_tokens_app_id').on(table.appId),
  tokenIdx: index('idx_push_device_tokens_token').on(table.token),
  isActiveIdx: index('idx_push_device_tokens_is_active').on(table.isActive),
}));

/**
 * 푸시 알림 발송 이력 테이블
 */
export const pushAlerts = pgTable('push_alerts', {
  /** 고유 ID */
  id: serial('id').primaryKey(),
  /** 앱 ID (외래키, FK 제약조건 없음) */
  appId: integer('app_id').notNull(),
  /** 단일 사용자 ID (null = 전체/그룹 발송) */
  userId: integer('user_id'),
  /** 알림 제목 */
  title: varchar('title', { length: 255 }).notNull(),
  /** 알림 본문 */
  body: varchar('body', { length: 1000 }).notNull(),
  /** 커스텀 데이터 (JSON) */
  data: jsonb('data').default({}),
  /** 이미지 URL (선택) */
  imageUrl: varchar('image_url', { length: 500 }),
  /** 타겟 타입 (single, multiple, all) */
  targetType: varchar('target_type', { length: 20 }).notNull(),
  /** 타겟 사용자 ID 목록 (multiple 타입인 경우) */
  targetUserIds: jsonb('target_user_ids').default([]),
  /** 발송 성공 개수 */
  sentCount: integer('sent_count').notNull().default(0),
  /** 발송 실패 개수 */
  failedCount: integer('failed_count').notNull().default(0),
  /** 발송 상태 (pending, completed, failed) */
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  /** 에러 메시지 (실패 시) */
  errorMessage: varchar('error_message', { length: 1000 }),
  /** 발송 완료 시간 */
  sentAt: timestamp('sent_at'),
  /** 생성 시간 */
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  appIdIdx: index('idx_push_alerts_app_id').on(table.appId),
  userIdIdx: index('idx_push_alerts_user_id').on(table.userId),
  statusIdx: index('idx_push_alerts_status').on(table.status),
  createdAtIdx: index('idx_push_alerts_created_at').on(table.createdAt),
}));
