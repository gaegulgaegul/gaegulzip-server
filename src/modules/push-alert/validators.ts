import { z } from 'zod';

/**
 * 플랫폼 타입
 */
export const Platform = z.enum(['ios', 'android', 'web']);
export type Platform = z.infer<typeof Platform>;

/**
 * 디바이스 토큰 등록 요청 스키마
 */
export const registerDeviceSchema = z.object({
  token: z.string().min(1, 'Token is required').max(500, 'Token is too long'),
  platform: Platform,
  deviceId: z.string().max(255).optional(),
});

export type RegisterDeviceRequest = z.infer<typeof registerDeviceSchema>;

/**
 * 푸시 발송 요청 스키마 (복잡한 조건 검증)
 */
export const sendPushSchema = z
  .object({
    appCode: z.string().min(1, 'App code is required'),
    userId: z.number().int().positive().optional(),
    userIds: z.array(z.number().int().positive()).optional(),
    targetType: z.enum(['single', 'multiple', 'all']).optional(),
    title: z.string().min(1, 'Title is required').max(255, 'Title is too long'),
    body: z.string().min(1, 'Body is required').max(1000, 'Body is too long'),
    data: z.record(z.string(), z.any()).optional(),
    imageUrl: z.string().url({ message: 'Invalid image URL' }).max(500).optional(),
  })
  .refine(
    (data) => {
      // userId가 있으면 single
      if (data.userId !== undefined) {
        return data.userIds === undefined && data.targetType === undefined;
      }
      // userIds가 있으면 multiple
      if (data.userIds !== undefined && data.userIds.length > 0) {
        return data.userId === undefined && data.targetType === undefined;
      }
      // targetType=all이면 userId, userIds 없어야 함
      if (data.targetType === 'all') {
        return data.userId === undefined && data.userIds === undefined;
      }
      return false;
    },
    'Must specify either userId, userIds, or targetType=all'
  );

export type SendPushRequest = z.infer<typeof sendPushSchema>;

/**
 * Alert 목록 조회 요청 스키마
 */
export const listAlertsSchema = z.object({
  appCode: z.string().min(1, 'App code is required'),
  limit: z.coerce.number().int().positive().max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type ListAlertsQuery = z.infer<typeof listAlertsSchema>;
