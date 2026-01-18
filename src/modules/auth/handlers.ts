import { Request, Response, RequestHandler } from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { oauthLoginSchema, refreshTokenSchema, logoutSchema } from './validators';
import {
  findAppByCode,
  upsertUser,
  generateJWT,
  generateRefreshToken,
  storeRefreshToken,
  findRefreshTokenByJti,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenById,
  revokeRefreshTokensByUserId,
  revokeRefreshTokenFamily,
} from './services';
import { createOAuthProvider } from './providers';
import { NotFoundException, ValidationException, ExternalApiException, UnauthorizedException } from '../../utils/errors';
import { logger } from '../../utils/logger';
import * as authProbe from './auth.probe';
import { hashRefreshToken, parseExpiresIn, calculateExpiresAt } from './refresh-token.utils';

/**
 * OAuth 로그인 통합 핸들러 (카카오/네이버/구글/애플)
 * @param req - Express 요청 객체 (body: { code, provider, accessToken })
 * @param res - Express 응답 객체
 * @returns 200: { accessToken, refreshToken, tokenType, expiresIn, user, token } 형태의 JSON 응답
 * @throws NotFoundException 앱을 찾을 수 없는 경우
 * @throws ValidationException Provider가 설정되지 않은 경우
 * @throws UnauthorizedException 토큰 검증 실패 시
 * @throws ExternalApiException 외부 API 호출 실패 시
 */
