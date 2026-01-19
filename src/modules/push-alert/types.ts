/**
 * 디바이스 토큰 등록 요청
 */
export interface RegisterDeviceRequest {
  token: string;
  platform: 'ios' | 'android' | 'web';
  deviceId?: string;
}

/**
 * 디바이스 토큰 응답
 */
export interface DeviceTokenResponse {
  id: number;
  token: string;
  platform: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date | null;
}

/**
 * 디바이스 목록 응답
 */
export interface DeviceListResponse {
  devices: DeviceTokenResponse[];
}

/**
 * 푸시 발송 요청 (단일)
 */
export interface SendPushSingleRequest {
  appCode: string;
  userId: number;
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

/**
 * 푸시 발송 요청 (다중)
 */
export interface SendPushMultipleRequest {
  appCode: string;
  userIds: number[];
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

/**
 * 푸시 발송 요청 (전체)
 */
export interface SendPushAllRequest {
  appCode: string;
  targetType: 'all';
  title: string;
  body: string;
  data?: Record<string, any>;
  imageUrl?: string;
}

/**
 * 푸시 발송 요청 (통합)
 */
export type SendPushRequest = SendPushSingleRequest | SendPushMultipleRequest | SendPushAllRequest;

/**
 * 푸시 발송 응답
 */
export interface SendPushResponse {
  alertId: number;
  sentCount: number;
  failedCount: number;
  status: string;
}

/**
 * Alert 목록 조회 요청
 */
export interface ListAlertsQuery {
  appCode: string;
  limit?: number;
  offset?: number;
}

/**
 * Alert 요약 정보
 */
export interface AlertSummary {
  id: number;
  title: string;
  targetType: string;
  sentCount: number;
  failedCount: number;
  status: string;
  sentAt: Date | null;
  createdAt: Date | null;
}

/**
 * Alert 목록 응답
 */
export interface ListAlertsResponse {
  alerts: AlertSummary[];
  total: number;
}

/**
 * Alert 상세 정보
 */
export interface AlertDetail {
  id: number;
  title: string;
  body: string;
  data: Record<string, any>;
  imageUrl: string | null;
  targetType: string;
  targetUserIds: number[];
  sentCount: number;
  failedCount: number;
  status: string;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date | null;
}
