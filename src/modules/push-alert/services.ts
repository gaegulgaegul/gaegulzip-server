import { db } from '../../config/database';
import { pushDeviceTokens, pushAlerts } from './schema';
import { users } from '../auth/schema';
import { eq, and, inArray, desc } from 'drizzle-orm';

/**
 * 디바이스 토큰 등록 또는 업데이트
 */
export const upsertDevice = async (data: {
  userId: number;
  appId: number;
  token: string;
  platform: string;
  deviceId?: string;
}) => {
  const now = new Date();

  // 기존 토큰 조회
  const existing = await db
    .select()
    .from(pushDeviceTokens)
    .where(
      and(
        eq(pushDeviceTokens.userId, data.userId),
        eq(pushDeviceTokens.appId, data.appId),
        eq(pushDeviceTokens.token, data.token)
      )
    )
    .limit(1);

  if (existing[0]) {
    // Update
    const updated = await db
      .update(pushDeviceTokens)
      .set({
        platform: data.platform,
        deviceId: data.deviceId,
        isActive: true,
        lastUsedAt: now,
        updatedAt: now,
      })
      .where(eq(pushDeviceTokens.id, existing[0].id))
      .returning();

    return updated[0];
  }

  // Insert
  const inserted = await db
    .insert(pushDeviceTokens)
    .values({
      userId: data.userId,
      appId: data.appId,
      token: data.token,
      platform: data.platform,
      deviceId: data.deviceId,
      isActive: true,
      lastUsedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return inserted[0];
};

/**
 * 사용자의 디바이스 목록 조회
 */
export const findDevicesByUserId = async (userId: number, appId: number) => {
  return await db
    .select()
    .from(pushDeviceTokens)
    .where(and(eq(pushDeviceTokens.userId, userId), eq(pushDeviceTokens.appId, appId)))
    .orderBy(desc(pushDeviceTokens.lastUsedAt));
};

/**
 * 다중 사용자의 활성 디바이스 조회
 */
export const findActiveDevicesByUserIds = async (userIds: number[], appId: number) => {
  if (userIds.length === 0) {
    return [];
  }

  return await db
    .select()
    .from(pushDeviceTokens)
    .where(
      and(
        inArray(pushDeviceTokens.userId, userIds),
        eq(pushDeviceTokens.appId, appId),
        eq(pushDeviceTokens.isActive, true)
      )
    );
};

/**
 * 디바이스 비활성화
 */
export const deactivateDevice = async (id: number, userId: number, appId: number) => {
  const updated = await db
    .update(pushDeviceTokens)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pushDeviceTokens.id, id),
        eq(pushDeviceTokens.userId, userId),
        eq(pushDeviceTokens.appId, appId)
      )
    )
    .returning();

  return updated[0] || null;
};

/**
 * 토큰으로 디바이스 비활성화 (FCM에서 invalid token 감지 시)
 */
export const deactivateDeviceByToken = async (token: string, appId: number) => {
  await db
    .update(pushDeviceTokens)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(and(eq(pushDeviceTokens.token, token), eq(pushDeviceTokens.appId, appId)));
};

/**
 * Alert 레코드 생성
 */
export const createAlert = async (data: {
  appId: number;
  userId?: number;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
  targetType: string;
  targetUserIds?: number[];
}) => {
  const inserted = await db
    .insert(pushAlerts)
    .values({
      appId: data.appId,
      userId: data.userId,
      title: data.title,
      body: data.body,
      data: data.data || {},
      imageUrl: data.imageUrl,
      targetType: data.targetType,
      targetUserIds: data.targetUserIds || [],
      status: 'pending',
      sentCount: 0,
      failedCount: 0,
      createdAt: new Date(),
    })
    .returning();

  return inserted[0];
};

/**
 * Alert 상태 업데이트
 */
export const updateAlertStatus = async (
  id: number,
  data: {
    status: string;
    sentCount: number;
    failedCount: number;
    errorMessage?: string;
  }
) => {
  const updated = await db
    .update(pushAlerts)
    .set({
      status: data.status,
      sentCount: data.sentCount,
      failedCount: data.failedCount,
      errorMessage: data.errorMessage,
      sentAt: data.status === 'completed' ? new Date() : undefined,
    })
    .where(eq(pushAlerts.id, id))
    .returning();

  return updated[0];
};

/**
 * Alert 목록 조회 (페이지네이션)
 */
export const findAlerts = async (appId: number, limit: number = 50, offset: number = 0) => {
  const results = await db
    .select()
    .from(pushAlerts)
    .where(eq(pushAlerts.appId, appId))
    .orderBy(desc(pushAlerts.createdAt))
    .limit(limit)
    .offset(offset);

  return results;
};

/**
 * 단일 Alert 조회
 */
export const findAlertById = async (id: number, appId: number) => {
  const result = await db
    .select()
    .from(pushAlerts)
    .where(and(eq(pushAlerts.id, id), eq(pushAlerts.appId, appId)))
    .limit(1);

  return result[0] || null;
};

/**
 * 전체 발송용: 앱의 모든 활성 사용자 ID 목록 조회
 */
export const getAllActiveUserIds = async (appId: number): Promise<number[]> => {
  const result = await db
    .select({ userId: users.id })
    .from(users)
    .where(eq(users.appId, appId));

  return result.map((row) => row.userId);
};
