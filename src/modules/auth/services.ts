import { db } from '../../config/database';
import { apps, users } from './schema';
import { eq, and } from 'drizzle-orm';
import { signToken } from '../../utils/jwt';
import { JWTPayload } from './types';

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
