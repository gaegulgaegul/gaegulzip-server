import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppException } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * 전역 에러 핸들러
 * @param err - 발생한 에러 객체
 * @param req - Express 요청 객체
 * @param res - Express 응답 객체
 * @param next - Express next 함수
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // ZodError → ValidationException 변환
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.issues,
      },
    });
  }

  // AppException 처리
  if (err instanceof AppException) {
    logger.warn({
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
    }, 'Application error');

    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  // 예상치 못한 에러
  logger.error({ error: err, stack: err.stack }, 'Unexpected error');

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
};
