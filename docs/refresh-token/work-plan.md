# Work Distribution Plan: Refresh Token Implementation

> 생성일: 2026-01-17
> 기반 문서: docs/refresh-token/brief.md (사용자 승인 완료)
> CTO: Claude Code

---

## 1. Work Overview

### Total Scope
기존 OAuth 인증 모듈에 Refresh Token 기능 추가:
- Access Token 만료 시간 단축 (7일 → 30분)
- Refresh Token 발급 및 저장 (14일 만료)
- Token Rotation 구현 (보안 강화)
- Reuse Detection 및 Grace Period (5초)
- 로그아웃 기능 (단일/전체 디바이스)

### Complexity Assessment
- Business Logic: **High** (Token Rotation, Reuse Detection, Grace Period)
- Database Operations: **Medium** (새 테이블 추가, 트랜잭션 필요)
- Testing Complexity: **High** (시간 기반 로직, Reuse Detection 시나리오)

---

## 2. Senior Developer Tasks

### Responsibility
복잡한 비즈니스 로직 구현 및 TDD 사이클 수행

---

### Task 1: DB 스키마 설계 및 마이그레이션 생성

**파일**:
- `src/modules/auth/schema.ts` (수정)
- Drizzle 마이그레이션 파일 생성

**구현 단계**:

#### Step 1.1: refreshTokens 테이블 스키마 추가
**파일**: `src/modules/auth/schema.ts`

```typescript
export const refreshTokens = pgTable('refresh_tokens', {
  id: serial('id').primaryKey(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull().unique(),
  userId: integer('user_id').notNull(),
  appId: integer('app_id').notNull(),
  jti: varchar('jti', { length: 36 }).notNull().unique(),
  tokenFamily: varchar('token_family', { length: 36 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  revoked: boolean('revoked').notNull().default(false),
  revokedAt: timestamp('revoked_at'),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  tokenHashIdx: index('idx_refresh_tokens_token_hash').on(table.tokenHash),
  userIdIdx: index('idx_refresh_tokens_user_id').on(table.userId),
  expiresAtIdx: index('idx_refresh_tokens_expires_at').on(table.expiresAt),
  tokenFamilyIdx: index('idx_refresh_tokens_token_family').on(table.tokenFamily),
}));
```

#### Step 1.2: apps 테이블 컬럼 추가
**파일**: `src/modules/auth/schema.ts`

```typescript
export const apps = pgTable('apps', {
  // ... 기존 필드

  // 신규 추가
  accessTokenExpiresIn: varchar('access_token_expires_in', { length: 20 }).notNull().default('30m'),
  refreshTokenExpiresIn: varchar('refresh_token_expires_in', { length: 20 }).notNull().default('14d'),
});
```

#### Step 1.3: 마이그레이션 파일 생성

**Bash 명령어**:
```bash
pnpm drizzle-kit generate
```

**예상 마이그레이션 파일**:
- `drizzle/migrations/0001_add_refresh_tokens_table.sql`
- `drizzle/migrations/0002_add_token_expires_in_to_apps.sql`

**수동으로 COMMENT 추가** (마이그레이션 파일 수정):
```sql
-- 0001_add_refresh_tokens_table.sql에 추가
COMMENT ON TABLE refresh_tokens IS 'Refresh Token 저장소 (Token Rotation 및 Reuse Detection 지원)';
COMMENT ON COLUMN refresh_tokens.token_hash IS 'bcrypt 해시된 Refresh Token (보안)';
COMMENT ON COLUMN refresh_tokens.user_id IS '사용자 ID (외래키, FK 제약조건 없음)';
COMMENT ON COLUMN refresh_tokens.app_id IS '앱 ID (외래키, FK 제약조건 없음)';
COMMENT ON COLUMN refresh_tokens.jti IS 'JWT ID (고유 식별자, UUID v4)';
COMMENT ON COLUMN refresh_tokens.token_family IS 'Token Family ID (Rotation 추적, UUID v4)';
COMMENT ON COLUMN refresh_tokens.expires_at IS '만료 시간 (14일)';
COMMENT ON COLUMN refresh_tokens.revoked IS '무효화 여부 (Rotation 시 true)';
COMMENT ON COLUMN refresh_tokens.revoked_at IS '무효화 시간 (Reuse Detection 시 Grace Period 계산)';
COMMENT ON COLUMN refresh_tokens.created_at IS '생성 시간';

-- 0002_add_token_expires_in_to_apps.sql에 추가
COMMENT ON COLUMN apps.access_token_expires_in IS 'Access Token 만료 시간 (기본: 30분)';
COMMENT ON COLUMN apps.refresh_token_expires_in IS 'Refresh Token 만료 시간 (기본: 14일)';
```

**⚠️ 사용자 작업 필요**: 마이그레이션 실행
```bash
pnpm drizzle-kit push
```

**Supabase MCP로 확인** (⚠️ SELECT만):
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'refresh_tokens';
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'apps' AND column_name IN ('access_token_expires_in', 'refresh_token_expires_in');
```

**Checklist**:
- [ ] `refreshTokens` 테이블 스키마 정의
- [ ] `apps` 테이블에 `accessTokenExpiresIn`, `refreshTokenExpiresIn` 추가
- [ ] Drizzle 마이그레이션 파일 생성 (`pnpm drizzle-kit generate`)
- [ ] COMMENT SQL 추가 (수동 편집)
- [ ] JSDoc 주석 작성 (스키마 정의에)
- [ ] 사용자에게 마이그레이션 실행 요청
- [ ] Supabase MCP로 테이블 생성 확인

---

### Task 2: 유틸 함수 구현

**파일**: `src/modules/auth/refresh-token.utils.ts` (신규)

**구현 단계**:

#### Step 2.1: Red (실패하는 테스트 작성)
**파일**: `tests/unit/auth/refresh-token.utils.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashRefreshToken, compareRefreshToken, parseExpiresIn, calculateExpiresAt } from '../../../src/modules/auth/refresh-token.utils';

