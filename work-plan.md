# Work Distribution Plan: Multi-Provider OAuth Authentication System

> 생성일: 2026-01-15
> 기반 문서: cheeky-imagining-spindle.md (계획 문서)
> CTO: 작업 분배 및 통합 검증

---

## 1. Work Overview

### Total Scope
멀티 제공자 OAuth 인증 시스템 구현 (카카오/네이버/구글/애플 지원 구조, 1단계는 카카오만 구현)

**핵심 기능**:
- 앱별 OAuth 크레덴셜 관리 (apps 테이블)
- 멀티 제공자 사용자 통합 관리 (users 테이블, provider + provider_id)
- Provider Strategy 패턴 (확장 가능한 구조)
- JWT 토큰 발급 (앱별 시크릿)
- TDD 기반 개발

### Complexity Assessment
- **Business Logic**: High (Provider 패턴, OAuth 플로우, JWT 생성)
- **Database Operations**: Medium (apps, users 테이블 및 upsert 로직)
- **Testing Complexity**: High (외부 API mocking, TDD 사이클)

### Dependencies
- ✅ 의존성 설치 완료 (drizzle-orm, postgres, jsonwebtoken, zod, axios, pino)
- ⚠️ package.json scripts 업데이트 필요
- ⚠️ drizzle.config.ts 생성 필요
- ⚠️ Vitest 설정 필요

---

## 2. Senior Developer Tasks

### Responsibility
복잡한 비즈니스 로직, TDD 사이클, Provider 패턴 구현, 외부 API 통합

---

### Task 1: Infrastructure Setup (Configuration & Error Handling)

**파일들**:
- `drizzle.config.ts`
- `vitest.config.ts`
- `src/config/database.ts`
- `src/config/env.ts`
- `src/utils/errors.ts`
- `src/utils/logger.ts`
- `src/utils/jwt.ts`
- `src/middleware/error-handler.ts`

**구현 단계**:

#### 1.1 Update package.json Scripts
```json
{
  "scripts": {
    "test": "vitest",
    "test:watch": "vitest --watch",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push"
  }
}
```

#### 1.2 drizzle.config.ts
```typescript
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './src/modules/*/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

#### 1.3 vitest.config.ts
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
```

#### 1.4 src/config/database.ts
```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
```

#### 1.5 src/config/env.ts (with Zod validation)
```typescript
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET_FALLBACK: z.string().min(32),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001'),
});

export const env = envSchema.parse(process.env);
```

#### 1.6 src/utils/errors.ts
**CLAUDE.md 예외 처리 가이드 준수**
```typescript
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
```

#### 1.7 src/utils/logger.ts
```typescript
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});
```

#### 1.8 src/utils/jwt.ts
```typescript
import jwt from 'jsonwebtoken';

/**
 * JWT 토큰 생성
 */
export function signToken(payload: object, secret: string, expiresIn: string): string {
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * JWT 토큰 검증
 */
export function verifyToken(token: string, secret: string): any {
  return jwt.verify(token, secret);
}
```

#### 1.9 src/middleware/error-handler.ts
```typescript
import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppException, ValidationException } from '../utils/errors';
import { logger } from '../utils/logger';

/**
 * 전역 에러 핸들러
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
        details: err.errors,
      },
    });
  }

  // AppException 처리
  if (err instanceof AppException) {
    logger.warn('Application error', {
      name: err.name,
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
    });

    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        code: err.code,
      },
    });
  }

  // 예상치 못한 에러
  logger.error('Unexpected error', { error: err, stack: err.stack });

  return res.status(500).json({
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
  });
};
```

**Checklist**:
- [ ] package.json scripts 추가
- [ ] drizzle.config.ts 작성
- [ ] vitest.config.ts 작성
- [ ] src/config/database.ts 작성
- [ ] src/config/env.ts 작성 (Zod 검증)
- [ ] src/utils/errors.ts 작성 (계층 구조)
- [ ] src/utils/logger.ts 작성
- [ ] src/utils/jwt.ts 작성
- [ ] src/middleware/error-handler.ts 작성
- [ ] .env에 JWT_SECRET_FALLBACK 추가

---

### Task 2: Database Schema & Migration

**파일들**:
- `src/modules/auth/schema.ts`
- `drizzle/migrations/*` (자동 생성)

**구현 단계**:

