import { Request, Response } from 'express';
import { registerDeviceSchema, sendPushSchema, listAlertsSchema } from './validators';
import {
  upsertDevice,
  findDevicesByUserId,
  deactivateDevice as deactivateDeviceService,
  createAlert,
  updateAlertStatus,
  findAlerts as findAlertsService,
  findAlertById,
  findActiveDevicesByUserIds,
  getAllActiveUserIds,
  deactivateDeviceByToken,
} from './services';
import { findAppByCode } from '../auth/services';
import { getFCMInstance, sendToMultipleDevices, FCMMessage } from './fcm';
import * as pushProbe from './push.probe';
import { NotFoundException, BusinessException } from '../../utils/errors';
import { logger } from '../../utils/logger';

/**
 * 디바이스 토큰 등록 핸들러 (인증 필요)
 * @param req - Express 요청 객체 (body: { token, platform, deviceId? }, user: { userId, appId })
 * @param res - Express 응답 객체
 * @returns 201: 등록된 디바이스 정보
 */
export const registerDevice = async (req: Request, res: Response) => {
  const { token, platform, deviceId } = registerDeviceSchema.parse(req.body);
  const { userId, appId } = (req as any).user as { userId: number; appId: number };

  logger.debug({ userId, appId, platform }, 'Registering device token');

  const device = await upsertDevice({
    userId,
    appId,
    token,
    platform,
    deviceId,
  });

  pushProbe.deviceRegistered({
    userId,
    appId,
    platform,
    deviceId,
  });

  res.status(201).json({
    id: device.id,
    token: device.token,
    platform: device.platform,
    isActive: device.isActive,
    lastUsedAt: device.lastUsedAt,
    createdAt: device.createdAt,
  });
};

/**
 * 사용자의 디바이스 목록 조회 핸들러 (인증 필요)
 * @param req - Express 요청 객체 (user: { userId, appId })
 * @param res - Express 응답 객체
 * @returns 200: 디바이스 목록
 */
export const listDevices = async (req: Request, res: Response) => {
  const { userId, appId } = (req as any).user as { userId: number; appId: number };

  const devices = await findDevicesByUserId(userId, appId);

  res.json({
    devices: devices.map((d) => ({
      id: d.id,
      token: d.token,
      platform: d.platform,
      isActive: d.isActive,
      lastUsedAt: d.lastUsedAt,
      createdAt: d.createdAt,
    })),
  });
};

/**
 * 디바이스 토큰 비활성화 핸들러 (인증 필요)
 * @param req - Express 요청 객체 (params: { id }, user: { userId, appId })
 * @param res - Express 응답 객체
 * @returns 204: No Content
 */
export const deactivateDevice = async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  const { userId, appId } = (req as any).user as { userId: number; appId: number };

  const device = await deactivateDeviceService(id, userId, appId);

  if (!device) {
    throw new NotFoundException('Device', id);
  }

  pushProbe.deviceDeactivated({
    deviceId: id,
    userId,
    appId,
  });

  res.status(204).send();
};

/**
 * 푸시 알림 발송 핸들러 (관리자용)
 * @param req - Express 요청 객체 (body: { appCode, userId?, userIds?, targetType?, title, body, data?, imageUrl? })
 * @param res - Express 응답 객체
 * @returns 200: 발송 결과
 */