describe('refresh-token.utils', () => {
  describe('hashRefreshToken', () => {
    it('should hash refresh token using bcrypt', async () => {
      const token = 'rt_abc123';
      const hash = await hashRefreshToken(token);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(token);
      expect(hash.startsWith('$2b$')).toBe(true); // bcrypt hash format
    });
  });

  describe('compareRefreshToken', () => {
    it('should return true for matching token and hash', async () => {
      const token = 'rt_abc123';
      const hash = await hashRefreshToken(token);

      const result = await compareRefreshToken(token, hash);
      expect(result).toBe(true);
    });

    it('should return false for non-matching token and hash', async () => {
      const token = 'rt_abc123';
      const wrongToken = 'rt_wrong';
      const hash = await hashRefreshToken(token);

      const result = await compareRefreshToken(wrongToken, hash);
      expect(result).toBe(false);
    });
  });

  describe('parseExpiresIn', () => {
    it('should parse "30m" to 1800 seconds', () => {
      expect(parseExpiresIn('30m')).toBe(1800);
    });

    it('should parse "14d" to 1209600 seconds', () => {
      expect(parseExpiresIn('14d')).toBe(1209600);
    });

    it('should parse "2h" to 7200 seconds', () => {
      expect(parseExpiresIn('2h')).toBe(7200);
    });

    it('should throw error for invalid format', () => {
      expect(() => parseExpiresIn('invalid')).toThrow();
    });
  });

  describe('calculateExpiresAt', () => {
    it('should calculate expires at date for "30m"', () => {
      const now = Date.now();
      const expiresAt = calculateExpiresAt('30m');

      const diff = expiresAt.getTime() - now;
      expect(diff).toBeGreaterThanOrEqual(1800 * 1000 - 1000); // 30분 (1초 오차 허용)
      expect(diff).toBeLessThanOrEqual(1800 * 1000 + 1000);
    });

    it('should calculate expires at date for "14d"', () => {
      const now = Date.now();
      const expiresAt = calculateExpiresAt('14d');

      const diff = expiresAt.getTime() - now;
      expect(diff).toBeGreaterThanOrEqual(1209600 * 1000 - 1000); // 14일
      expect(diff).toBeLessThanOrEqual(1209600 * 1000 + 1000);
    });
  });
});
```

#### Step 2.2: Green (최소 구현)
**파일**: `src/modules/auth/refresh-token.utils.ts`

```typescript
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

/**
 * Refresh Token을 bcrypt로 해싱한다
 * @param token - 원본 Refresh Token
 * @returns bcrypt 해시
 */
export const hashRefreshToken = async (token: string): Promise<string> => {
  return bcrypt.hash(token, SALT_ROUNDS);
};

/**
 * Refresh Token과 해시를 비교한다
 * @param token - 원본 Refresh Token
 * @param hash - bcrypt 해시
 * @returns 일치 여부
 */
export const compareRefreshToken = async (token: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(token, hash);
};

/**
 * 만료 시간 문자열을 초 단위로 변환한다
 * @param expiresIn - 만료 시간 문자열 (예: "30m", "14d", "2h")
 * @returns 초 단위 시간
 * @throws Error 잘못된 형식
 */