#### 2.1 src/modules/auth/schema.ts
**멀티 제공자 지원 스키마**
```typescript
import { pgTable, serial, varchar, boolean, timestamp, integer, jsonb, unique } from 'drizzle-orm/pg-core';

/**
 * 앱 테이블 (멀티 OAuth 제공자 크레덴셜 관리)
 */
export const apps = pgTable('apps', {
  id: serial('id').primaryKey(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),

  // 카카오 OAuth
  kakaoRestApiKey: varchar('kakao_rest_api_key', { length: 255 }),
  kakaoClientSecret: varchar('kakao_client_secret', { length: 255 }),

  // 네이버 OAuth (향후)
  naverClientId: varchar('naver_client_id', { length: 255 }),
  naverClientSecret: varchar('naver_client_secret', { length: 255 }),

  // 구글 OAuth (향후)
  googleClientId: varchar('google_client_id', { length: 255 }),
  googleClientSecret: varchar('google_client_secret', { length: 255 }),

  // 애플 OAuth (향후)
  appleClientId: varchar('apple_client_id', { length: 255 }),
  appleTeamId: varchar('apple_team_id', { length: 255 }),
  appleKeyId: varchar('apple_key_id', { length: 255 }),
  applePrivateKey: varchar('apple_private_key'),

  jwtSecret: varchar('jwt_secret', { length: 255 }).notNull(),
  jwtExpiresIn: varchar('jwt_expires_in', { length: 20 }).notNull().default('7d'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

/**
 * 사용자 테이블 (멀티 제공자 통합 관리)
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  appId: integer('app_id').notNull().references(() => apps.id, { onDelete: 'cascade' }),

  provider: varchar('provider', { length: 20 }).notNull(), // 'kakao' | 'naver' | 'google' | 'apple'
  providerId: varchar('provider_id', { length: 100 }).notNull(),

  email: varchar('email', { length: 255 }),
  nickname: varchar('nickname', { length: 255 }),
  profileImage: varchar('profile_image', { length: 500 }),

  appMetadata: jsonb('app_metadata').default({}),
  lastLoginAt: timestamp('last_login_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
}, (table) => ({
  uniqueProviderUser: unique().on(table.appId, table.provider, table.providerId),
}));
```

#### 2.2 Generate & Apply Migrations
```bash
pnpm db:generate
# 사용자가 직접 실행: pnpm db:push (또는 pnpm db:migrate)
```

#### 2.3 Seed apps Table (Manual)
**사용자에게 안내**: 다음 SQL을 Supabase에서 실행 필요
```sql
INSERT INTO apps (
  code,
  name,
  kakao_rest_api_key,
  kakao_client_secret,
  jwt_secret,
  jwt_expires_in
)
VALUES (
  'test-app',
  'Test Application',
  'your-kakao-rest-api-key',
  'your-kakao-client-secret',
  'your-jwt-secret-at-least-32-chars-long',
  '7d'
);
```

**Checklist**:
- [ ] src/modules/auth/schema.ts 작성
- [ ] pnpm db:generate 실행
- [ ] ⚠️ 사용자에게 마이그레이션 실행 요청 (pnpm db:push)
- [ ] ⚠️ 사용자에게 apps 테이블 시드 데이터 INSERT 요청

---

### Task 3: Request Validation (TDD)

**파일들**:
- `tests/unit/auth/validators.test.ts`
- `src/modules/auth/validators.ts`

**구현 단계**:

#### 3.1 Write Test: tests/unit/auth/validators.test.ts
**Red 단계**
```typescript
import { describe, it, expect } from 'vitest';
import { oauthLoginSchema } from '../../../src/modules/auth/validators';

describe('oauthLoginSchema', () => {
  it('should validate valid request', () => {
    const data = {
      code: 'test-app',
      provider: 'kakao',
      accessToken: 'valid-token',
    };
    expect(() => oauthLoginSchema.parse(data)).not.toThrow();
  });

  it('should throw on missing code', () => {
    const data = { provider: 'kakao', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on missing provider', () => {
    const data = { code: 'test-app', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on missing accessToken', () => {
    const data = { code: 'test-app', provider: 'kakao' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on invalid code format', () => {
    const data = { code: 'INVALID_CODE', provider: 'kakao', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should throw on invalid provider', () => {
    const data = { code: 'test-app', provider: 'facebook', accessToken: 'token' };
    expect(() => oauthLoginSchema.parse(data)).toThrow();
  });

  it('should accept all valid providers', () => {
    const providers = ['kakao', 'naver', 'google', 'apple'];
    providers.forEach(provider => {
      const data = { code: 'test-app', provider, accessToken: 'token' };
      expect(() => oauthLoginSchema.parse(data)).not.toThrow();
    });
  });
});
```

