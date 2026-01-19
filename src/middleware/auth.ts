import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt';
import { findAppById } from '../modules/auth/services';
import { UnauthorizedException } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * JWT 인증 미들웨어
 * Authorization: Bearer <token> 헤더에서 JWT를 검증하고 req.user를 설정합니다.
 * @throws UnauthorizedException 토큰이 없거나 유효하지 않은 경우
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // 1. Authorization 헤더 확인
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided', 'INVALID_TOKEN');
    }

    // 2. Bearer 토큰 추출
    const token = authHeader.substring(7); // "Bearer " 제거

    // 3. JWT decode (검증 전 appId 확인용)
    let decoded: any;
    try {
      const payload = token.split('.')[1];
      decoded = JSON.parse(Buffer.from(payload, 'base64').toString());
    } catch (error) {
      throw new UnauthorizedException('Invalid token format', 'INVALID_TOKEN');
    }

    if (!decoded.appId) {
      throw new UnauthorizedException('Token missing appId', 'INVALID_TOKEN');
    }

    logger.debug({ appId: decoded.appId, userId: decoded.sub }, 'Authenticating request');

    // 4. 앱 조회 (jwtSecret 가져오기)
    const app = await findAppById(decoded.appId);
    if (!app) {
      throw new UnauthorizedException('App not found', 'INVALID_TOKEN');
    }

    // 5. JWT 검증
    let verified: any;
    try {
      verified = verifyToken(token, app.jwtSecret);
    } catch (error) {
      if (error instanceof Error && error.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired', 'EXPIRED_TOKEN');
      }
      throw new UnauthorizedException('Token verification failed', 'TOKEN_VERIFICATION_FAILED');
    }

    // 6. req.user 설정
    (req as any).user = {
      userId: verified.sub,
      appId: verified.appId,
    };

    logger.debug({ userId: verified.sub, appId: verified.appId }, 'Authentication successful');

    next();
  } catch (error) {
    next(error);
  }
};
