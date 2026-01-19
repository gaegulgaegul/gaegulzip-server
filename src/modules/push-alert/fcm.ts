import * as admin from 'firebase-admin';
import { BusinessException } from '../../utils/errors';

/**
 * FCM 인스턴스 캐시 (앱별로 재사용)
 */
const fcmInstanceCache = new Map<number, admin.app.App>();

/**
 * 앱 정보 타입
 */
interface AppConfig {
  id: number;
  fcmProjectId: string | null;
  fcmPrivateKey: string | null;
  fcmClientEmail: string | null;
}

/**
 * FCM 메시지 페이로드
 */
export interface FCMMessage {
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

/**
 * FCM 발송 결과
 */
export interface FCMSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  isInvalidToken?: boolean;
}

/**
 * FCM 다중 발송 결과
 */
export interface FCMMulticastResult {
  successCount: number;
  failureCount: number;
  results: FCMSendResult[];
  invalidTokens: string[];
}

/**
 * 앱별 FCM 인스턴스를 반환합니다 (캐싱 적용)
 */
export const getFCMInstance = (app: AppConfig): admin.app.App => {
  // FCM 설정 확인
  if (!app.fcmProjectId || !app.fcmPrivateKey || !app.fcmClientEmail) {
    throw new BusinessException('FCM이 설정되지 않은 앱입니다', 'FCM_NOT_CONFIGURED');
  }

  // 캐시에서 확인
  if (fcmInstanceCache.has(app.id)) {
    return fcmInstanceCache.get(app.id)!;
  }

  // Service Account JSON 파싱
  let serviceAccount: admin.ServiceAccount;
  try {
    const privateKeyJson = JSON.parse(app.fcmPrivateKey);
    serviceAccount = {
      projectId: app.fcmProjectId,
      privateKey: privateKeyJson.private_key,
      clientEmail: app.fcmClientEmail,
    };
  } catch (error) {
    throw new BusinessException('FCM Private Key JSON 파싱 실패', 'FCM_NOT_CONFIGURED');
  }

  // Firebase Admin 초기화
  const appName = `app-${app.id}`;
  const fcmApp = admin.initializeApp(
    {
      credential: admin.credential.cert(serviceAccount),
      projectId: app.fcmProjectId,
    },
    appName
  );

  // 캐시에 저장
  fcmInstanceCache.set(app.id, fcmApp);

  return fcmApp;
};

/**
 * FCM data 필드를 문자열로 변환 (FCM 요구사항)
 */
const convertDataToStringRecord = (data?: Record<string, any>): Record<string, string> | undefined => {
  if (!data || Object.keys(data).length === 0) {
    return undefined;
  }

  const stringData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data)) {
    stringData[key] = typeof value === 'string' ? value : JSON.stringify(value);
  }

  return stringData;
};

/**
 * 단일 디바이스에 푸시 알림 발송
 */
export const sendToDevice = async (
  fcmInstance: admin.app.App,
  token: string,
  message: FCMMessage
): Promise<FCMSendResult> => {
  try {
    const payload: admin.messaging.Message = {
      token,
      notification: {
        title: message.title,
        body: message.body,
        ...(message.imageUrl && { imageUrl: message.imageUrl }),
      },
      data: convertDataToStringRecord(message.data),
    };

    const messageId = await fcmInstance.messaging().send(payload);

    return {
      success: true,
      messageId,
    };
  } catch (error: any) {
    const errorCode = error?.code || '';
    const isInvalidToken =
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/registration-token-not-registered';

    return {
      success: false,
      error: error?.message || 'Unknown error',
      isInvalidToken,
    };
  }
};

/**
 * 여러 디바이스에 푸시 알림 발송 (최대 500개)
 */
export const sendToMultipleDevices = async (
  fcmInstance: admin.app.App,
  tokens: string[],
  message: FCMMessage
): Promise<FCMMulticastResult> => {
  if (tokens.length === 0) {
    return {
      successCount: 0,
      failureCount: 0,
      results: [],
      invalidTokens: [],
    };
  }

  // FCM multicast는 최대 500개 토큰 지원
  if (tokens.length > 500) {
    throw new BusinessException('한 번에 최대 500개 토큰까지 발송 가능합니다', 'PUSH_SEND_FAILED');
  }

  try {
    const payload: admin.messaging.MulticastMessage = {
      tokens,
      notification: {
        title: message.title,
        body: message.body,
        ...(message.imageUrl && { imageUrl: message.imageUrl }),
      },
      data: convertDataToStringRecord(message.data),
    };

    const response = await fcmInstance.messaging().sendEachForMulticast(payload);

    const results: FCMSendResult[] = [];
    const invalidTokens: string[] = [];

    response.responses.forEach((resp, index) => {
      if (resp.success) {
        results.push({
          success: true,
          messageId: resp.messageId,
        });
      } else {
        const errorCode = resp.error?.code || '';
        const isInvalidToken =
          errorCode === 'messaging/invalid-registration-token' ||
          errorCode === 'messaging/registration-token-not-registered';

        if (isInvalidToken) {
          invalidTokens.push(tokens[index]);
        }

        results.push({
          success: false,
          error: resp.error?.message || 'Unknown error',
          isInvalidToken,
        });
      }
    });

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      results,
      invalidTokens,
    };
  } catch (error: any) {
    throw new BusinessException(`푸시 발송 실패: ${error?.message}`, 'PUSH_SEND_FAILED');
  }
};