#### 3.2 Implement: src/modules/auth/validators.ts
**Green 단계**
```typescript
import { z } from 'zod';

/**
 * 지원하는 OAuth 제공자 타입
 */
export const OAuthProvider = z.enum(['kakao', 'naver', 'google', 'apple']);
export type OAuthProvider = z.infer<typeof OAuthProvider>;

/**
 * OAuth 로그인 요청 스키마
 */
export const oauthLoginSchema = z.object({
  code: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Invalid app code format'),
  provider: OAuthProvider,
  accessToken: z.string().min(1, 'Access token is required'),
});

export type OAuthLoginRequest = z.infer<typeof oauthLoginSchema>;
```

#### 3.3 Run Tests
```bash
pnpm test validators.test.ts
```

**Checklist**:
- [ ] 테스트 작성 (실패 확인)
- [ ] validators.ts 구현 (테스트 통과)
- [ ] pnpm test 실행하여 모든 테스트 통과 확인

---

### Task 4: OAuth Provider Strategy Pattern (TDD)

**파일들**:
- `src/modules/auth/types.ts`
- `src/modules/auth/providers/base.ts`
- `tests/unit/auth/providers/kakao.test.ts`
- `src/modules/auth/providers/kakao.ts`
- `src/modules/auth/providers/index.ts`

**구현 단계**:

#### 4.1 src/modules/auth/types.ts
```typescript
/**
 * OAuth 제공자별 사용자 정보 (정규화된 형태)
 */
export interface OAuthUserInfo {
  providerId: string;
  email: string | null;
  nickname: string | null;
  profileImage: string | null;
}

/**
 * JWT 페이로드 인터페이스 (최소화)
 */
export interface JWTPayload {
  sub: number;              // users.id (JWT 표준)
  appId: number;
  email: string | null;
  nickname: string | null;
  iat?: number;
  exp?: number;
}

/**
 * 카카오 API 응답 타입
 */
export interface KakaoTokenInfo {
  id: number;
  expires_in: number;
  app_id: number;
}

export interface KakaoUserInfo {
  id: number;
  kakao_account?: {
    email?: string;
  };
  properties?: {
    nickname?: string;
    profile_image?: string;
  };
}
```

#### 4.2 src/modules/auth/providers/base.ts
```typescript
import { OAuthUserInfo } from '../types';

/**
 * OAuth Provider 공통 인터페이스
 */
export interface IOAuthProvider {
  /**
   * Access Token 유효성 검증
   * @throws UnauthorizedException 토큰이 유효하지 않은 경우
   * @throws ExternalApiException 외부 API 호출 실패 시
   */
  verifyToken(accessToken: string): Promise<void>;

  /**
   * 사용자 정보 조회 (정규화된 형태로 반환)
   * @throws ExternalApiException 외부 API 호출 실패 시
   */
  getUserInfo(accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Provider 이름
   */
  readonly name: string;
}
```

#### 4.3 Write Test: tests/unit/auth/providers/kakao.test.ts
**Red 단계**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { KakaoProvider } from '../../../../src/modules/auth/providers/kakao';
import { UnauthorizedException, ExternalApiException } from '../../../../src/utils/errors';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('KakaoProvider', () => {
  let provider: KakaoProvider;

  beforeEach(() => {
    provider = new KakaoProvider('test-api-key', 'test-secret');
    vi.clearAllMocks();
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 123, app_id: Number('test-api-key'), expires_in: 3600 },
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when app_id mismatch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 123, app_id: 999999, expires_in: 3600 },
      });

      await expect(provider.verifyToken('valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should wrap axios error in ExternalApiException', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });

  describe('getUserInfo', () => {
    it('should return normalized user info when valid token', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          id: 123,
          kakao_account: { email: 'test@example.com' },
          properties: { nickname: '홍길동', profile_image: 'https://example.com/image.jpg' },
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '123',
        email: 'test@example.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      });
    });

    it('should handle optional fields as null', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: 123 },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '123',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('should wrap axios error in ExternalApiException', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });
});
```

#### 4.4 Implement: src/modules/auth/providers/kakao.ts
**Green 단계**
```typescript
import axios from 'axios';
import { IOAuthProvider } from './base';
import { OAuthUserInfo, KakaoTokenInfo, KakaoUserInfo } from '../types';
import {
  UnauthorizedException,
  ExternalApiException,
  ErrorCode
} from '../../../utils/errors';

export class KakaoProvider implements IOAuthProvider {
  readonly name = 'kakao';