export const sendPush = async (req: Request, res: Response) => {
  const validatedData = sendPushSchema.parse(req.body);
  const { appCode, title, body, data, imageUrl } = validatedData;

  logger.debug(validatedData, 'Sending push notification');

  // 1. 앱 조회
  const app = await findAppByCode(appCode);
  if (!app) {
    throw new NotFoundException('App', appCode);
  }

  // 2. 타겟 결정
  let targetType: string;
  let targetUserIds: number[] = [];
  let userId: number | undefined;

  if ('userId' in validatedData && validatedData.userId !== undefined) {
    targetType = 'single';
    userId = validatedData.userId;
    targetUserIds = [validatedData.userId];
  } else if ('userIds' in validatedData && validatedData.userIds !== undefined) {
    targetType = 'multiple';
    targetUserIds = validatedData.userIds;
  } else if ('targetType' in validatedData && validatedData.targetType === 'all') {
    targetType = 'all';
    // 전체 사용자 조회
    targetUserIds = await getAllActiveUserIds(app.id);
  } else {
    throw new BusinessException('Invalid target specification', 'INVALID_TARGET_SPECIFICATION');
  }

  // 3. Alert 레코드 생성
  const alert = await createAlert({
    appId: app.id,
    userId,
    title,
    body,
    data,
    imageUrl,
    targetType,
    targetUserIds: targetType === 'multiple' || targetType === 'all' ? targetUserIds : [],
  });

  try {
    // 4. 대상 사용자들의 활성 디바이스 토큰 조회
    const devices = await findActiveDevicesByUserIds(targetUserIds, app.id);

    if (devices.length === 0) {
      // 디바이스가 없는 경우
      await updateAlertStatus(alert.id, {
        status: 'completed',
        sentCount: 0,
        failedCount: 0,
        errorMessage: 'No active devices found',
      });

      return res.json({
        alertId: alert.id,
        sentCount: 0,
        failedCount: 0,
        status: 'completed',
      });
    }

    // 5. FCM 인스턴스 생성
    const fcmInstance = getFCMInstance({
      id: app.id,
      fcmProjectId: app.fcmProjectId,
      fcmPrivateKey: app.fcmPrivateKey,
      fcmClientEmail: app.fcmClientEmail,
    });

    // 6. 메시지 발송
    const tokens = devices.map((d) => d.token);
    const message: FCMMessage = {
      title,
      body,
      data,
      imageUrl,
    };

    const result = await sendToMultipleDevices(fcmInstance, tokens, message);

    // 7. Invalid token 처리
    if (result.invalidTokens.length > 0) {
      for (const invalidToken of result.invalidTokens) {
        await deactivateDeviceByToken(invalidToken, app.id);
        pushProbe.invalidTokenDetected({
          token: invalidToken,
          appId: app.id,
        });
      }
    }

    // 8. Alert 상태 업데이트
    await updateAlertStatus(alert.id, {
      status: 'completed',
      sentCount: result.successCount,
      failedCount: result.failureCount,
    });

    pushProbe.pushSent({
      alertId: alert.id,
      appId: app.id,
      targetType,
      sentCount: result.successCount,
      failedCount: result.failureCount,
    });

    res.json({
      alertId: alert.id,
      sentCount: result.successCount,
      failedCount: result.failureCount,
      status: 'completed',
    });
  } catch (error: any) {
    // 발송 실패
    await updateAlertStatus(alert.id, {
      status: 'failed',
      sentCount: 0,
      failedCount: targetUserIds.length,
      errorMessage: error.message,
    });

    pushProbe.pushFailed({
      alertId: alert.id,
      appId: app.id,
      targetType,
      error: error.message,
    });

    throw error;
  }
};

/**
 * 푸시 알림 이력 조회 핸들러
 * @param req - Express 요청 객체 (query: { appCode, limit?, offset? })
 * @param res - Express 응답 객체
 * @returns 200: Alert 목록
 */
export const listAlerts = async (req: Request, res: Response) => {
  const { appCode, limit, offset } = listAlertsSchema.parse(req.query);

  const app = await findAppByCode(appCode);
  if (!app) {
    throw new NotFoundException('App', appCode);
  }

  const alerts = await findAlertsService(app.id, limit, offset);

  res.json({
    alerts: alerts.map((a) => ({
      id: a.id,
      title: a.title,
      targetType: a.targetType,
      sentCount: a.sentCount,
      failedCount: a.failedCount,
      status: a.status,
      sentAt: a.sentAt,
      createdAt: a.createdAt,
    })),
    total: alerts.length,
  });
};

/**
 * 푸시 알림 상세 조회 핸들러
 * @param req - Express 요청 객체 (params: { id }, query: { appCode })
 * @param res - Express 응답 객체
 * @returns 200: Alert 상세 정보
 */
export const getAlert = async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  const appCode = req.query.appCode as string;

  if (!appCode) {
    throw new BusinessException('App code is required', 'VALIDATION_ERROR');
  }

  const app = await findAppByCode(appCode);
  if (!app) {
    throw new NotFoundException('App', appCode);
  }

  const alert = await findAlertById(id, app.id);

  if (!alert) {
    throw new NotFoundException('Alert', id);
  }

  res.json({
    id: alert.id,
    title: alert.title,
    body: alert.body,
    data: alert.data,
    imageUrl: alert.imageUrl,
    targetType: alert.targetType,
    targetUserIds: alert.targetUserIds,
    sentCount: alert.sentCount,
    failedCount: alert.failedCount,
    status: alert.status,
    errorMessage: alert.errorMessage,
    sentAt: alert.sentAt,
    createdAt: alert.createdAt,
  });
};
