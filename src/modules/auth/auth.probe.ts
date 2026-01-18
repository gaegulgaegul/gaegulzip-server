import { logger } from '../../utils/logger';

/**
 * 로그인 성공 로그 (INFO)
 * @param data - 로그인 성공 정보 (userId, provider, appCode)
 */
export const loginSuccess = (data: {
  userId: number;
  provider: string;
  appCode: string;
}) => {
  logger.info({
    userId: data.userId,
    provider: data.provider,
    appCode: data.appCode,
  }, 'User logged in successfully');
};

/**
 * 로그인 실패 로그 (WARN)
 * @param data - 로그인 실패 정보 (provider, appCode, reason)
 */
export const loginFailed = (data: {
  provider: string;
  appCode: string;
  reason: string;
}) => {
  logger.warn({
    provider: data.provider,
    appCode: data.appCode,
    reason: data.reason,
  }, 'User login failed');
};

/**
 * 신규 사용자 등록 로그 (INFO)
 * @param data - 신규 사용자 정보 (userId, provider, appCode)
 */
export const userRegistered = (data: {
  userId: number;
  provider: string;
  appCode: string;
}) => {
  logger.info({
    userId: data.userId,
    provider: data.provider,
    appCode: data.appCode,
  }, 'New user registered');
};

/**
 * Refresh Token 발급 로그 (INFO)
 * @param data - Refresh Token 발급 정보 (userId, jti, tokenFamily)
 */
export const refreshTokenIssued = (data: {
  userId: number;
  jti: string;
  tokenFamily: string;
}) => {
  logger.info({
    userId: data.userId,
    jti: data.jti,
    tokenFamily: data.tokenFamily,
  }, 'Refresh token issued');
};

/**
 * Refresh Token Rotation 로그 (INFO)
 * @param data - Rotation 정보 (userId, oldJti, newJti, tokenFamily)
 */
export const refreshTokenRotated = (data: {
  userId: number;
  oldJti: string;
  newJti: string;
  tokenFamily: string;
}) => {
  logger.info({
    userId: data.userId,
    oldJti: data.oldJti,
    newJti: data.newJti,
    tokenFamily: data.tokenFamily,
  }, 'Refresh token rotated');
};

/**
 * Refresh Token 무효화 로그 (INFO)
 * @param data - 무효화 정보 (userId, jti, revokeAll)
 */
export const refreshTokenRevoked = (data: {
  userId: number;
  jti: string;
  revokeAll: boolean;
}) => {
  logger.info({
    userId: data.userId,
    jti: data.jti,
    revokeAll: data.revokeAll,
  }, 'Refresh token revoked');
};

/**
 * Refresh Token 재사용 감지 로그 (ERROR - 보안 경고)
 * @param data - 재사용 감지 정보 (userId, jti, tokenFamily, ip)
 */
export const refreshTokenReuseDetected = (data: {
  userId: number;
  jti: string;
  tokenFamily: string;
  ip: string | undefined;
}) => {
  logger.error({
    userId: data.userId,
    jti: data.jti,
    tokenFamily: data.tokenFamily,
    ip: data.ip,
  }, 'Refresh token reuse detected (security alert)');
};