  constructor(
    private readonly restApiKey: string,
    private readonly clientSecret: string
  ) {}

  /**
   * 카카오 토큰 유효성 검증
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      const response = await axios.get<KakaoTokenInfo>(
        'https://kapi.kakao.com/v1/user/access_token_info',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      // App ID 검증
      if (response.data.app_id !== Number(this.restApiKey)) {
        throw new UnauthorizedException(
          'Kakao app ID mismatch',
          ErrorCode.INVALID_TOKEN
        );
      }
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new ExternalApiException('kakao', error);
    }
  }

  /**
   * 카카오 사용자 정보 조회 및 정규화
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    try {
      const response = await axios.get<KakaoUserInfo>(
        'https://kapi.kakao.com/v2/user/me',
        {
          headers: { Authorization: `Bearer ${accessToken}` }
        }
      );

      const { id, kakao_account, properties } = response.data;

      return {
        providerId: id.toString(),
        email: kakao_account?.email ?? null,
        nickname: properties?.nickname ?? null,
        profileImage: properties?.profile_image ?? null,
      };
    } catch (error: any) {
      throw new ExternalApiException('kakao', error);
    }
  }
}
```

#### 4.5 src/modules/auth/providers/index.ts
```typescript
import { IOAuthProvider } from './base';
import { KakaoProvider } from './kakao';
import { ValidationException } from '../../../utils/errors';

interface ProviderCredentials {
  kakao?: {
    restApiKey: string;
    clientSecret: string;
  };
  // 향후 추가: naver, google, apple
}

/**
 * Provider 인스턴스 생성 팩토리
 */
export function createOAuthProvider(
  provider: string,
  credentials: ProviderCredentials
): IOAuthProvider {
  switch (provider) {
    case 'kakao':
      if (!credentials.kakao) {
        throw new ValidationException('Kakao credentials not configured');
      }
      return new KakaoProvider(
        credentials.kakao.restApiKey,
        credentials.kakao.clientSecret
      );

    // 향후 추가: case 'naver', 'google', 'apple'

    default:
      throw new ValidationException(`Unsupported provider: ${provider}`);
  }
}
```

#### 4.6 Run Tests
```bash
pnpm test kakao.test.ts
```

**Checklist**:
- [ ] src/modules/auth/types.ts 작성
- [ ] src/modules/auth/providers/base.ts 작성
- [ ] 테스트 작성 (실패 확인)
- [ ] KakaoProvider 구현 (테스트 통과)
- [ ] Provider factory 작성
- [ ] pnpm test 실행하여 모든 테스트 통과 확인
- [ ] context7 MCP로 axios mocking 패턴 참조 (필요 시)

---

### Task 5: Database Operations & JWT Generation (TDD)

**파일들**:
- `tests/unit/auth/services.test.ts`
- `src/modules/auth/services.ts`

**구현 단계**:

#### 5.1 Write Test: tests/unit/auth/services.test.ts
**Red 단계**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findAppByCode, upsertUser, generateJWT } from '../../../src/modules/auth/services';
import { db } from '../../../src/config/database';

vi.mock('../../../src/config/database', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

describe('services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findAppByCode', () => {
    it('should return app when found', async () => {
      const mockApp = { id: 1, code: 'test-app', name: 'Test App' };
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockApp]),
          }),
        }),
      } as any);

      const result = await findAppByCode('test-app');
      expect(result).toEqual(mockApp);
    });

    it('should return null when not found', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const result = await findAppByCode('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('generateJWT', () => {
    it('should generate valid JWT with minimal payload', () => {
      const user = { id: 123, email: 'test@example.com', nickname: '홍길동' };
      const app = { id: 1, jwtSecret: 'test-secret-at-least-32-chars-long', jwtExpiresIn: '7d' };

      const token = generateJWT(user, app);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');

      // JWT 디코드하여 페이로드 확인
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      expect(payload.sub).toBe(123);
      expect(payload.appId).toBe(1);
      expect(payload.email).toBe('test@example.com');
      expect(payload.nickname).toBe('홍길동');
      expect(payload).not.toHaveProperty('userId'); // 중복 제거
      expect(payload).not.toHaveProperty('appCode'); // 중복 제거
    });
  });

  describe('upsertUser', () => {
    it('should create new user when not exists', async () => {
      const newUser = {
        id: 1,
        appId: 1,
        provider: 'kakao',
        providerId: '123',
        email: 'test@example.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      };

      // Existing user 조회: 없음
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      // Insert
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([newUser]),
        }),
      } as any);

      const result = await upsertUser({
        appId: 1,
        provider: 'kakao',
        providerId: '123',
        email: 'test@example.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      });

      expect(result).toEqual(newUser);
    });

    it('should update existing user', async () => {
      const existingUser = { id: 1, appId: 1, provider: 'kakao', providerId: '123' };
      const updatedUser = { ...existingUser, email: 'updated@example.com' };

      // Existing user 조회: 있음
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingUser]),
          }),
        }),
      } as any);

      // Update
      vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedUser]),
          }),
        }),
      } as any);

      const result = await upsertUser({
        appId: 1,
        provider: 'kakao',
        providerId: '123',
        email: 'updated@example.com',
        nickname: '홍길동',
        profileImage: null,
      });

      expect(result).toEqual(updatedUser);
    });
  });
});
```

#### 5.2 Implement: src/modules/auth/services.ts
**Green 단계**
```typescript
import { db } from '../../config/database';
import { apps, users } from './schema';
import { eq, and } from 'drizzle-orm';
import { signToken } from '../../utils/jwt';
import { JWTPayload } from './types';

/**
 * 앱 코드로 앱 조회
 */
export async function findAppByCode(code: string) {
  const result = await db.select().from(apps).where(eq(apps.code, code)).limit(1);
  return result[0] || null;
}

/**
 * 사용자 생성 또는 업데이트 (멀티 제공자 지원)
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
```

#### 5.3 Run Tests
```bash
pnpm test services.test.ts
```

**Checklist**:
- [ ] 테스트 작성 (실패 확인)
- [ ] services.ts 구현 (테스트 통과)
- [ ] pnpm test 실행하여 모든 테스트 통과 확인

---

### Task 6: Main Handler & Domain Logging (TDD)

**파일들**:
- `src/modules/auth/auth.probe.ts`
- `tests/unit/auth/handlers.test.ts`
- `src/modules/auth/handlers.ts`

**구현 단계**:

#### 6.1 src/modules/auth/auth.probe.ts
**Domain Probe 패턴 (CLAUDE.md 로깅 가이드)**
```typescript
import { logger } from '../../utils/logger';

/**
 * 로그인 성공 로그 (INFO)
 */
export const loginSuccess = (data: {
  userId: number;
  provider: string;
  appCode: string;
}) => {
  logger.info('User logged in successfully', {
    userId: data.userId,
    provider: data.provider,
    appCode: data.appCode,
  });
};

/**
 * 로그인 실패 로그 (WARN)
 */
export const loginFailed = (data: {
  provider: string;
  appCode: string;
  reason: string;
}) => {
  logger.warn('User login failed', {
    provider: data.provider,
    appCode: data.appCode,
    reason: data.reason,
  });
};

/**
 * 신규 사용자 등록 로그 (INFO)
 */
export const userRegistered = (data: {
  userId: number;
  provider: string;
  appCode: string;
}) => {
  logger.info('New user registered', {
    userId: data.userId,
    provider: data.provider,
    appCode: data.appCode,
  });
};
```

#### 6.2 Write Test: tests/unit/auth/handlers.test.ts
**Red 단계** (복잡한 테스트이므로 주요 케이스만 작성)
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import { oauthLogin } from '../../../src/modules/auth/handlers';

// Mock all dependencies
vi.mock('../../../src/modules/auth/validators');
vi.mock('../../../src/modules/auth/services');
vi.mock('../../../src/modules/auth/providers');
vi.mock('../../../src/modules/auth/auth.probe');

describe('oauthLogin handler', () => {
  let req: Partial<Request>;
  let res: Partial<Response>;

  beforeEach(() => {
    req = {
      body: {
        code: 'test-app',
        provider: 'kakao',
        accessToken: 'valid-token',
      },
    };

    res = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis(),
    };

    vi.clearAllMocks();
  });

  it('should return token and user on successful login', async () => {
    // Setup mocks for success case
    // (상세 구현은 실제 TDD 사이클에서 작성)

    await oauthLogin(req as Request, res as Response);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({
          id: expect.any(Number),
          provider: 'kakao',
        }),
      })
    );
  });

  it('should throw NotFoundException when app not found', async () => {
    // Setup mocks for app not found
    // (상세 구현은 실제 TDD 사이클에서 작성)

    await expect(oauthLogin(req as Request, res as Response)).rejects.toThrow('App not found');
  });

  it('should throw ValidationException when provider not configured', async () => {
    // Setup mocks for provider not configured
    // (상세 구현은 실제 TDD 사이클에서 작성)

    await expect(oauthLogin(req as Request, res as Response)).rejects.toThrow('not configured');
  });

  // 추가 테스트: UnauthorizedException, ExternalApiException 등
});
```

#### 6.3 Implement: src/modules/auth/handlers.ts
**Green 단계**
```typescript
import { Request, Response } from 'express';
import { oauthLoginSchema } from './validators';
import { findAppByCode, upsertUser, generateJWT } from './services';
import { createOAuthProvider } from './providers';
import { NotFoundException, ValidationException } from '../../utils/errors';
import { logger } from '../../utils/logger';
import * as authProbe from './auth.probe';

