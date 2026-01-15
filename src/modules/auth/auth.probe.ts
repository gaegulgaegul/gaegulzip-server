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