export const parseExpiresIn = (expiresIn: string): number => {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match) {
    throw new Error(`Invalid expiresIn format: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 24 * 60 * 60;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
};

/**
 * 만료 시간 문자열을 Date 객체로 변환한다
 * @param expiresIn - 만료 시간 문자열 (예: "30m", "14d")
 * @returns 만료 시각 Date 객체
 */
export const calculateExpiresAt = (expiresIn: string): Date => {
  const seconds = parseExpiresIn(expiresIn);
  return new Date(Date.now() + seconds * 1000);
};
```

#### Step 2.3: Refactor
- 필요 시 코드 개선 (현재는 충분히 간결함)

**Checklist**:
- [ ] 테스트 작성 (실패 확인)
- [ ] 유틸 함수 구현 (테스트 통과)
- [ ] 리팩토링 (필요 시)
- [ ] JSDoc 주석 작성 (한국어)
- [ ] context7 MCP로 bcrypt best practices 참조
- [ ] bcrypt, uuid 패키지 설치 (`pnpm add bcrypt uuid && pnpm add -D @types/bcrypt @types/uuid`)

---

### Task 3: Refresh Token 서비스 함수 구현

**파일**: `src/modules/auth/services.ts` (수정)

**구현 단계**:

#### Step 3.1: Red (실패하는 테스트 작성)
**파일**: `tests/unit/auth/services.test.ts` (수정)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateRefreshToken,
  storeRefreshToken,
  findRefreshTokenByHash,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenById,
  revokeRefreshTokensByUserId,
  revokeRefreshTokenFamily,
} from '../../../src/modules/auth/services';

describe('auth/services - Refresh Token', () => {
  describe('generateRefreshToken', () => {
    it('should generate refresh token with jti and tokenFamily', async () => {
      const user = { id: 1 };
      const app = { id: 1, jwtSecret: 'test-secret', refreshTokenExpiresIn: '14d' };

      const result = await generateRefreshToken(user, app);

      expect(result).toHaveProperty('refreshToken');
      expect(result).toHaveProperty('jti');
      expect(result).toHaveProperty('tokenFamily');
      expect(result.jti).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
      expect(result.tokenFamily).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('should include correct JWT payload', async () => {
      const user = { id: 1 };
      const app = { id: 1, jwtSecret: 'test-secret', refreshTokenExpiresIn: '14d' };

      const result = await generateRefreshToken(user, app);

      // JWT 검증 (여기서는 단순히 구조만 확인, verifyRefreshToken 테스트에서 상세 검증)
      expect(result.refreshToken).toBeTruthy();
    });
  });

  describe('storeRefreshToken', () => {
    it('should store refresh token in database', async () => {
      const tokenData = {
        tokenHash: 'bcrypt-hash',
        userId: 1,
        appId: 1,
        jti: 'uuid-jti',
        tokenFamily: 'uuid-family',
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      };

      await storeRefreshToken(tokenData);

      // DB insert 호출 확인 (mock 사용)
      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tokenHash: 'bcrypt-hash',
          userId: 1,
          jti: 'uuid-jti',
        })
      );
    });
  });

  describe('findRefreshTokenByHash', () => {
    it('should find refresh token by hash', async () => {
      const tokenHash = 'bcrypt-hash';
      mockDbSelect.mockResolvedValue([{ id: 1, tokenHash, userId: 1 }]);

      const result = await findRefreshTokenByHash(tokenHash);

      expect(result).toEqual({ id: 1, tokenHash, userId: 1 });
    });

    it('should return null if token not found', async () => {
      mockDbSelect.mockResolvedValue([]);

      const result = await findRefreshTokenByHash('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify refresh token JWT and return payload', async () => {
      const token = 'valid-jwt-token';
      const app = { id: 1, jwtSecret: 'test-secret' };

      // Mock: JWT 검증 성공
      mockJwtVerify.mockReturnValue({
        sub: 1,
        appId: 1,
        jti: 'uuid-jti',
        tokenFamily: 'uuid-family',
      });

      const result = await verifyRefreshToken(token, app);

      expect(result).toEqual({
        sub: 1,
        appId: 1,
        jti: 'uuid-jti',
        tokenFamily: 'uuid-family',
      });
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwtVerify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(verifyRefreshToken('invalid-token', app))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  describe('rotateRefreshToken', () => {
    it('should rotate refresh token atomically', async () => {
      const oldToken = { id: 1, jti: 'old-jti', tokenFamily: 'family-1', userId: 1 };
      const user = { id: 1 };
      const app = { id: 1, jwtSecret: 'test-secret', accessTokenExpiresIn: '30m', refreshTokenExpiresIn: '14d' };

      const result = await rotateRefreshToken({ oldToken, user, app });

      expect(result).toHaveProperty('newAccessToken');
      expect(result).toHaveProperty('newRefreshToken');
      expect(result).toHaveProperty('newJti');

      // 기존 Token 무효화 확인
      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ revoked: true })
      );

      // 새 Token 저장 확인
      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({ tokenFamily: 'family-1' })
      );
    });

    it('should use same tokenFamily for new token', async () => {
      const oldToken = { id: 1, tokenFamily: 'original-family', userId: 1 };
      const user = { id: 1 };
      const app = { id: 1, jwtSecret: 'test-secret', accessTokenExpiresIn: '30m', refreshTokenExpiresIn: '14d' };

      const result = await rotateRefreshToken({ oldToken, user, app });

      // 새 Token의 tokenFamily가 기존과 동일한지 확인
      expect(mockDbInsert).toHaveBeenCalledWith(
        expect.objectContaining({ tokenFamily: 'original-family' })
      );
    });
  });

  describe('revokeRefreshTokenById', () => {
    it('should revoke refresh token by id', async () => {
      await revokeRefreshTokenById(1);

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ revoked: true, revokedAt: expect.any(Date) })
      );
    });
  });

  describe('revokeRefreshTokensByUserId', () => {
    it('should revoke all refresh tokens for user', async () => {
      await revokeRefreshTokensByUserId(1);

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ revoked: true })
      );
    });
  });

  describe('revokeRefreshTokenFamily', () => {
    it('should revoke all tokens in family', async () => {
      await revokeRefreshTokenFamily('family-uuid');

      expect(mockDbUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ revoked: true })
      );
    });
  });
});
```

#### Step 3.2: Green (최소 구현)
**파일**: `src/modules/auth/services.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import { db } from '../../config/database';
import { refreshTokens } from './schema';
import { hashRefreshToken, calculateExpiresAt } from './refresh-token.utils';
import { UnauthorizedException } from '../../utils/errors';
import { eq } from 'drizzle-orm';

/**
 * Refresh Token을 생성한다
 * @param user - 사용자 객체
 * @param app - 앱 객체
 * @returns Refresh Token, jti, tokenFamily
 */
export const generateRefreshToken = async (
  user: { id: number },
  app: { id: number; jwtSecret: string; refreshTokenExpiresIn: string }
): Promise<{ refreshToken: string; jti: string; tokenFamily: string }> => {
  const jti = uuidv4();
  const tokenFamily = uuidv4();

  const payload = {
    sub: user.id,
    appId: app.id,
    jti,
    tokenFamily,
  };

  const refreshToken = jwt.sign(payload, app.jwtSecret, {
    expiresIn: app.refreshTokenExpiresIn,
  });

  return { refreshToken, jti, tokenFamily };
};

/**
 * Refresh Token을 DB에 저장한다
 * @param tokenData - Token 데이터
 */
export const storeRefreshToken = async (tokenData: {
  tokenHash: string;
  userId: number;
  appId: number;
  jti: string;
  tokenFamily: string;
  expiresAt: Date;
}): Promise<void> => {
  await db.insert(refreshTokens).values({
    tokenHash: tokenData.tokenHash,
    userId: tokenData.userId,
    appId: tokenData.appId,
    jti: tokenData.jti,
    tokenFamily: tokenData.tokenFamily,
    expiresAt: tokenData.expiresAt,
  });
};

/**
 * Token Hash로 Refresh Token을 조회한다
 * @param tokenHash - bcrypt 해시
 * @returns Refresh Token 객체 또는 null
 */
export const findRefreshTokenByHash = async (tokenHash: string) => {
  const result = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  return result[0] || null;
};

/**
 * Refresh Token JWT를 검증하고 페이로드를 반환한다
 * @param token - Refresh Token
 * @param app - 앱 객체
 * @returns JWT 페이로드
 * @throws UnauthorizedException JWT 검증 실패
 */
