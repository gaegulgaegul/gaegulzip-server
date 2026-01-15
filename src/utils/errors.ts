/**
 * 애플리케이션 최상위 예외 클래스
 */
export class AppException extends Error {
  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 비즈니스 로직 예외 (400번대)
 */
export class BusinessException extends AppException {
  constructor(message: string, code?: string) {
    super(message, 400, code);
  }
}

/**
 * 입력값 검증 실패 예외
 */
export class ValidationException extends BusinessException {
  constructor(message: string, public readonly field?: string) {
    super(message, 'VALIDATION_ERROR');
  }
}

/**
 * 인증 실패 예외 (401)
 */
export class UnauthorizedException extends AppException {
  constructor(message: string, code?: string) {
    super(message, 401, code);
  }
}

/**
 * 리소스 찾을 수 없음 (404)
 */
export class NotFoundException extends AppException {
  constructor(resource: string, identifier: string | number) {
    super(`${resource} not found: ${identifier}`, 404, 'NOT_FOUND');
  }
}

/**
 * 외부 API 호출 실패 예외
 */
export class ExternalApiException extends AppException {
  constructor(
    public readonly provider: string,
    public readonly originalError: any
  ) {
    super(
      `External API error from ${provider}: ${originalError.message}`,
      502,
      'EXTERNAL_API_ERROR'
    );
  }
}

/**
 * 에러 코드 상수
 */
export enum ErrorCode {
  // Validation
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_PROVIDER = 'INVALID_PROVIDER',

  // Authentication
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  TOKEN_VERIFICATION_FAILED = 'TOKEN_VERIFICATION_FAILED',

  // Not Found
  NOT_FOUND = 'NOT_FOUND',
  APP_NOT_FOUND = 'APP_NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',

  // External API
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  KAKAO_API_ERROR = 'KAKAO_API_ERROR',

  // Internal
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
