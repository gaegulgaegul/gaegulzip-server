import { logger } from '../../utils/logger';

/**
 * 디바이스 토큰 등록 로그 (INFO)
 */
export const deviceRegistered = (data: {
  userId: number;
  appId: number;
  platform: string;
  deviceId?: string;
}) => {
  logger.info(
    {
      userId: data.userId,
      appId: data.appId,
      platform: data.platform,
      deviceId: data.deviceId,
    },
    'Device token registered'
  );
};

/**
 * 디바이스 토큰 비활성화 로그 (INFO)
 */
export const deviceDeactivated = (data: {
  deviceId: number;
  userId: number;
  appId: number;
}) => {
  logger.info(
    {
      deviceId: data.deviceId,
      userId: data.userId,
      appId: data.appId,
    },
    'Device token deactivated'
  );
};

/**
 * 푸시 발송 성공 로그 (INFO)
 */
export const pushSent = (data: {
  alertId: number;
  appId: number;
  targetType: string;
  sentCount: number;
  failedCount: number;
}) => {
  logger.info(
    {
      alertId: data.alertId,
      appId: data.appId,
      targetType: data.targetType,
      sentCount: data.sentCount,
      failedCount: data.failedCount,
    },
    'Push notification sent'
  );
};

/**
 * 푸시 발송 실패 로그 (ERROR)
 */
export const pushFailed = (data: {
  alertId: number;
  appId: number;
  targetType: string;
  error: string;
}) => {
  logger.error(
    {
      alertId: data.alertId,
      appId: data.appId,
      targetType: data.targetType,
      error: data.error,
    },
    'Push notification failed'
  );
};

/**
 * Invalid Token 감지 로그 (WARN)
 */
export const invalidTokenDetected = (data: {
  token: string;
  appId: number;
  userId?: number;
}) => {
  logger.warn(
    {
      token: data.token.substring(0, 20) + '...', // 토큰 일부만 로깅
      appId: data.appId,
      userId: data.userId,
    },
    'Invalid FCM token detected and deactivated'
  );
};