export const verifyRefreshToken = async (
  token: string,
  app: { jwtSecret: string }
): Promise<{ sub: number; appId: number; jti: string; tokenFamily: string }> => {
  try {
    const decoded = jwt.verify(token, app.jwtSecret) as any;
    return {
      sub: decoded.sub,
      appId: decoded.appId,
      jti: decoded.jti,
      tokenFamily: decoded.tokenFamily,
    };
  } catch (error) {
    throw new UnauthorizedException('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  }
};

/**
 * Refresh Token을 Rotation한다 (기존 무효화 + 새 Token 발급)
 * @param params - oldToken, user, app
 * @returns 새 Access Token, 새 Refresh Token, 새 jti
 */
export const rotateRefreshToken = async (params: {
  oldToken: { id: number; tokenFamily: string; userId: number };
  user: { id: number };
  app: { id: number; jwtSecret: string; accessTokenExpiresIn: string; refreshTokenExpiresIn: string };
}): Promise<{ newAccessToken: string; newRefreshToken: string; newJti: string }> => {
  const { oldToken, user, app } = params;

  // 1. 새 Access Token 생성 (기존 generateJWT 함수 재사용 가정)
  const newAccessToken = generateJWT(user, app); // 기존 함수

  // 2. 새 Refresh Token 생성 (같은 tokenFamily 유지)
  const newJti = uuidv4();
  const payload = {
    sub: user.id,
    appId: app.id,
    jti: newJti,
    tokenFamily: oldToken.tokenFamily, // 기존 Family 유지
  };
  const newRefreshToken = jwt.sign(payload, app.jwtSecret, {
    expiresIn: app.refreshTokenExpiresIn,
  });

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
};

/**
 * Refresh Token을 ID로 무효화한다
 * @param id - Refresh Token ID
 */
export const revokeRefreshTokenById = async (id: number): Promise<void> => {
  await db
    .update(refreshTokens)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(refreshTokens.id, id));
};

/**
 * 사용자의 모든 Refresh Token을 무효화한다
 * @param userId - 사용자 ID
 */
export const revokeRefreshTokensByUserId = async (userId: number): Promise<void> => {
  await db
    .update(refreshTokens)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(refreshTokens.userId, userId));
};

/**
 * Token Family의 모든 Refresh Token을 무효화한다 (Reuse Detection)
 * @param tokenFamily - Token Family ID
 */
export const revokeRefreshTokenFamily = async (tokenFamily: string): Promise<void> => {
  await db
    .update(refreshTokens)
    .set({ revoked: true, revokedAt: new Date() })
    .where(eq(refreshTokens.tokenFamily, tokenFamily));
};
```

#### Step 3.3: Refactor
- 필요 시 코드 개선

**제공할 인터페이스** (Junior가 handlers에서 사용할 것):
```typescript
export const generateRefreshToken: (user, app) => Promise<{ refreshToken, jti, tokenFamily }>;
export const storeRefreshToken: (tokenData) => Promise<void>;
export const findRefreshTokenByHash: (tokenHash) => Promise<RefreshToken | null>;
export const verifyRefreshToken: (token, app) => Promise<JWTPayload>;
export const rotateRefreshToken: (params) => Promise<{ newAccessToken, newRefreshToken, newJti }>;
export const revokeRefreshTokenById: (id) => Promise<void>;
export const revokeRefreshTokensByUserId: (userId) => Promise<void>;
export const revokeRefreshTokenFamily: (tokenFamily) => Promise<void>;
```

**DB 작업**:
- INSERT into `refreshTokens`
- SELECT from `refreshTokens` WHERE `tokenHash`
- UPDATE `refreshTokens` SET `revoked` = true (트랜잭션)

**Mocks**:
- DB: Drizzle ORM (vitest에서 mock)
- JWT: `jsonwebtoken`
- UUID: `uuid`
- bcrypt: `bcrypt`

**Checklist**:
- [ ] 테스트 작성 (실패 확인)
- [ ] 서비스 함수 구현 (테스트 통과)
- [ ] 리팩토링 (필요 시)
- [ ] JSDoc 주석 작성 (한국어)
- [ ] context7 MCP로 Drizzle transaction patterns 참조
- [ ] Supabase MCP로 실제 DB 타입 확인 (⚠️ SELECT만)

---

### Task 4: Handlers 구현 (기존 수정 + 신규 추가)

**파일**: `src/modules/auth/handlers.ts` (수정)

**구현 단계**:

#### Step 4.1: Red (실패하는 테스트 작성)
**파일**: `tests/unit/auth/handlers.test.ts` (수정)

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { oauthLogin, refreshToken, logout } from '../../../src/modules/auth/handlers';

describe('auth/handlers', () => {
  // 기존 oauthLogin 테스트 수정
  describe('oauthLogin', () => {
    it('should return accessToken and refreshToken on successful login', async () => {
      // Given
      const mockApp = { id: 1, code: 'wowa', jwtSecret: 'secret', accessTokenExpiresIn: '30m', refreshTokenExpiresIn: '14d' };
      const mockUser = { id: 1, email: 'test@example.com' };
      vi.mocked(findAppByCode).mockResolvedValue(mockApp);
      vi.mocked(upsertUser).mockResolvedValue(mockUser);
      vi.mocked(generateJWT).mockReturnValue('mock-access-token');
      vi.mocked(generateRefreshToken).mockResolvedValue({
        refreshToken: 'mock-refresh-token',
        jti: 'uuid-1',
        tokenFamily: 'family-1',
      });

      // When
      await oauthLogin(req as Request, res as Response);

      // Then
      expect(res.json).toHaveBeenCalledWith({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 1800,
        user: expect.any(Object),
        token: 'mock-access-token', // Deprecated
      });
      expect(storeRefreshToken).toHaveBeenCalledWith(expect.objectContaining({
        userId: 1,
        jti: 'uuid-1',
        tokenFamily: 'family-1',
      }));
    });

    it('should rollback transaction when refresh token storage fails', async () => {
      vi.mocked(storeRefreshToken).mockRejectedValue(new Error('DB error'));

      await expect(oauthLogin(req as Request, res as Response))
        .rejects.toThrow('DB error');
    });
  });

  // 신규 refreshToken 핸들러 테스트
  describe('refreshToken', () => {
    it('should rotate refresh token successfully', async () => {
      const mockStoredToken = {
        id: 1,
        tokenHash: 'hash-1',
        userId: 1,
        jti: 'old-jti',
        tokenFamily: 'family-1',
        revoked: false,
        expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      };
      vi.mocked(verifyRefreshToken).mockResolvedValue({ sub: 1, appId: 1, jti: 'old-jti', tokenFamily: 'family-1' });
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);
      vi.mocked(rotateRefreshToken).mockResolvedValue({
        newAccessToken: 'new-access-token',
        newRefreshToken: 'new-refresh-token',
        newJti: 'new-jti',
      });

      await refreshToken(req as Request, res as Response);

      expect(res.json).toHaveBeenCalledWith({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 1800,
      });
    });

    it('should detect refresh token reuse and revoke all tokens', async () => {
      const mockStoredToken = {
        id: 1,
        revoked: true,
        revokedAt: new Date(Date.now() - 10000), // 10초 전 (Grace Period 초과)
        tokenFamily: 'family-1',
      };
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

      await expect(refreshToken(req as Request, res as Response))
        .rejects.toThrow(UnauthorizedException);

      expect(revokeRefreshTokenFamily).toHaveBeenCalledWith('family-1');
    });

    it('should allow retry within grace period', async () => {
      const mockStoredToken = {
        id: 1,
        revoked: true,
        revokedAt: new Date(Date.now() - 3000), // 3초 전 (Grace Period 내)
        tokenFamily: 'family-1',
      };
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

      await expect(refreshToken(req as Request, res as Response))
        .rejects.toThrow(UnauthorizedException);

      expect(revokeRefreshTokenFamily).not.toHaveBeenCalled();
    });

    it('should reject expired refresh token', async () => {
      const mockStoredToken = {
        id: 1,
        revoked: false,
        expiresAt: new Date(Date.now() - 1000), // 1초 전 만료
      };
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

      await expect(refreshToken(req as Request, res as Response))
        .rejects.toThrow(UnauthorizedException);
    });
  });

  // 신규 logout 핸들러 테스트
  describe('logout', () => {
    it('should revoke single refresh token', async () => {
      const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1' };
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);
      req.body = { refreshToken: 'rt_abc123', revokeAll: false };

      await logout(req as Request, res as Response);

      expect(revokeRefreshTokenById).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should revoke all refresh tokens for user', async () => {
      const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1' };
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);
      req.body = { refreshToken: 'rt_abc123', revokeAll: true };

      await logout(req as Request, res as Response);

      expect(revokeRefreshTokensByUserId).toHaveBeenCalledWith(1);
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('should return 204 for already revoked token (idempotent)', async () => {
      const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1', revoked: true };
      vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

      await logout(req as Request, res as Response);

      expect(res.status).toHaveBeenCalledWith(204);
    });
  });
});
```