/**
 * OAuth 로그인 통합 핸들러 (카카오/네이버/구글/애플)
 */
export const oauthLogin = async (req: Request, res: Response) => {
  const { code, provider, accessToken } = oauthLoginSchema.parse(req.body);

  logger.debug('OAuth login attempt', { code, provider });

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

    // 7. 운영 로그
    authProbe.loginSuccess({
      userId: user.id,
      provider,
      appCode: app.code,
    });

    // 8. 응답 (CLAUDE.md API Response 가이드: camelCase)
    res.json({
      token,
      user: {
        id: user.id,
        provider: user.provider,
        email: user.email,
        nickname: user.nickname,
        profileImage: user.profileImage,
        appCode: app.code,
        lastLoginAt: user.lastLoginAt,
      },
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
```

#### 6.4 Run Tests
```bash
pnpm test handlers.test.ts
```

**Checklist**:
- [ ] auth.probe.ts 작성 (Domain Probe 패턴)
- [ ] 테스트 작성 (실패 확인)
- [ ] handlers.ts 구현 (테스트 통과)
- [ ] pnpm test 실행하여 모든 테스트 통과 확인
- [ ] context7 MCP로 Express 에러 핸들링 패턴 참조 (필요 시)

**제공할 인터페이스** (Junior가 사용할 것):
```typescript
export const oauthLogin: RequestHandler;
```

---

### ⚠️ Junior와의 협업 프로토콜

1. **함수명 공유**: handlers.ts에서 export하는 `oauthLogin` 함수를 Junior에게 전달
2. **진행 상황 공유**: 모든 핸들러 및 테스트 완성 후 Junior에게 알림
3. **질문 대응**: Junior가 Router 작성 시 질문에 답변
4. **문제 에스컬레이션**: 문제 발생 시 CTO에게 보고

---

## 3. Junior Developer Tasks

### Responsibility
Router 연결, app.ts 설정, 간단한 보일러플레이트 작성

---

### Task 1: Router 연결

**파일**: `src/modules/auth/index.ts`

**구현 단계**:

#### 1.1 Senior 작업 완료 대기
- Senior의 handlers.ts 완성될 때까지 대기
- Senior로부터 `oauthLogin` 함수명 확인

#### 1.2 handlers.ts 읽기
```bash
# Senior가 완성한 파일 확인
cat src/modules/auth/handlers.ts
```

#### 1.3 Router 작성
```typescript
import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();

/**
 * POST /auth/oauth
 * 통합 OAuth 로그인 (카카오/네이버/구글/애플)
 * Body: { code, provider, accessToken }
 */
router.post('/oauth', handlers.oauthLogin);

export default router;
```

**사용할 정확한 함수명** (Senior가 제공):
```typescript
import * as handlers from './handlers';
// handlers.oauthLogin
```

**Checklist**:
- [ ] Senior의 handlers.ts 완성 확인
- [ ] handlers.ts 읽고 정확한 함수명 확인
- [ ] Router 작성 (import 및 연결)
- [ ] JSDoc 주석 작성 (한국어)
- [ ] context7 MCP로 Express Router 패턴 참조 (필요 시)

---

### Task 2: App Integration (server.ts → app.ts + server.ts)

**파일들**:
- `src/app.ts` (신규 생성)
- `src/server.ts` (기존 수정)

**구현 단계**:

#### 2.1 src/app.ts 작성
```typescript
import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import authRouter from './modules/auth';
import { errorHandler } from './middleware/error-handler';

export const app = express();

// Middleware
app.use(express.json());

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'gaegulzip-server API', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

app.use('/auth', authRouter);

// Error handling (must be last)
app.use(errorHandler);
```

#### 2.2 src/server.ts 수정
```typescript
import { app } from './app';

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
```

**Checklist**:
- [ ] Senior의 errorHandler 미들웨어 완성 확인
- [ ] authRouter import 경로 정확히 일치
- [ ] app.ts 작성
- [ ] server.ts 수정
- [ ] JSDoc 주석 작성 (한국어)
- [ ] pnpm build 성공 확인

---

### Task 3: Update .env

**파일**: `.env`

**구현 단계**:

#### 3.1 .env에 JWT_SECRET_FALLBACK 추가
```env
DATABASE_URL=postgresql://postgres:IBsFYqAjT3XvGpAu@db.phlvspvdvclhrmkkiecn.supabase.co:5432/postgres
JWT_SECRET_FALLBACK=change-this-in-production-please-at-least-32-chars-long
NODE_ENV=development
PORT=3001
```

**Checklist**:
- [ ] .env 파일에 JWT_SECRET_FALLBACK 추가 (최소 32자)
- [ ] 기존 DATABASE_URL 유지

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
Senior: Infrastructure Setup (Task 1)
         ↓
Senior: Database Schema (Task 2)
         ↓
사용자: 마이그레이션 실행 (pnpm db:push)
         ↓
Senior: Request Validation (Task 3)
         ↓
Senior: OAuth Provider Pattern (Task 4)
         ↓
Senior: DB Operations & JWT (Task 5)
         ↓
Senior: Main Handler & Logging (Task 6)
         ↓
Junior: Router 연결 (Task 1)
         ↓
Junior: App Integration (Task 2)
         ↓
Junior: .env 업데이트 (Task 3)
```

### Critical Path
1. **먼저**: Senior - Infrastructure Setup
2. **다음**: Senior - Database Schema
3. **사용자 작업**: 마이그레이션 실행 (pnpm db:push) + apps 테이블 시드 데이터 INSERT
4. **다음**: Senior - Validation, Provider, Services, Handlers (순차 또는 병렬)
5. **마지막**: Junior - Router, App Integration

---

## 5. Interface Contracts

### Senior → Junior 계약

**Senior가 제공**:
- `src/modules/auth/handlers.ts`
  - `export const oauthLogin: RequestHandler`
- `src/middleware/error-handler.ts`
  - `export const errorHandler: ErrorRequestHandler`
- JSDoc 주석 (한국어)

**Junior가 사용**:
```typescript
// src/modules/auth/index.ts
import * as handlers from './handlers';
router.post('/oauth', handlers.oauthLogin);

// src/app.ts
import { errorHandler } from './middleware/error-handler';
app.use(errorHandler);
```

**타입 정의**:
- Senior가 정의: `OAuthLoginRequest`, `JWTPayload`, `OAuthUserInfo`
- Junior는 import 불필요 (Router만 연결)

---

## 6. Conflict Prevention

### 파일 분리
- **Senior 담당**:
  - `drizzle.config.ts`, `vitest.config.ts`
  - `src/config/*`
  - `src/utils/*`
  - `src/middleware/error-handler.ts`
  - `src/modules/auth/schema.ts`, `types.ts`, `validators.ts`, `providers/*`, `services.ts`, `handlers.ts`, `auth.probe.ts`
  - `tests/unit/auth/*`

- **Junior 담당**:
  - `src/modules/auth/index.ts` (Router만)
  - `src/app.ts`
  - `src/server.ts` (수정)
  - `.env` (추가)

### 동시 수정 파일 없음 → 충돌 없음

### 작업 순서 강제
- Junior는 Senior 완료 후 시작
- 명확한 의존성 체인

---

## 7. MCP Tool Usage

### Senior Developer
- **context7**: Vitest mocking 패턴, Express async 에러 핸들링, axios 모킹
- **claude-mem**: 과거 TDD 사이클, Provider 패턴 구현 방법
- **Supabase** (⚠️ SELECT만): 실제 DB 스키마 확인 (마이그레이션 후)

### Junior Developer
- **context7**: Express Router 패턴, app.ts 구조
- **claude-mem**: 과거 Router 작성 패턴
- **Read**: Senior의 handlers.ts 읽고 정확한 함수명 확인

---

## 8. Quality Gates

### Senior Checklist
- [ ] 모든 단위 테스트 통과 (`pnpm test`)
- [ ] TDD 사이클 준수 (Red → Green → Refactor)
- [ ] JSDoc 주석 완성 (한국어)
- [ ] 에러 핸들링 구현 (AppException 계층)
- [ ] Provider 패턴 적용 (IOAuthProvider 인터페이스)
- [ ] 외부 API 에러 감싸기 (ExternalApiException)
- [ ] Domain Probe 패턴 적용 (auth.probe.ts)

### Junior Checklist
- [ ] 정확한 함수명 import (오타 없음)
- [ ] Router 연결 완료
- [ ] app.ts/server.ts 수정 완료
- [ ] JSDoc 주석 작성 (한국어)
- [ ] 빌드 성공 (`pnpm build`)
- [ ] .env 업데이트 완료

### 통합 Checklist (CTO 검증)
- [ ] 마이그레이션 적용 완료 (사용자 작업)
- [ ] apps 테이블 시드 데이터 존재
- [ ] 모든 테스트 통과
- [ ] 빌드 성공
- [ ] 개발 서버 실행 가능 (`pnpm dev`)

---

## 9. Next Steps

### Senior/Junior 작업 완료 후
1. CTO가 통합 리뷰 수행 (cto-review.md 작성)
2. 빌드 및 테스트 검증
3. 수동 API 테스트 (카카오 로그인)

### 사용자 작업 필요 (Senior 완료 후)
1. **마이그레이션 실행**:
   ```bash
   pnpm db:push
   ```

2. **apps 테이블 시드 데이터 INSERT** (Supabase SQL Editor):
   ```sql
   INSERT INTO apps (
     code,
     name,
     kakao_rest_api_key,
     kakao_client_secret,
     jwt_secret,
     jwt_expires_in
   )
   VALUES (
     'test-app',
     'Test Application',
     'your-kakao-rest-api-key',
     'your-kakao-client-secret',
     'your-jwt-secret-at-least-32-chars-long',
     '7d'
   );
   ```

### API 테스트 (통합 완료 후)
```bash
# 개발 서버 실행
pnpm dev

# 카카오 로그인 테스트
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "test-app",
    "provider": "kakao",
    "accessToken": "YOUR_KAKAO_ACCESS_TOKEN"
  }'
```

---

## 10. Success Criteria

### Senior Developer
- ✅ 모든 인프라 파일 작성 완료
- ✅ Database 스키마 정의 완료
- ✅ 모든 단위 테스트 작성 및 통과
- ✅ Provider 패턴 구현 완료 (KakaoProvider)
- ✅ handlers.ts 완성 (oauthLogin)
- ✅ TDD 사이클 준수
- ✅ CLAUDE.md 가이드 준수 (예외 처리, 로깅, API Response)

### Junior Developer
- ✅ Router 연결 완료 (src/modules/auth/index.ts)
- ✅ app.ts + server.ts 분리 완료
- ✅ .env 업데이트 완료
- ✅ 빌드 성공
- ✅ Senior의 함수명과 정확히 일치

### Integration
- ✅ 마이그레이션 적용 (사용자)
- ✅ apps 테이블 시드 데이터 존재
- ✅ pnpm test 모두 통과
- ✅ pnpm build 성공
- ✅ pnpm dev 실행 가능
- ✅ POST /auth/oauth 엔드포인트 동작

---

## 11. Notes

### CLAUDE.md 준수 사항
- **Express 미들웨어 패턴**: Controller/Service 패턴 사용 안 함
- **예외 처리**: AppException 계층 구조, 외부 API 에러 감싸기
- **API Response**: camelCase, null 처리, ISO-8601 날짜
- **로깅**: Domain Probe 패턴 (운영 로그 분리)
- **JSDoc**: 모든 코드에 한국어 주석

### TDD 준수
- Red → Green → Refactor 순서 엄격히 준수
- 테스트 먼저 작성 (실패 확인)
- 최소 구현으로 테스트 통과
- 리팩토링 (필요 시)

### Provider 패턴 확장성
- 1단계: KakaoProvider만 구현
- 2단계 (향후): NaverProvider, GoogleProvider, AppleProvider 추가
- IOAuthProvider 인터페이스로 일관성 보장

---

## 12. Communication

### Senior → Junior
- handlers.ts 완성 시 알림: "handlers.ts 완성했습니다. oauthLogin 함수를 Router에 연결해주세요."

### Junior → Senior
- Router 작성 시 질문: "handlers.oauthLogin 함수의 타입이 RequestHandler 맞나요?"

### Senior/Junior → CTO
- 문제 발생 시 즉시 보고
- 작업 완료 시 알림: "모든 작업 완료했습니다. 통합 리뷰 부탁드립니다."

---

이 work-plan.md를 기반으로 Senior/Junior가 효율적으로 협업하여 멀티 제공자 OAuth 인증 시스템을 구현합니다. CTO는 통합 리뷰 단계에서 최종 검증을 수행합니다.