export const oauthLogin = async (req: Request, res: Response) => {
  const { code, provider, accessToken } = oauthLoginSchema.parse(req.body);

  logger.debug({ code, provider }, 'OAuth login attempt');

  // 1. 앱 조회
  const app = await findAppByCode(code);
  if (!app) {
    throw new NotFoundException('App', code);
  }

  // 2. Provider 크레덴셜 확인 및 Provider 인스턴스 생성
  const credentials: any = {};
  if (provider === 'kakao') {
    if (!app.kakaoRestApiKey || !app.kakaoClientSecret) {
      throw new ValidationException(`Provider ${provider} not configured for app ${code}`);
    }
    credentials.kakao = {
      restApiKey: app.kakaoRestApiKey,
      clientSecret: app.kakaoClientSecret,
    };
  }
  // 향후 naver, google, apple 추가

  const oauthProvider = createOAuthProvider(provider, credentials);

  try {
    // 3. Token 검증
    await oauthProvider.verifyToken(accessToken);

    // 4. 사용자 정보 조회
    const userInfo = await oauthProvider.getUserInfo(accessToken);

    // 5. 사용자 저장/업데이트
    const user = await upsertUser({
      appId: app.id,
      provider,
      providerId: userInfo.providerId,
      email: userInfo.email,
      nickname: userInfo.nickname,
      profileImage: userInfo.profileImage,
    });

    // 6. JWT 생성
    const token = generateJWT(user, app);

    // 7. Refresh Token 생성
    const { refreshToken, jti, tokenFamily } = await generateRefreshToken(user, app);

    // 8. Refresh Token 저장
    await storeRefreshToken({
      tokenHash: await hashRefreshToken(refreshToken),
      userId: user.id,
      appId: app.id,
      jti,
      tokenFamily,
      expiresAt: calculateExpiresAt(app.refreshTokenExpiresIn || '14d'),
    });

    // 9. 운영 로그
    authProbe.loginSuccess({
      userId: user.id,
      provider,
      appCode: app.code,
    });

    authProbe.refreshTokenIssued({ userId: user.id, jti, tokenFamily });

    // 10. 응답 (CLAUDE.md API Response 가이드: camelCase)
    res.json({
      accessToken: token,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: parseExpiresIn(app.accessTokenExpiresIn || '30m'),
      user: {
        id: user.id,
        provider: user.provider,
        email: user.email,
        nickname: user.nickname,
        profileImage: user.profileImage,
        appCode: app.code,
        lastLoginAt: user.lastLoginAt,
      },
      token, // Deprecated (하위 호환성)
    });
  } catch (error) {
    authProbe.loginFailed({
      provider,
      appCode: app.code,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

/**
 * OAuth Callback 핸들러 (카카오 Authorization Code 방식)
 * @param req - Express 요청 객체 (query: { code, state })
 * @param res - Express 응답 객체
 * @description 카카오로부터 인가 코드를 받아 액세스 토큰으로 교환 후 로그인 처리
 */
export const oauthCallback = async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || typeof code !== 'string') {
    throw new ValidationException('Authorization code is required');
  }

  // state는 앱 코드로 사용 (예: wowa)
  const appCode = state && typeof state === 'string' ? state : 'wowa';

  logger.debug({ code: appCode, authCode: code }, 'OAuth callback received');

  // 1. 앱 조회
  const app = await findAppByCode(appCode);
  if (!app) {
    throw new NotFoundException('App', appCode);
  }

  // 2. 카카오 크레덴셜 확인
  if (!app.kakaoRestApiKey || !app.kakaoClientSecret) {
    throw new ValidationException('Kakao not configured for this app');
  }

  try {
    // 3. 인가 코드를 액세스 토큰으로 교환
    const tokenResponse = await axios.post(
      'https://kauth.kakao.com/oauth/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: app.kakaoRestApiKey,
        client_secret: app.kakaoClientSecret,
        redirect_uri: 'http://localhost:3001/auth/oauth/callback',
        code: code,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { access_token } = tokenResponse.data;

    logger.info({ appCode }, 'Access token obtained from Kakao');

    // 4. Provider 인스턴스 생성
    const oauthProvider = createOAuthProvider('kakao', {
      kakao: {
        restApiKey: app.kakaoRestApiKey,
        clientSecret: app.kakaoClientSecret,
      },
    });

    // 5. Token 검증
    await oauthProvider.verifyToken(access_token);

    // 6. 사용자 정보 조회
    const userInfo = await oauthProvider.getUserInfo(access_token);

    // 7. 사용자 저장/업데이트
    const user = await upsertUser({
      appId: app.id,
      provider: 'kakao',
      providerId: userInfo.providerId,
      email: userInfo.email,
      nickname: userInfo.nickname,
      profileImage: userInfo.profileImage,
    });

    // 8. JWT 생성
    const token = generateJWT(user, app);

    // 9. Refresh Token 생성
    const { refreshToken, jti, tokenFamily } = await generateRefreshToken(user, app);

    // 10. Refresh Token 저장
    await storeRefreshToken({
      tokenHash: await hashRefreshToken(refreshToken),
      userId: user.id,
      appId: app.id,
      jti,
      tokenFamily,
      expiresAt: calculateExpiresAt(app.refreshTokenExpiresIn || '14d'),
    });

    // 11. 운영 로그
    authProbe.loginSuccess({
      userId: user.id,
      provider: 'kakao',
      appCode: app.code,
    });

    authProbe.refreshTokenIssued({ userId: user.id, jti, tokenFamily });

    // 12. 응답 (HTML 페이지로 토큰 표시)
    res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>OAuth Login Success</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
            .success { color: green; }
            .token-box { background: #f5f5f5; padding: 20px; border-radius: 5px; margin: 20px 0; }
            .token { word-break: break-all; font-family: monospace; font-size: 12px; }
            .user-info { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <h1 class="success">✅ 로그인 성공!</h1>

          <div class="user-info">
            <h2>사용자 정보</h2>
            <p><strong>ID:</strong> ${user.id}</p>
            <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
            <p><strong>Nickname:</strong> ${user.nickname || 'N/A'}</p>
            <p><strong>Provider:</strong> ${user.provider}</p>
          </div>

          <div class="token-box">
            <h2>Access Token (JWT)</h2>
            <p class="token">${token}</p>
          </div>

          <div class="token-box">
            <h2>Refresh Token</h2>
            <p class="token">${refreshToken}</p>
          </div>

          <div class="token-box">
            <h2>Kakao Access Token</h2>
            <p class="token">${access_token}</p>
          </div>

          <h3>API 테스트</h3>
          <pre>
curl -X POST http://localhost:3001/auth/oauth \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "${appCode}",
    "provider": "kakao",
    "accessToken": "${access_token}"
  }'
          </pre>
        </body>
      </html>
    `);
  } catch (error: any) {
    authProbe.loginFailed({
      provider: 'kakao',
      appCode: app.code,
      reason: error instanceof Error ? error.message : 'Unknown error',
    });

    if (axios.isAxiosError(error)) {
      throw new ExternalApiException('kakao', error);
    }
    throw error;
  }
};

/**
 * Refresh Token으로 Access Token 갱신
 * @param req - Express 요청 객체 (body: { refreshToken })
 * @param res - Express 응답 객체
 * @returns 200: { accessToken, refreshToken, tokenType, expiresIn }
 * @throws UnauthorizedException Refresh Token 만료/무효화/재사용 시
 */
export const refreshToken: RequestHandler = async (req: Request, res: Response) => {
  // 1. 요청 검증
  const { refreshToken: token } = refreshTokenSchema.parse(req.body);

  // 2. JWT 검증
  // NOTE: app 정보가 JWT에 포함되어 있지만, DB에서 최신 정보 가져오는 것이 안전
  let decoded: { sub: number; appId: number; jti: string; tokenFamily: string };

  try {
    // JWT에서 appId 추출을 위해 먼저 디코딩 (검증 없이)
    const decodedWithoutVerify = jwt.decode(token) as any;

    if (!decodedWithoutVerify || !decodedWithoutVerify.appId) {
      throw new UnauthorizedException('Invalid refresh token format', 'INVALID_REFRESH_TOKEN');
    }

    const app = await findAppByCode('wowa'); // TODO: appId로 조회하는 함수 필요
    if (!app) {
      throw new NotFoundException('App', decodedWithoutVerify.appId);
    }

    // 이제 제대로 검증
    decoded = await verifyRefreshToken(token, app);
  } catch (error) {
    if (error instanceof UnauthorizedException || error instanceof NotFoundException) {
      throw error;
    }
    throw new UnauthorizedException('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const { sub: userId, jti } = decoded;

  // 3. DB에서 Refresh Token 조회 (by jti)
  const storedToken = await findRefreshTokenByJti(jti);

  if (!storedToken) {
    throw new UnauthorizedException('Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // 4. 만료 확인
  if (storedToken.expiresAt < new Date()) {
    throw new UnauthorizedException('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  // 5. Reuse Detection
  if (storedToken.revoked) {
    const gracePeriodMs = 5000; // 5초
    const timeSinceRevoked = Date.now() - (storedToken.revokedAt?.getTime() || 0);

    if (timeSinceRevoked > gracePeriodMs) {
      // REUSE DETECTION 작동
      await revokeRefreshTokenFamily(storedToken.tokenFamily);

      authProbe.refreshTokenReuseDetected({
        userId,
        jti,
        tokenFamily: storedToken.tokenFamily,
        ip: req.ip,
      });

      throw new UnauthorizedException(
        'Refresh token reuse detected. All tokens have been revoked.',
        'REFRESH_TOKEN_REUSE_DETECTED'
      );
    }

    // Grace Period 내
    throw new UnauthorizedException('Refresh token already used', 'REFRESH_TOKEN_REVOKED');
  }

  // 6. 사용자 조회 (upsertUser 대신 findUserById 필요하지만, 간단히 처리)
  const user = { id: userId, email: null, nickname: null };

  // 7. 앱 조회
  const app = await findAppByCode('wowa'); // TODO: 개선 필요
  if (!app) {
    throw new NotFoundException('App', storedToken.appId);
  }

  // 8. Token Rotation
  const { newAccessToken, newRefreshToken, newJti } = await rotateRefreshToken({
    oldToken: storedToken as any,
    user,
    app: app as any,
  });

  // 9. 운영 로그
  authProbe.refreshTokenRotated({
    userId,
    oldJti: jti,
    newJti,
    tokenFamily: storedToken.tokenFamily,
  });

  // 10. 응답
  res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    tokenType: 'Bearer',
    expiresIn: parseExpiresIn(app.accessTokenExpiresIn || '30m'),
  });
};

/**
 * 로그아웃 (Refresh Token 무효화)
 * @param req - Express 요청 객체 (body: { refreshToken, revokeAll? })
 * @param res - Express 응답 객체
 * @returns 204: No Content
 * @throws UnauthorizedException Refresh Token이 존재하지 않음
 */
export const logout: RequestHandler = async (req: Request, res: Response) => {
  // 1. 요청 검증
  const { refreshToken: token, revokeAll = false } = logoutSchema.parse(req.body);

  //  2. JWT 검증 (앱 조회 필요)
  let decoded: { sub: number; appId: number; jti: string; tokenFamily: string };
  const app = await findAppByCode('wowa'); // TODO: appId로 조회하는 함수 필요
  if (!app) {
    throw new NotFoundException('App', 'wowa');
  }

  try {
    decoded = await verifyRefreshToken(token, app);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new UnauthorizedException('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }

  const { sub: userId, jti } = decoded;

  // 3. DB에서 Refresh Token 조회
  const storedToken = await findRefreshTokenByJti(jti);

  if (!storedToken) {
    throw new UnauthorizedException('Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // 4. Token 무효화 (멱등성: 이미 무효화된 토큰도 204 반환)
  if (!storedToken.revoked) {
    if (revokeAll) {
      await revokeRefreshTokensByUserId(userId);
    } else {
      await revokeRefreshTokenById(storedToken.id);
    }

    authProbe.refreshTokenRevoked({ userId, jti, revokeAll });
  }

  // 5. 응답 (멱등성)
  res.status(204).send();
};