#### Step 4.2: Green (최소 구현)
**파일**: `src/modules/auth/handlers.ts`

```typescript
import { Request, Response } from 'express';
import {
  generateRefreshToken,
  storeRefreshToken,
  findRefreshTokenByHash,
  verifyRefreshToken,
  rotateRefreshToken,
  revokeRefreshTokenById,
  revokeRefreshTokensByUserId,
  revokeRefreshTokenFamily,
  findAppByCode,
  upsertUser,
  generateJWT,
} from './services';
import { hashRefreshToken, calculateExpiresAt, parseExpiresIn } from './refresh-token.utils';
import { NotFoundException, UnauthorizedException } from '../../utils/errors';
import { oauthLoginSchema, refreshTokenSchema, logoutSchema } from './validators';
import * as authProbe from './auth.probe';

/**
 * OAuth 로그인 통합 핸들러 (수정: Refresh Token 추가 발급)
 * @param req - Express 요청 객체 (body: { code, provider, accessToken })
 * @param res - Express 응답 객체
 * @returns 200: { accessToken, refreshToken, tokenType, expiresIn, user, token(deprecated) }
 */
export const oauthLogin = async (req: Request, res: Response) => {
  // 1. 요청 검증
  const { code, provider, accessToken } = oauthLoginSchema.parse(req.body);

  // 2. 앱 조회
  const app = await findAppByCode(code);
  if (!app) throw new NotFoundException('App', code);

  // 3. OAuth Provider 검증 및 사용자 정보 조회 (기존 로직)
  const oauthProvider = createOAuthProvider(provider, credentials);
  await oauthProvider.verifyToken(accessToken);
  const userInfo = await oauthProvider.getUserInfo(accessToken);

  // 4. 사용자 저장/업데이트
  const user = await upsertUser({ appId: app.id, provider, ...userInfo });

  // 5. Access Token 생성 (app.accessTokenExpiresIn 사용)
  const token = generateJWT(user, app);

  // 6. Refresh Token 생성
  const { refreshToken, jti, tokenFamily } = await generateRefreshToken(user, app);

  // 7. Refresh Token 저장 (bcrypt hash)
  await storeRefreshToken({
    tokenHash: await hashRefreshToken(refreshToken),
    userId: user.id,
    appId: app.id,
    jti,
    tokenFamily,
    expiresAt: calculateExpiresAt(app.refreshTokenExpiresIn),
  });

  // 8. 운영 로그
  authProbe.loginSuccess({ userId: user.id, provider, appCode: app.code });
  authProbe.refreshTokenIssued({ userId: user.id, jti, tokenFamily });

  // 9. 응답
  res.json({
    accessToken: token,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: parseExpiresIn(app.accessTokenExpiresIn),
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
};

/**
 * Refresh Token으로 Access Token 갱신
 * @param req - Express 요청 객체 (body: { refreshToken })
 * @param res - Express 응답 객체
 * @returns 200: { accessToken, refreshToken, tokenType, expiresIn }
 * @throws UnauthorizedException Refresh Token 만료/무효화/재사용 시
 */
export const refreshToken = async (req: Request, res: Response) => {
  // 1. 요청 검증
  const { refreshToken } = refreshTokenSchema.parse(req.body);

  // 2. JWT 서명 검증 (app 조회는 뒤로 연기, 일단 decode만)
  // NOTE: 실제로는 app.jwtSecret이 필요하므로, 먼저 JWT에서 appId를 추출
  const decodedWithoutVerify = jwt.decode(refreshToken) as any;
  const app = await findAppById(decodedWithoutVerify.appId);
  if (!app) throw new NotFoundException('App', decodedWithoutVerify.appId);

  const decoded = await verifyRefreshToken(refreshToken, app);
  const { sub: userId, jti } = decoded;

  // 3. DB에서 Refresh Token 조회 (by hash)
  const tokenHash = await hashRefreshToken(refreshToken);
  const storedToken = await findRefreshTokenByHash(tokenHash);

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
    const timeSinceRevoked = Date.now() - storedToken.revokedAt!.getTime();

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

  // 6. 사용자 조회
  const user = await findUserById(userId);
  if (!user) throw new NotFoundException('User', userId);

  // 7. Token Rotation
  const { newAccessToken, newRefreshToken, newJti } = await rotateRefreshToken({
    oldToken: storedToken,
    user,
    app,
  });

  // 8. 운영 로그
  authProbe.refreshTokenRotated({
    userId,
    oldJti: jti,
    newJti,
    tokenFamily: storedToken.tokenFamily,
  });

  // 9. 응답
  res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    tokenType: 'Bearer',
    expiresIn: parseExpiresIn(app.accessTokenExpiresIn),
  });
};

/**
 * 로그아웃 (Refresh Token 무효화)
 * @param req - Express 요청 객체 (body: { refreshToken, revokeAll? })
 * @param res - Express 응답 객체
 * @returns 204: No Content
 * @throws UnauthorizedException Refresh Token이 존재하지 않음
 */
export const logout = async (req: Request, res: Response) => {
  // 1. 요청 검증
  const { refreshToken, revokeAll = false } = logoutSchema.parse(req.body);

  // 2. JWT 서명 검증
  const decodedWithoutVerify = jwt.decode(refreshToken) as any;
  const app = await findAppById(decodedWithoutVerify.appId);
  if (!app) throw new NotFoundException('App', decodedWithoutVerify.appId);

  const decoded = await verifyRefreshToken(refreshToken, app);
  const { sub: userId, jti } = decoded;

  // 3. DB에서 Refresh Token 조회
  const tokenHash = await hashRefreshToken(refreshToken);
  const storedToken = await findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    throw new UnauthorizedException('Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // 4. Token 무효화
  if (revokeAll) {
    await revokeRefreshTokensByUserId(userId);
    authProbe.refreshTokenRevoked({ userId, jti, revokeAll: true });
  } else {
    await revokeRefreshTokenById(storedToken.id);
    authProbe.refreshTokenRevoked({ userId, jti, revokeAll: false });
  }

  // 5. 응답 (멱등성)
  res.status(204).send();
};
```

