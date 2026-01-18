import { db } from '../../config/database';
import { apps, users, refreshTokens } from './schema';
import { eq, and } from 'drizzle-orm';
import { signToken, verifyToken } from '../../utils/jwt';
import { JWTPayload } from './types';
import { v4 as uuidv4 } from 'uuid';
import { hashRefreshToken, calculateExpiresAt } from './refresh-token.utils';
import { UnauthorizedException } from '../../utils/errors';

/**
 * 앱 코드로 앱 조회
 * @param code - 조회할 앱 코드
 * @returns 앱 객체 또는 null
 */
export async function findAppByCode(code: string) {
  const result = await db.select().from(apps).where(eq(apps.code, code)).limit(1);
  return result[0] || null;
}

/**
 * 사용자 생성 또는 업데이트 (멀티 제공자 지원)
 * @param data - 사용자 데이터 (appId, provider, providerId, email, nickname, profileImage)
 * @returns 생성 또는 업데이트된 사용자 객체
 */
export async function upsertUser(data: {
  appId: number;
  provider: string;
  providerId: string;
  email: string | null;
  nickname: string | null;
  profileImage: string | null;
}) {
  // 기존 사용자 조회
  const existing = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.appId, data.appId),
        eq(users.provider, data.provider),
        eq(users.providerId, data.providerId)
      )
    )
    .limit(1);

  const now = new Date();

  if (existing[0]) {
    // Update
    const updated = await db
      .update(users)
      .set({
        email: data.email,
        nickname: data.nickname,
        profileImage: data.profileImage,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existing[0].id))
      .returning();
    return updated[0];
  } else {
    // Insert
    const inserted = await db
      .insert(users)
      .values({
        appId: data.appId,
        provider: data.provider,
        providerId: data.providerId,
        email: data.email,
        nickname: data.nickname,
        profileImage: data.profileImage,
        lastLoginAt: now,
      })
      .returning();
    return inserted[0];
  }
}

/**
 * JWT 토큰 생성 (최소 페이로드)
 * @param user - 사용자 객체 (id, email, nickname)
 * @param app - 앱 객체 (id, jwtSecret, jwtExpiresIn)
 * @returns JWT 토큰 문자열
 */
export function generateJWT(
  user: {
    id: number;
    email: string | null;
    nickname: string | null;
  },
  app: {
    id: number;
    jwtSecret: string;
    jwtExpiresIn: string;
  }
): string {
  const payload: JWTPayload = {
    sub: user.id,
    appId: app.id,
    email: user.email,
    nickname: user.nickname,
  };

  return signToken(payload, app.jwtSecret, app.jwtExpiresIn);
}

/**
 * Refresh Token을 생성한다
 * @param user - 사용자 객체
 * @param app - 앱 객체
 * @returns Refresh Token, jti, tokenFamily
 */
export async function generateRefreshToken(
  user: { id: number },
  app: { id: number; jwtSecret: string; refreshTokenExpiresIn: string }
): Promise<{ refreshToken: string; jti: string; tokenFamily: string }> {
  const jti = uuidv4();
  const tokenFamily = uuidv4();

  const payload = {
    sub: user.id,
    appId: app.id,
    jti,
    tokenFamily,
  };

  const refreshToken = signToken(payload, app.jwtSecret, app.refreshTokenExpiresIn);

  return { refreshToken, jti, tokenFamily };
}

/**
 * Refresh Token을 DB에 저장한다
 * @param tokenData - Token 데이터
 */
export async function storeRefreshToken(tokenData: {
  tokenHash: string;
  userId: number;
  appId: number;
  jti: string;
  tokenFamily: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(refreshTokens).values({
    tokenHash: tokenData.tokenHash,
    userId: tokenData.userId,
    appId: tokenData.appId,
    jti: tokenData.jti,
    tokenFamily: tokenData.tokenFamily,
    expiresAt: tokenData.expiresAt,
  });
}

/**
 * JTI로 Refresh Token을 조회한다
 * @param jti - JWT ID
 * @returns Refresh Token 객체 또는 null
 */
export async function findRefreshTokenByJti(jti: string) {
  const result = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.jti, jti))
    .limit(1);

  return result[0] || null;
}

/**
 * Refresh Token JWT를 검증하고 페이로드를 반환한다
 * @param token - Refresh Token
 * @param app - 앱 객체
 * @returns JWT 페이로드
 * @throws UnauthorizedException JWT 검증 실패
 */
export async function verifyRefreshToken(
  token: string,
  app: { jwtSecret: string }
): Promise<{ sub: number; appId: number; jti: string; tokenFamily: string }> {
  try {
    const decoded = verifyToken(token, app.jwtSecret) as any;
    return {
      sub: decoded.sub,
      appId: decoded.appId,
      jti: decoded.jti,
      tokenFamily: decoded.tokenFamily,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }
}

/**
 * Refresh Token을 Rotation한다 (기존 무효화 + 새 Token 발급)
 * @param params - oldToken, user, app
 * @returns 새 Access Token, 새 Refresh Token, 새 jti
 */
export async function rotateRefreshToken(params: {
  oldToken: { id: number; tokenFamily: string; userId: number; jti: string };
  user: { id: number; email: string | null; nickname: string | null };
  app: {
    id: number;
    jwtSecret: string;
    jwtExpiresIn: string;
    accessTokenExpiresIn?: string;
    refreshTokenExpiresIn: string;
  };
}): Promise<{ newAccessToken: string; newRefreshToken: string; newJti: string }> {
  const { oldToken, user, app } = params;

  // 1. 새 Access Token 생성
  const newAccessToken = generateJWT(user, app);

  // 2. 새 Refresh Token 생성 (같은 tokenFamily 유지)
  const newJti = uuidv4();
  const payload = {
    sub: user.id,
    appId: app.id,
    jti: newJti,
    tokenFamily: oldToken.tokenFamily, // 기존 Family 유지
  };
  const newRefreshToken = signToken(payload, app.jwtSecret, app.refreshTokenExpiresIn);

  // 3. 트랜잭션: 기존 Token 무효화 + 새 Token 저장
  await db.transaction(async (tx) => {
    // 기존 Token 무효화
    await tx
      .update(refreshTokens)
      .set({ revoked: true, revokedAt: new Date() })
      .where(eq(refreshTokens.id, oldToken.id));

    // 새 Token 저장
    await tx.insert(refreshTokens).values({
      tokenHash: await hashRefreshToken(newRefreshToken),
      userId: user.id,
      appId: app.id,
      jti: newJti,
      tokenFamily: oldToken.tokenFamily,
      expiresAt: calculateExpiresAt(app.refreshTokenExpiresIn),
    });
  });

  return { newAccessToken, newRefreshToken, newJti };
}

/**
 * Refresh Token을 ID로 무효화한다
 * @param id - Refresh Token ID
 */
export async function revokeRefreshTokenById(id: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}

/**
 * 사용자의 모든 Refresh Token을 무효화한다
 * @param userId - 사용자 ID
 */
export async function revokeRefreshTokensByUserId(userId: number): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(refreshTokens.userId, userId));
}

/**
 * Token Family의 모든 Refresh Token을 무효화한다 (Reuse Detection)
 * @param tokenFamily - Token Family ID
 */
export async function revokeRefreshTokenFamily(tokenFamily: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(refreshTokens.tokenFamily, tokenFamily));
}