#### Step 4.3: Refactor
- 중복 코드 제거
- 에러 핸들링 개선

**제공할 인터페이스** (Junior가 index.ts에서 사용할 것):
```typescript
export const oauthLogin: RequestHandler; // 기존 (수정됨)
export const refreshToken: RequestHandler; // 신규
export const logout: RequestHandler; // 신규
```

**Checklist**:
- [ ] 테스트 작성 (실패 확인)
- [ ] 핸들러 구현 (테스트 통과)
- [ ] 리팩토링 (필요 시)
- [ ] JSDoc 주석 작성 (한국어)
- [ ] context7 MCP로 Express error handling patterns 참조

---

### Task 5: Probes 추가

**파일**: `src/modules/auth/auth.probe.ts` (수정)

**구현 단계**:

```typescript
import logger from '../../utils/logger';

// 기존 probes...

/**
 * Refresh Token 발급 로그 (INFO)
 */
export const refreshTokenIssued = (data: {
  userId: number;
  jti: string;
  tokenFamily: string;
}) => {
  logger.info('Refresh token issued', {
    userId: data.userId,
    jti: data.jti,
    tokenFamily: data.tokenFamily,
  });
};

/**
 * Refresh Token Rotation 로그 (INFO)
 */
export const refreshTokenRotated = (data: {
  userId: number;
  oldJti: string;
  newJti: string;
  tokenFamily: string;
}) => {
  logger.info('Refresh token rotated', {
    userId: data.userId,
    oldJti: data.oldJti,
    newJti: data.newJti,
    tokenFamily: data.tokenFamily,
  });
};

/**
 * Refresh Token 무효화 로그 (INFO)
 */
export const refreshTokenRevoked = (data: {
  userId: number;
  jti: string;
  revokeAll: boolean;
}) => {
  logger.info('Refresh token revoked', {
    userId: data.userId,
    jti: data.jti,
    revokeAll: data.revokeAll,
  });
};

/**
 * Refresh Token 재사용 감지 로그 (ERROR)
 */
export const refreshTokenReuseDetected = (data: {
  userId: number;
  jti: string;
  tokenFamily: string;
  ip: string | undefined;
}) => {
  logger.error('Refresh token reuse detected (security alert)', {
    userId: data.userId,
    jti: data.jti,
    tokenFamily: data.tokenFamily,
    ip: data.ip,
  });
};
```

**Checklist**:
- [ ] 4개의 Probe 함수 추가
- [ ] JSDoc 주석 작성 (한국어)

---

### ⚠️ Junior와의 협업 프로토콜
1. **타입/함수명 공유**: handlers.ts에서 export하는 함수명을 Junior에게 명확히 전달
   - `oauthLogin` (수정)
   - `refreshToken` (신규)
   - `logout` (신규)
2. **진행 상황 공유**: 핸들러 완성 시 Junior에게 알림
3. **질문 대응**: Junior의 질문에 답변
4. **문제 에스컬레이션**: 문제 발생 시 CTO에게 보고

---

## 3. Junior Developer Tasks

### Responsibility
Validators, Router 연결, 에러 코드 추가

---

### Task 1: Validators 작성

**파일**: `src/modules/auth/validators.ts` (수정)

**구현 단계**:

1. **Senior 작업 완료 대기**: handlers.ts 완성될 때까지 대기
2. **validators.ts 읽기**: 기존 oauthLoginSchema 확인
3. **신규 스키마 추가**:

```typescript
import { z } from 'zod';

// 기존 oauthLoginSchema...

/**
 * Refresh Token 요청 스키마
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Logout 요청 스키마
 */
export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  revokeAll: z.boolean().optional().default(false),
});
```

**Checklist**:
- [ ] Senior의 handlers.ts 읽기
- [ ] `refreshTokenSchema` 작성
- [ ] `logoutSchema` 작성
- [ ] JSDoc 주석 작성 (한국어)
- [ ] context7 MCP로 Zod validation patterns 참조

---

### Task 2: Router 연결

**파일**: `src/modules/auth/index.ts` (수정)

**구현 단계**:

1. **Senior의 handlers.ts 읽기**: export된 함수 확인
2. **Router 수정**:

```typescript
import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

// 기존 라우트...
router.post('/oauth', handlers.oauthLogin); // 수정됨 (Refresh Token 추가 발급)
router.get('/oauth/callback', handlers.oauthCallback); // 기존

// 신규 라우트
router.post('/refresh', handlers.refreshToken);
router.post('/logout', handlers.logout);

export default router;
```

**사용할 정확한 함수명** (Senior가 제공):
```typescript
import * as handlers from './handlers';
// handlers.oauthLogin (수정)
// handlers.refreshToken (신규)
// handlers.logout (신규)
```

**Checklist**:
- [ ] Senior의 handlers.ts 읽기
- [ ] 정확한 함수명 import
- [ ] `POST /auth/refresh` 라우트 추가
- [ ] `POST /auth/logout` 라우트 추가
- [ ] JSDoc 주석 작성 (한국어)
- [ ] context7 MCP로 Express Router patterns 참조

---

### Task 3: 에러 코드 추가

**파일**: `src/utils/errors.ts` (수정)

**구현 단계**:

```typescript
// 기존 에러 클래스...

// Refresh Token 관련 에러 코드 (사용 예시, UnauthorizedException에서 사용)
// REFRESH_TOKEN_NOT_FOUND
// REFRESH_TOKEN_EXPIRED
// REFRESH_TOKEN_REVOKED
// REFRESH_TOKEN_REUSE_DETECTED
// INVALID_REFRESH_TOKEN
```

**NOTE**: 에러 코드는 handlers에서 `UnauthorizedException`의 두 번째 파라미터로 전달되므로, 별도 파일 수정 불필요. 단, 문서화 목적으로 주석 추가.

**Checklist**:
- [ ] 에러 코드 주석 추가 (문서화)

---

### Task 4: oauthCallback HTML 수정 (선택)

**파일**: `src/modules/auth/handlers.ts` (oauthCallback 함수)

**구현 단계**:

HTML 응답에 Refresh Token 추가 표시:

```typescript
// oauthCallback 함수 내 HTML 응답 수정
res.send(`
  <!DOCTYPE html>
  <html>
  <head>
    <title>OAuth Login Success</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      .token-box { background: #f0f0f0; padding: 15px; margin: 10px 0; border-radius: 5px; }
      .token { word-break: break-all; font-family: monospace; font-size: 12px; }
    </style>
  </head>
  <body>
    <h1>Login Successful</h1>
    <div class="token-box">
      <h2>Access Token</h2>
      <p class="token">${accessToken}</p>
      <p>Expires in: ${expiresIn} seconds (30 minutes)</p>
    </div>
    <div class="token-box">
      <h2>Refresh Token</h2>
      <p class="token">${refreshToken}</p>
      <p>Expires in: 14 days</p>
    </div>
    <div class="token-box">
      <h2>User Info</h2>
      <pre>${JSON.stringify(user, null, 2)}</pre>
    </div>
  </body>
  </html>
`);
```

**Checklist**:
- [ ] HTML 응답에 Refresh Token 표시 추가
- [ ] Expires in 정보 추가

---

### ⚠️ Senior와의 협업 프로토콜
1. **handlers.ts 읽기 필수**: Senior 작업 완료 후 반드시 파일 읽고 시작
2. **타입/함수명 정확히 일치**: 오타 없이 정확히 import
3. **질문하기**: 의문점 있으면 Senior에게 질문
4. **문제 에스컬레이션**: 문제 발생 시 CTO에게 보고

---

## 4. Work Dependencies

### Dependency Graph
```
Senior (Schema + Migration) → 사용자 (마이그레이션 실행)
                              ↓
Senior (Utils + Services) → Senior (Handlers + Probes)
                              ↓
                     Junior (Validators + Router + Error Codes)
```

### Critical Path
1. **먼저**: Senior - DB 스키마 설계 및 마이그레이션 생성
2. **사용자 작업**: 마이그레이션 실행 (`pnpm drizzle-kit push`)
3. **다음**: Senior - 유틸 함수 구현 (병렬 가능)
4. **다음**: Senior - 서비스 함수 구현
5. **다음**: Senior - 핸들러 구현
6. **다음**: Senior - Probes 추가
7. **마지막**: Junior - Validators, Router, 에러 코드, HTML 수정

---

## 5. Interface Contracts

### Senior → Junior 계약

**Senior가 제공**:
- `src/modules/auth/handlers.ts`
  - `oauthLogin: RequestHandler` (수정)
  - `refreshToken: RequestHandler` (신규)
  - `logout: RequestHandler` (신규)
- JSDoc 주석 (한국어)

**Junior가 사용**:
- `handlers.ts`에서 정확한 함수명 import
- Router에 연결 (`POST /auth/refresh`, `POST /auth/logout`)
- Validators 작성 (Zod 스키마)

**타입 정의**:
```typescript
// Senior가 제공 (services.ts)
export interface RefreshTokenResult {
  refreshToken: string;
  jti: string;
  tokenFamily: string;
}

export interface RotateResult {
  newAccessToken: string;
  newRefreshToken: string;
  newJti: string;
}

// Junior가 사용 (validators.ts)
export const refreshTokenSchema: z.ZodObject<{ refreshToken: z.ZodString }>;
export const logoutSchema: z.ZodObject<{ refreshToken: z.ZodString; revokeAll: z.ZodBoolean }>;
```

---

## 6. Conflict Prevention

### 파일 분리
- **Senior**:
  - `src/modules/auth/schema.ts` (수정)
  - `src/modules/auth/refresh-token.utils.ts` (신규)
  - `src/modules/auth/services.ts` (수정)
  - `src/modules/auth/handlers.ts` (수정)
  - `src/modules/auth/auth.probe.ts` (수정)
  - `tests/unit/auth/refresh-token.utils.test.ts` (신규)
  - `tests/unit/auth/services.test.ts` (수정)
  - `tests/unit/auth/handlers.test.ts` (수정)
- **Junior**:
  - `src/modules/auth/validators.ts` (수정)
  - `src/modules/auth/index.ts` (수정)
  - `src/utils/errors.ts` (주석 추가)

**동시 수정 파일 없음** → 충돌 없음

### 작업 순서 강제
- Junior는 Senior의 handlers.ts 완료 후 시작
- 의존성 명확

### 커뮤니케이션
- Senior/Junior가 서로 피드백
- 문제 시 즉시 CTO에게 보고

---

## 7. MCP Tool Usage

### Senior Developer
- **context7**: Vitest 테스트 패턴, Express 에러 핸들링, Drizzle transaction, bcrypt best practices
- **claude-mem**: 과거 TDD 사이클, 버그 해결 방법
- **Supabase** (⚠️ SELECT만): 실제 DB 컬럼 타입 확인
  ```sql
  SELECT table_name FROM information_schema.tables WHERE table_name = 'refresh_tokens';
  SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'apps';
  ```

### Junior Developer
- **context7**: Express Router 패턴, Zod validation
- **claude-mem**: 과거 Router 작성 패턴
- **Supabase** (⚠️ SELECT만): DB 테이블 구조 확인

---

## 8. Quality Gates

### Senior Checklist
- [ ] 모든 테스트 통과 (`pnpm test`)
- [ ] TDD 사이클 준수 (Red → Green → Refactor)
- [ ] JSDoc 주석 완성 (한국어)
- [ ] 에러 핸들링 구현 (Reuse Detection, Grace Period)
- [ ] DB 쿼리 최적화 (트랜잭션)
- [ ] bcrypt 해싱 (salt rounds: 10)
- [ ] Token Rotation 구현 (원자적 수행)

### Junior Checklist
- [ ] 정확한 함수명 import (오타 없음)
- [ ] Router 연결 완료 (`POST /auth/refresh`, `POST /auth/logout`)
- [ ] Validators 작성 완료 (Zod)
- [ ] JSDoc 주석 작성 (한국어)
- [ ] 빌드 성공 (`pnpm build`)

### CTO Checklist
- [ ] 통합 테스트 통과
- [ ] CLAUDE.md 표준 준수
  - [ ] Express 미들웨어 기반 설계
  - [ ] Drizzle ORM 적절히 사용
  - [ ] 단위 테스트 중심
  - [ ] JSDoc 주석 완성
  - [ ] 파일 구조 `src/modules/[feature]/` 패턴
- [ ] 보안 검증
  - [ ] bcrypt 해싱 적용
  - [ ] Token Rotation 구현
  - [ ] Reuse Detection 작동
  - [ ] Grace Period (5초)
- [ ] 마이그레이션 확인 (Supabase MCP)

---

## 9. Next Steps

1. **Senior Developer**: DB 스키마 및 마이그레이션 생성 → 사용자에게 실행 요청
2. **사용자**: 마이그레이션 실행 (`pnpm drizzle-kit push`)
3. **Senior Developer**: 유틸 함수, 서비스 함수, 핸들러, Probes 구현 (TDD)
4. **Junior Developer**: Validators, Router, 에러 코드, HTML 수정
5. **CTO**: 통합 리뷰 수행 (cto-review.md 작성)
6. **Independent Reviewer**: 검증 (review-report.md)
7. **API Documenter**: OpenAPI 스펙 업데이트
8. **최종 사용자 승인**

---

## 10. Estimated Time

| 작업 | 담당자 | 예상 시간 |
|------|--------|-----------|
| DB 스키마 + 마이그레이션 | Senior | 2h |
| 마이그레이션 실행 | 사용자 | 0.5h |
| 유틸 함수 구현 | Senior | 2h |
| 서비스 함수 구현 | Senior | 6h |
| 핸들러 구현 | Senior | 4h |
| Probes 추가 | Senior | 1h |
| Validators + Router | Junior | 2h |
| 에러 코드 + HTML | Junior | 1h |
| 테스트 작성 및 통과 | Senior + Junior | 10h |
| CTO 리뷰 | CTO | 2h |
| **Total** | | **~30.5h** |

---

## 11. Risk Mitigation

### Risk 1: Grace Period 악용
- **완화 전략**: 운영 로그 모니터링 (ERROR 레벨, Reuse Detection)
- **향후 개선**: Rate Limiting 추가

### Risk 2: bcrypt 성능 병목
- **완화 전략**: Salt rounds 10 유지
- **향후 개선**: Redis 캐시 도입

### Risk 3: DB 저장 실패 시 트랜잭션 롤백
- **완화 전략**: 트랜잭션 사용 (Drizzle ORM)
- **ERROR 로그 기록**

### Risk 4: Access Token Blacklist 미구현
- **완화 전략**: Access Token 만료 시간 단축 (30분)
- **향후 개선**: Redis 기반 Blacklist 도입

---

## 12. References

- [Refresh Token Rotation: Best Practices](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)
- [Auth0 - Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [Password Security: Bcrypt](https://calmops.com/programming/web/password-security-bcrypt-hashing-reset-flows/)
- [Okta - Refresh Tokens](https://developer.okta.com/docs/guides/refresh-tokens/main/)
- [brief.md](./brief.md)
- [user-story.md](./user-story.md)

---

**문서 버전**: 1.0
**최종 수정일**: 2026-01-17
**작성자**: CTO (Claude Code)
**다음 단계**: Senior/Junior 개발 시작
