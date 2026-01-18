# Technical Brief: Refresh Token Implementation

> 생성일: 2026-01-16
> 기반 문서: docs/refresh-token/user-story.md
> Tech Lead: Claude Code

---

## 1. Architecture Overview

### Module Structure

기존 `src/modules/auth/` 모듈을 확장하여 Refresh Token 기능을 추가합니다.

```
src/modules/auth/
├── index.ts                    # Router (기존)
├── handlers.ts                 # Request handlers (기존 + 신규 추가)
│   ├── oauthLogin             # 수정: Refresh Token 추가 발급
│   ├── oauthCallback          # 수정: Refresh Token 추가 발급
│   ├── refreshToken           # 신규: Access Token 갱신
│   └── logout                 # 신규: Refresh Token 무효화
├── services.ts                 # 비즈니스 로직 (기존 + 신규 추가)
│   ├── findAppByCode          # 기존
│   ├── upsertUser             # 기존
│   ├── generateJWT            # 수정: Access Token 만료 시간 단축
│   ├── generateRefreshToken   # 신규: Refresh Token 생성
│   ├── storeRefreshToken      # 신규: Refresh Token 저장
│   ├── verifyRefreshToken     # 신규: Refresh Token 검증
│   ├── rotateRefreshToken     # 신규: Token Rotation
│   └── revokeRefreshTokens    # 신규: Token 무효화
├── schema.ts                   # DB 스키마 (기존 + 신규 추가)
│   ├── apps                   # 수정: accessTokenExpiresIn, refreshTokenExpiresIn 추가
│   ├── users                  # 기존
│   └── refreshTokens          # 신규: Refresh Token 테이블
├── auth.probe.ts               # 운영 로그 (기존 + 신규 추가)
│   ├── loginSuccess           # 기존
│   ├── loginFailed            # 기존
│   ├── refreshTokenIssued     # 신규: Refresh Token 발급
│   ├── refreshTokenRotated    # 신규: Token Rotation
│   ├── refreshTokenRevoked    # 신규: Token 무효화
│   └── refreshTokenReuseDetected  # 신규: Reuse Detection (ERROR)
├── validators.ts               # Zod 스키마 (기존 + 신규 추가)
│   ├── oauthLoginSchema       # 기존
│   ├── refreshTokenSchema     # 신규: Refresh Token 요청
│   └── logoutSchema           # 신규: Logout 요청
├── providers/                  # OAuth Providers (기존)
└── types.ts                    # TypeScript 타입 (기존 + 신규 추가)
```

### Request Flow

#### 1. OAuth Login Flow (수정)

```
Client → POST /auth/oauth
  ↓
oauthLogin handler
  ↓
1. Validate request (Zod)
2. Find app by code
3. Verify OAuth provider token
4. Get user info from provider
5. Upsert user (DB)
6. Generate Access Token (30분 만료)
7. Generate Refresh Token (14일 만료)
8. Store Refresh Token (bcrypt hash, DB)
  ↓
Response: { accessToken, refreshToken, tokenType, expiresIn, user }
```

#### 2. Refresh Token Flow (신규)

```
Client → POST /auth/refresh { refreshToken }
  ↓
refreshToken handler
  ↓
1. Validate request (Zod)
2. Verify JWT signature
3. Find Refresh Token in DB (by hash)
4. Check revoked status
   - If revoked AND > 5s ago → REUSE DETECTION
     → Revoke all tokens in family
     → Log ERROR
     → Return 401
   - If revoked AND <= 5s ago → Grace Period
     → Return same token (idempotent)
5. Generate new Access Token (30분)
6. Generate new Refresh Token (14일)
7. Revoke old Refresh Token (atomic)
8. Store new Refresh Token (atomic)
  ↓
Response: { accessToken, refreshToken, tokenType, expiresIn }
```

#### 3. Logout Flow (신규)

```
Client → POST /auth/logout { refreshToken, revokeAll? }
  ↓
logout handler
  ↓
1. Validate request (Zod)
2. Verify JWT signature
3. Find Refresh Token in DB
4. If revokeAll=true
   → Revoke all tokens for user
   Else
   → Revoke current token only
5. Log INFO
  ↓
Response: 204 No Content
```

---

## 2. Database Schema Design

### Tables

#### refreshTokens (신규)

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

**주석 (필수)**:
- 테이블: "Refresh Token 저장소 (Token Rotation 및 Reuse Detection 지원)"
- `tokenHash`: "bcrypt 해시된 Refresh Token (보안)"
- `userId`: "사용자 ID (외래키, FK 제약조건 없음)"
- `appId`: "앱 ID (외래키, FK 제약조건 없음)"
- `jti`: "JWT ID (고유 식별자, UUID v4)"
- `tokenFamily`: "Token Family ID (Rotation 추적, UUID v4)"
- `expiresAt`: "만료 시간 (14일)"
- `revoked`: "무효화 여부 (Rotation 시 true)"
- `revokedAt`: "무효화 시간 (Reuse Detection 시 Grace Period 계산)"
- `createdAt`: "생성 시간"

**정규화**: 3NF
- 모든 컬럼이 기본키에 종속
- 중복 데이터 없음

**인덱스 전략**:
- `tokenHash`: 조회 성능 (UNIQUE, 가장 빈번한 쿼리)
- `userId`: 사용자별 Token 조회 (로그아웃 revokeAll)
- `expiresAt`: 만료 Token 정리 (배치 작업)
- `tokenFamily`: Reuse Detection 시 Family 전체 무효화

**관계**:
- `userId` → `users.id` (FK 제약조건 없음, 애플리케이션 레벨 관리)
- `appId` → `apps.id` (FK 제약조건 없음, 애플리케이션 레벨 관리)

#### apps (수정)

```typescript
export const apps = pgTable('apps', {
  // ... 기존 필드

  // 신규 추가
  accessTokenExpiresIn: varchar('access_token_expires_in', { length: 20 }).notNull().default('30m'),
  refreshTokenExpiresIn: varchar('refresh_token_expires_in', { length: 20 }).notNull().default('14d'),

  // Deprecated (하위 호환성 유지)
  jwtExpiresIn: varchar('jwt_expires_in', { length: 20 }).notNull().default('7d'),
});
```

**주석**:
- `accessTokenExpiresIn`: "Access Token 만료 시간 (기본: 30분)"
- `refreshTokenExpiresIn`: "Refresh Token 만료 시간 (기본: 14일)"
- `jwtExpiresIn`: "Deprecated: accessTokenExpiresIn으로 대체됨"

### Migrations

**마이그레이션 1**: `refresh_tokens` 테이블 생성

```sql
-- 0001_add_refresh_tokens_table.sql
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  app_id INTEGER NOT NULL,
  jti VARCHAR(36) NOT NULL UNIQUE,
  token_family VARCHAR(36) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 생성 (성능 최적화)
CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_token_family ON refresh_tokens(token_family);

-- 테이블 및 컬럼 주석
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
```

**마이그레이션 2**: `apps` 테이블에 Token 만료 시간 컬럼 추가

```sql
-- 0002_add_token_expires_in_to_apps.sql
ALTER TABLE apps
  ADD COLUMN access_token_expires_in VARCHAR(20) NOT NULL DEFAULT '30m',
  ADD COLUMN refresh_token_expires_in VARCHAR(20) NOT NULL DEFAULT '14d';

-- 기존 jwtExpiresIn 값을 accessTokenExpiresIn으로 복사 (데이터 마이그레이션)
UPDATE apps SET access_token_expires_in = jwt_expires_in;

-- 컬럼 주석
COMMENT ON COLUMN apps.access_token_expires_in IS 'Access Token 만료 시간 (기본: 30분)';
COMMENT ON COLUMN apps.refresh_token_expires_in IS 'Refresh Token 만료 시간 (기본: 14일)';
COMMENT ON COLUMN apps.jwt_expires_in IS 'Deprecated: accessTokenExpiresIn으로 대체됨';
```

**롤백 계획**:

```sql
-- Rollback 0002
ALTER TABLE apps
  DROP COLUMN access_token_expires_in,
  DROP COLUMN refresh_token_expires_in;

-- Rollback 0001
DROP TABLE refresh_tokens;
```

---

## 3. API Implementation Plan

### Endpoint 1: OAuth Login (수정)

**Path**: `POST /auth/oauth`

**Handler 구현** (기존 `oauthLogin` 수정):

```typescript
/**
 * OAuth 로그인 통합 핸들러 (수정: Refresh Token 추가 발급)
 * @param req - Express 요청 객체 (body: { code, provider, accessToken })
 * @param res - Express 응답 객체
 * @returns 200: { accessToken, refreshToken, tokenType, expiresIn, user, token(deprecated) }
 */
export const oauthLogin = async (req: Request, res: Response) => {
  // 1. 요청 검증 (기존)
  const { code, provider, accessToken } = oauthLoginSchema.parse(req.body);

  // 2. 앱 조회 (기존)
  const app = await findAppByCode(code);
  if (!app) throw new NotFoundException('App', code);

  // 3. OAuth Provider 검증 및 사용자 정보 조회 (기존)
  const oauthProvider = createOAuthProvider(provider, credentials);
  await oauthProvider.verifyToken(accessToken);
  const userInfo = await oauthProvider.getUserInfo(accessToken);

  // 4. 사용자 저장/업데이트 (기존)
  const user = await upsertUser({ appId: app.id, provider, ...userInfo });

  // 5. Access Token 생성 (수정: 만료 시간 30분)
  const token = generateJWT(user, app); // app.accessTokenExpiresIn 사용

  // 6. Refresh Token 생성 (신규)
  const { refreshToken, jti, tokenFamily } = await generateRefreshToken(user, app);

  // 7. Refresh Token 저장 (신규, bcrypt hash)
  await storeRefreshToken({
    tokenHash: await hashRefreshToken(refreshToken),
    userId: user.id,
    appId: app.id,
    jti,
    tokenFamily,
    expiresAt: calculateExpiresAt(app.refreshTokenExpiresIn),
  });

  // 8. 운영 로그 (수정)
  authProbe.loginSuccess({ userId: user.id, provider, appCode: app.code });
  authProbe.refreshTokenIssued({ userId: user.id, jti, tokenFamily });

  // 9. 응답 (수정: Refresh Token 추가)
  res.json({
    accessToken: token,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: parseExpiresIn(app.accessTokenExpiresIn), // 1800 (30분)
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
```

**DB Operations**:
- `SELECT` from `apps` (기존)
- `SELECT` + `INSERT`/`UPDATE` from `users` (기존)
- `INSERT` into `refreshTokens` (신규)

**Error Handling**:
- `NotFoundException`: 앱을 찾을 수 없음 → 404
- `ValidationException`: Provider 미설정 → 400
- `ExternalApiException`: OAuth Provider API 실패 → 502
- `DatabaseError`: Refresh Token 저장 실패 → 500 (트랜잭션 롤백)

**트랜잭션**: User upsert + Refresh Token insert는 원자적 수행 필요

---

### Endpoint 2: Refresh Access Token (신규)

**Path**: `POST /auth/refresh`

**Handler 구현**:

```typescript
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

  // 2. JWT 서명 검증 및 페이로드 추출
  const decoded = await verifyRefreshToken(refreshToken);
  const { sub: userId, appId, jti } = decoded;

  // 3. 앱 조회
  const app = await findAppByCode(appId);
  if (!app) throw new NotFoundException('App', appId);

  // 4. DB에서 Refresh Token 조회 (by hash)
  const tokenHash = await hashRefreshToken(refreshToken);
  const storedToken = await findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    throw new UnauthorizedException('Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // 5. 만료 확인
  if (storedToken.expiresAt < new Date()) {
    throw new UnauthorizedException('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  // 6. Reuse Detection (이미 무효화된 Token)
  if (storedToken.revoked) {
    const gracePeriodMs = 5000; // 5초
    const timeSinceRevoked = Date.now() - storedToken.revokedAt.getTime();

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

    // Grace Period 내: 멱등성 (기존 응답 재전송은 불가하므로 401 반환)
    throw new UnauthorizedException('Refresh token already used', 'REFRESH_TOKEN_REVOKED');
  }

  // 7. 사용자 조회
  const user = await findUserById(userId);
  if (!user) throw new NotFoundException('User', userId);

  // 8. Token Rotation (원자적 수행)
  const { newAccessToken, newRefreshToken, newJti } = await rotateRefreshToken({
    oldToken: storedToken,
    user,
    app,
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
    expiresIn: parseExpiresIn(app.accessTokenExpiresIn),
  });
};
```

**DB Operations**:
- `SELECT` from `refreshTokens` WHERE `tokenHash` = ?
- `UPDATE` `refreshTokens` SET `revoked` = true, `revokedAt` = NOW() WHERE `id` = ? (기존 Token 무효화)
- `INSERT` into `refreshTokens` (새 Token 저장)
- 트랜잭션 필수 (UPDATE + INSERT 원자적 수행)

**Error Handling**:
- `REFRESH_TOKEN_NOT_FOUND` → 401
- `REFRESH_TOKEN_EXPIRED` → 401
- `REFRESH_TOKEN_REVOKED` → 401
- `REFRESH_TOKEN_REUSE_DETECTED` → 401 + Family 전체 무효화 + ERROR 로그

---

### Endpoint 3: Logout (신규)

**Path**: `POST /auth/logout`

**Handler 구현**:

```typescript
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

  // 2. JWT 서명 검증 및 페이로드 추출
  const decoded = await verifyRefreshToken(refreshToken);
  const { sub: userId, jti } = decoded;

  // 3. DB에서 Refresh Token 조회
  const tokenHash = await hashRefreshToken(refreshToken);
  const storedToken = await findRefreshTokenByHash(tokenHash);

  if (!storedToken) {
    throw new UnauthorizedException('Refresh token not found', 'REFRESH_TOKEN_NOT_FOUND');
  }

  // 4. Token 무효화
  if (revokeAll) {
    // 모든 디바이스의 Token 무효화
    await revokeRefreshTokensByUserId(userId);
    authProbe.refreshTokenRevoked({ userId, jti, revokeAll: true });
  } else {
    // 현재 Token만 무효화
    await revokeRefreshTokenById(storedToken.id);
    authProbe.refreshTokenRevoked({ userId, jti, revokeAll: false });
  }

  // 5. 응답 (멱등성: 이미 무효화된 Token도 204 반환)
  res.status(204).send();
};
```

**DB Operations**:
- `SELECT` from `refreshTokens` WHERE `tokenHash` = ?
- `UPDATE` `refreshTokens` SET `revoked` = true, `revokedAt` = NOW() WHERE `id` = ? (단일)
- 또는 `UPDATE` `refreshTokens` SET `revoked` = true, `revokedAt` = NOW() WHERE `userId` = ? (전체)

**Error Handling**:
- `REFRESH_TOKEN_NOT_FOUND` → 401
- 멱등성: 이미 무효화된 Token도 204 반환

---

### Endpoint 4: OAuth Callback (수정)

**Path**: `GET /auth/oauth/callback`

**변경 사항**: HTML 응답에 Refresh Token 추가 표시

```typescript
// HTML 응답 수정
res.send(`
  ...
  <div class="token-box">
    <h2>Access Token</h2>
    <p class="token">${accessToken}</p>
  </div>

  <div class="token-box">
    <h2>Refresh Token</h2>
    <p class="token">${refreshToken}</p>
  </div>
  ...
`);
```

---

## 4. Test Scenarios

### Handler: oauthLogin (수정)

**Test 1: 성공 케이스 - Refresh Token 발급**

```typescript
it('should return accessToken and refreshToken on successful login', async () => {
  // Given
  const mockApp = { id: 1, code: 'wowa', accessTokenExpiresIn: '30m', refreshTokenExpiresIn: '14d' };
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
```

**Test 2: 실패 케이스 - Refresh Token 저장 실패**

```typescript
it('should rollback transaction when refresh token storage fails', async () => {
  // Given
  vi.mocked(storeRefreshToken).mockRejectedValue(new Error('DB error'));

  // When & Then
  await expect(oauthLogin(req as Request, res as Response))
    .rejects.toThrow('DB error');

  // 트랜잭션 롤백 확인 (실제로는 integration test에서 검증)
  expect(authProbe.loginFailed).toHaveBeenCalled();
});
```

**Mocks**:
- DB: `findAppByCode`, `upsertUser`, `storeRefreshToken`
- External API: OAuth Provider
- Crypto: `bcrypt.hash`

---

### Handler: refreshToken (신규)

**Test 1: 성공 케이스 - Token Rotation**

```typescript
it('should rotate refresh token successfully', async () => {
  // Given
  const mockStoredToken = {
    id: 1,
    tokenHash: 'hash-1',
    userId: 1,
    jti: 'old-jti',
    tokenFamily: 'family-1',
    revoked: false,
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  };
  vi.mocked(verifyRefreshToken).mockResolvedValue({ sub: 1, appId: 1, jti: 'old-jti' });
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);
  vi.mocked(rotateRefreshToken).mockResolvedValue({
    newAccessToken: 'new-access-token',
    newRefreshToken: 'new-refresh-token',
    newJti: 'new-jti',
  });

  // When
  await refreshToken(req as Request, res as Response);

  // Then
  expect(res.json).toHaveBeenCalledWith({
    accessToken: 'new-access-token',
    refreshToken: 'new-refresh-token',
    tokenType: 'Bearer',
    expiresIn: 1800,
  });
  expect(authProbe.refreshTokenRotated).toHaveBeenCalledWith({
    userId: 1,
    oldJti: 'old-jti',
    newJti: 'new-jti',
    tokenFamily: 'family-1',
  });
});
```

**Test 2: 실패 케이스 - Reuse Detection**

```typescript
it('should detect refresh token reuse and revoke all tokens', async () => {
  // Given
  const mockStoredToken = {
    id: 1,
    revoked: true,
    revokedAt: new Date(Date.now() - 10000), // 10초 전 (Grace Period 초과)
    tokenFamily: 'family-1',
  };
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

  // When & Then
  await expect(refreshToken(req as Request, res as Response))
    .rejects.toThrow(UnauthorizedException);

  expect(revokeRefreshTokenFamily).toHaveBeenCalledWith('family-1');
  expect(authProbe.refreshTokenReuseDetected).toHaveBeenCalledWith({
    userId: 1,
    jti: 'old-jti',
    tokenFamily: 'family-1',
    ip: req.ip,
  });
});
```

**Test 3: 성공 케이스 - Grace Period (5초 이내)**

```typescript
it('should allow retry within grace period', async () => {
  // Given
  const mockStoredToken = {
    id: 1,
    revoked: true,
    revokedAt: new Date(Date.now() - 3000), // 3초 전 (Grace Period 내)
    tokenFamily: 'family-1',
  };
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

  // When & Then
  await expect(refreshToken(req as Request, res as Response))
    .rejects.toThrow(UnauthorizedException);

  // Reuse Detection은 작동하지 않음
  expect(revokeRefreshTokenFamily).not.toHaveBeenCalled();
  expect(authProbe.refreshTokenReuseDetected).not.toHaveBeenCalled();
});
```

**Test 4: 실패 케이스 - Refresh Token 만료**

```typescript
it('should reject expired refresh token', async () => {
  // Given
  const mockStoredToken = {
    id: 1,
    revoked: false,
    expiresAt: new Date(Date.now() - 1000), // 1초 전 만료
  };
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

  // When & Then
  await expect(refreshToken(req as Request, res as Response))
    .rejects.toThrow(UnauthorizedException);
  expect(res.json).toHaveBeenCalledWith({
    error: {
      message: 'Refresh token expired. Please login again.',
      code: 'REFRESH_TOKEN_EXPIRED',
    },
  });
});
```

**Mocks**:
- DB: `findRefreshTokenByHash`, `rotateRefreshToken`, `revokeRefreshTokenFamily`
- Crypto: `bcrypt.compare`
- JWT: `verifyToken`

---

### Handler: logout (신규)

**Test 1: 성공 케이스 - 단일 Token 무효화**

```typescript
it('should revoke single refresh token', async () => {
  // Given
  const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1' };
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);
  req.body = { refreshToken: 'rt_abc123', revokeAll: false };

  // When
  await logout(req as Request, res as Response);

  // Then
  expect(revokeRefreshTokenById).toHaveBeenCalledWith(1);
  expect(authProbe.refreshTokenRevoked).toHaveBeenCalledWith({
    userId: 1,
    jti: 'jti-1',
    revokeAll: false,
  });
  expect(res.status).toHaveBeenCalledWith(204);
});
```

**Test 2: 성공 케이스 - 모든 Token 무효화 (revokeAll=true)**

```typescript
it('should revoke all refresh tokens for user', async () => {
  // Given
  const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1' };
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);
  req.body = { refreshToken: 'rt_abc123', revokeAll: true };

  // When
  await logout(req as Request, res as Response);

  // Then
  expect(revokeRefreshTokensByUserId).toHaveBeenCalledWith(1);
  expect(authProbe.refreshTokenRevoked).toHaveBeenCalledWith({
    userId: 1,
    jti: 'jti-1',
    revokeAll: true,
  });
  expect(res.status).toHaveBeenCalledWith(204);
});
```

**Test 3: 멱등성 - 이미 무효화된 Token**

```typescript
it('should return 204 for already revoked token (idempotent)', async () => {
  // Given
  const mockStoredToken = { id: 1, userId: 1, jti: 'jti-1', revoked: true };
  vi.mocked(findRefreshTokenByHash).mockResolvedValue(mockStoredToken);

  // When
  await logout(req as Request, res as Response);

  // Then
  expect(res.status).toHaveBeenCalledWith(204);
});
```

**Mocks**:
- DB: `findRefreshTokenByHash`, `revokeRefreshTokenById`, `revokeRefreshTokensByUserId`

---

### Service: generateRefreshToken (신규)

**Test 1: Refresh Token 생성**

```typescript
it('should generate refresh token with jti and tokenFamily', async () => {
  // Given
  const user = { id: 1 };
  const app = { id: 1, jwtSecret: 'secret', refreshTokenExpiresIn: '14d' };

  // When
  const result = await generateRefreshToken(user, app);

  // Then
  expect(result).toHaveProperty('refreshToken');
  expect(result).toHaveProperty('jti');
  expect(result).toHaveProperty('tokenFamily');
  expect(result.jti).toMatch(/^[0-9a-f-]{36}$/); // UUID v4
  expect(result.tokenFamily).toMatch(/^[0-9a-f-]{36}$/);

  // JWT 검증
  const decoded = jwt.verify(result.refreshToken, app.jwtSecret);
  expect(decoded).toMatchObject({
    sub: 1,
    appId: 1,
    jti: result.jti,
    tokenFamily: result.tokenFamily,
  });
});
```

**Mocks**:
- `uuid.v4()`

---

### Service: rotateRefreshToken (신규)

**Test 1: Token Rotation (원자적 수행)**

```typescript
it('should rotate refresh token atomically', async () => {
  // Given
  const oldToken = { id: 1, jti: 'old-jti', tokenFamily: 'family-1' };
  const user = { id: 1 };
  const app = { id: 1, jwtSecret: 'secret', accessTokenExpiresIn: '30m', refreshTokenExpiresIn: '14d' };

  // When
  const result = await rotateRefreshToken({ oldToken, user, app });

  // Then
  expect(result).toHaveProperty('newAccessToken');
  expect(result).toHaveProperty('newRefreshToken');
  expect(result).toHaveProperty('newJti');

  // 기존 Token 무효화 확인
  expect(db.update).toHaveBeenCalledWith(
    expect.objectContaining({ revoked: true, revokedAt: expect.any(Date) })
  );

  // 새 Token 저장 확인
  expect(db.insert).toHaveBeenCalledWith(
    expect.objectContaining({ jti: result.newJti, tokenFamily: 'family-1' })
  );
});
```

**Mocks**:
- DB: `db.update`, `db.insert` (트랜잭션)

---

## 5. Implementation Checklist

### Phase 1: DB Schema & Migration (Schema Designer + Migration Generator)
- [ ] Drizzle 스키마 정의 (`refreshTokens` 테이블)
- [ ] Drizzle 스키마 수정 (`apps` 테이블에 `accessTokenExpiresIn`, `refreshTokenExpiresIn` 추가)
- [ ] 마이그레이션 파일 생성 (Drizzle Kit)
- [ ] 마이그레이션 실행 (사용자)
- [ ] 테이블 및 컬럼 주석 추가 (SQL COMMENT)

### Phase 2: Core Services (Senior Developer)
- [ ] `generateRefreshToken` 구현 (UUID, JWT)
- [ ] `storeRefreshToken` 구현 (bcrypt hash)
- [ ] `findRefreshTokenByHash` 구현 (DB 조회)
- [ ] `verifyRefreshToken` 구현 (JWT 검증)
- [ ] `rotateRefreshToken` 구현 (트랜잭션)
- [ ] `revokeRefreshTokenById` 구현
- [ ] `revokeRefreshTokensByUserId` 구현
- [ ] `revokeRefreshTokenFamily` 구현
- [ ] `hashRefreshToken` 유틸 함수 (bcrypt)
- [ ] `parseExpiresIn` 유틸 함수 (문자열 → 초)
- [ ] `calculateExpiresAt` 유틸 함수 (만료 시간 계산)

### Phase 3: Handlers (Senior Developer)
- [ ] `oauthLogin` 수정 (Refresh Token 추가)
- [ ] `oauthCallback` 수정 (HTML 응답 수정)
- [ ] `refreshToken` 신규 구현 (Token Rotation + Reuse Detection)
- [ ] `logout` 신규 구현 (Token 무효화)

### Phase 4: Router & Validators (Junior Developer)
- [ ] `refreshTokenSchema` 작성 (Zod)
- [ ] `logoutSchema` 작성 (Zod)
- [ ] 라우터에 새 엔드포인트 추가 (`POST /auth/refresh`, `POST /auth/logout`)

### Phase 5: Probes & Error Codes (Junior Developer)
- [ ] `refreshTokenIssued` 프로브 추가 (INFO)
- [ ] `refreshTokenRotated` 프로브 추가 (INFO)
- [ ] `refreshTokenRevoked` 프로브 추가 (INFO)
- [ ] `refreshTokenReuseDetected` 프로브 추가 (ERROR)
- [ ] 에러 코드 추가 (`REFRESH_TOKEN_*`)

### Phase 6: Testing (Senior + Junior)
- [ ] `oauthLogin` 핸들러 테스트 (수정)
- [ ] `refreshToken` 핸들러 테스트 (신규)
  - [ ] 성공 케이스: Token Rotation
  - [ ] 실패 케이스: Reuse Detection
  - [ ] 성공 케이스: Grace Period
  - [ ] 실패 케이스: 만료된 Token
- [ ] `logout` 핸들러 테스트 (신규)
  - [ ] 단일 Token 무효화
  - [ ] 모든 Token 무효화
  - [ ] 멱등성 테스트
- [ ] `generateRefreshToken` 서비스 테스트
- [ ] `rotateRefreshToken` 서비스 테스트
- [ ] 모든 테스트 통과 확인

### Phase 7: Documentation (Junior Developer)
- [ ] JSDoc 주석 완성 (모든 함수)
- [ ] OpenAPI 스펙 업데이트 (새 엔드포인트)
- [ ] README 업데이트 (Refresh Token 사용법)

---

## 6. Technical Decisions

### 선택한 기술/패턴

#### 1. bcrypt for Refresh Token Hashing
- **선택 이유**:
  - 산업 표준 해싱 알고리즘 (Slow Hash)
  - Rainbow Table 공격 방어 (Salt)
  - 설정 가능한 Work Factor (salt rounds: 10)
  - 레퍼런스: [Password Security: Bcrypt](https://calmops.com/programming/web/password-security-bcrypt-hashing-reset-flows/)
- **대안**: SHA-256 (Fast Hash, 덜 안전)

#### 2. UUID v4 for jti and tokenFamily
- **선택 이유**:
  - 전역 고유성 보장
  - 예측 불가능 (보안)
  - 분산 시스템에서 충돌 없음
- **대안**: Auto-increment ID (예측 가능, 보안 취약)

#### 3. Token Rotation
- **선택 이유**:
  - Refresh Token 탈취 시 악용 기간 최소화 (1회 사용)
  - Reuse Detection 가능
  - OAuth 2.0 표준 권장 사항
  - 레퍼런스: [Refresh Token Rotation - Auth0](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- **대안**: Static Refresh Token (탈취 시 위험 높음)

#### 4. Grace Period (5초)
- **선택 이유**:
  - 네트워크 불안정 시 사용자 경험 유지
  - Okta 기본값: 30초 → 보안 강화를 위해 5초로 단축
  - 레퍼런스: [Okta - Refresh Token Rotation](https://developer.okta.com/docs/guides/refresh-tokens/main/)
- **대안**: Grace Period 없음 (네트워크 오류 시 재로그인 필요)

#### 5. Token Family
- **선택 이유**:
  - Reuse Detection 시 Family 전체 무효화
  - 공격자가 탈취한 Token Family만 무효화 (다른 디바이스 영향 없음)
  - 레퍼런스: [Refresh Token Rotation: Best Practices](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)
- **대안**: 사용자 전체 Token 무효화 (다른 디바이스도 로그아웃)

#### 6. Access Token 만료 시간 30분
- **선택 이유**:
  - 보안 강화 (기존 7일에서 단축)
  - 탈취 시 악용 기간 최소화
  - 사용자 경험 유지 (Refresh Token 자동 갱신)
- **대안**: 15분 (더 안전하지만 갱신 빈도 증가)

#### 7. Refresh Token 만료 시간 14일
- **선택 이유**:
  - 사용자 편의성 (2주간 재로그인 불필요)
  - 보안과 UX 균형
  - 앱별 설정 가능 (유연성)
- **대안**: 7일 (더 안전하지만 UX 저하)

#### 8. No FK Constraints
- **선택 이유**:
  - CLAUDE.md 규칙 준수 (애플리케이션 레벨 관리)
  - 유연성 (사용자/앱 삭제 시 Cascade 불필요)
- **대안**: FK with CASCADE (DB 레벨 무결성)

---

### 대안과 비교

| 옵션 | 장점 | 단점 | 선택 여부 |
|------|------|------|-----------|
| **bcrypt vs SHA-256** | bcrypt: 보안 강화 (Slow Hash) | bcrypt: 성능 약간 느림 | ✅ bcrypt |
| **Token Rotation vs Static** | Rotation: 탈취 시 악용 최소화 | Rotation: 구현 복잡도 증가 | ✅ Rotation |
| **Grace Period 5s vs 30s** | 5s: 보안 강화 | 5s: 네트워크 오류 시 재시도 제한 | ✅ 5s |
| **Access Token 30m vs 15m** | 30m: Refresh 빈도 감소 | 30m: 탈취 시 악용 기간 증가 | ✅ 30m |
| **Refresh Token 14d vs 7d** | 14d: UX 향상 | 14d: 보안 약간 약화 | ✅ 14d (앱별 설정 가능) |
| **DB Storage vs Redis** | DB: 영구 저장, 데이터 정합성 | DB: Redis보다 느림 | ✅ DB (현재) |
| **bcrypt salt rounds 10 vs 12** | 10: 성능 균형 | 12: 보안 강화, 느림 | ✅ 10 |

---

## 7. Risks and Mitigation

### Risk 1: Grace Period 악용
- **위험 요소**: 공격자가 5초 내에 무한 재시도 가능
- **완화 전략**:
  - Rate Limiting 추가 (프로덕션 배포 전 권장)
  - IP 기반 Block (동일 IP에서 5초 내 10회 이상 재시도 시 차단)
  - 운영 로그 모니터링 (ERROR 레벨, Reuse Detection)

### Risk 2: bcrypt 성능 병목
- **위험 요소**: bcrypt 해싱이 느려 로그인/Refresh 성능 저하
- **완화 전략**:
  - Salt rounds 10 유지 (12로 증가 시 성능 저하)
  - 향후 Redis 캐시 도입 (Token Hash → Token Metadata 캐싱)
  - 비동기 처리 (Node.js 기본)

### Risk 3: DB 저장 실패 시 트랜잭션 롤백
- **위험 요소**: Refresh Token 저장 실패 시 사용자가 Access Token만 받음 (갱신 불가)
- **완화 전략**:
  - 트랜잭션 사용 (User upsert + Refresh Token insert 원자적 수행)
  - DB 저장 실패 시 전체 로그인 실패 처리
  - ERROR 로그 기록 및 알림

### Risk 4: Token Family 추적 오류
- **위험 요소**: Token Family ID가 잘못 유지되어 정상 사용자까지 무효화
- **완화 전략**:
  - 단위 테스트로 Token Family 로직 검증
  - 운영 로그로 Family ID 추적
  - Reuse Detection 시 Family만 무효화 (사용자 전체 무효화하지 않음)

### Risk 5: Access Token Blacklist 미구현
- **위험 요소**: 로그아웃 후에도 Access Token은 30분간 유효
- **완화 전략**:
  - Access Token 만료 시간 단축 (30분)
  - Refresh Token 무효화로 재발급 차단
  - 향후 Redis 기반 Blacklist 도입 고려

### Risk 6: 하위 호환성 문제
- **위험 요소**: 기존 클라이언트가 새 필드를 인식하지 못함
- **완화 전략**:
  - 기존 `token` 필드 유지 (Deprecated)
  - Phase 1: 새 필드 추가 (기존 필드 유지)
  - Phase 2: 클라이언트 업데이트
  - Phase 3: 기존 필드 제거 (v2.0.0)

---

## 8. Dependencies

### External Libraries

#### 신규 설치 필요
```bash
pnpm add bcrypt uuid
pnpm add -D @types/bcrypt @types/uuid
```

- **bcrypt** (v5.1.1): Refresh Token 해싱
- **uuid** (v11.0.5): jti 및 tokenFamily 생성

#### 기존 라이브러리
- **jsonwebtoken** (v9.0.3): JWT 생성/검증 (기존)
- **drizzle-orm** (v0.45.1): DB ORM (기존)
- **zod** (v4.3.5): 요청 검증 (기존)
- **vitest** (v4.0.17): 단위 테스트 (기존)

---

### Other Modules

#### 의존하는 모듈
- `src/config/database.ts`: DB 연결 (기존)
- `src/utils/jwt.ts`: JWT 유틸 (기존)
- `src/utils/errors.ts`: 예외 클래스 (기존 + 신규 에러 코드 추가)
- `src/utils/logger.ts`: 로깅 (기존)

#### 신규 모듈
- `src/modules/auth/refresh-token.utils.ts`: Refresh Token 유틸 함수
  - `hashRefreshToken(token: string): Promise<string>`
  - `compareRefreshToken(token: string, hash: string): Promise<boolean>`
  - `parseExpiresIn(expiresIn: string): number`
  - `calculateExpiresAt(expiresIn: string): Date`

---

## 9. Estimated Complexity

| 작업 | 복잡도 | 예상 시간 | 담당자 |
|------|--------|-----------|--------|
| **DB Schema Design** | Medium | 2h | Schema Designer |
| **Migration Generation** | Low | 1h | Migration Generator |
| **Migration Execution** | Low | 0.5h | 사용자 |
| **Core Services** | High | 8h | Senior Developer |
| **Handlers** | Medium | 4h | Senior Developer |
| **Router & Validators** | Low | 1h | Junior Developer |
| **Probes & Error Codes** | Low | 1h | Junior Developer |
| **Testing** | High | 10h | Senior + Junior |
| **Documentation** | Medium | 2h | Junior Developer |
| **Code Review** | Medium | 2h | CTO |
| **Total** | **High** | **~32h** | |

### 세부 복잡도

- **DB Schema**: Medium
  - 새 테이블 추가 (refreshTokens)
  - 기존 테이블 수정 (apps)
  - 인덱스 전략 수립
  - 주석 작성

- **Business Logic**: High
  - Token Rotation (트랜잭션)
  - Reuse Detection (Grace Period)
  - Token Family 추적
  - bcrypt 해싱 (비동기 처리)

- **Testing**: High
  - 핸들러 테스트 (4개 엔드포인트)
  - 서비스 테스트 (8개 함수)
  - Reuse Detection 시나리오 (복잡)
  - Grace Period 테스트 (시간 기반)

---

## 10. Next Steps

### 1. CTO 승인 대기
- [ ] CTO가 Technical Brief 검토
- [ ] 아키텍처 및 보안 전략 승인
- [ ] 기술 스택 및 복잡도 승인

### 2. 사용자 승인 대기
- [ ] 사용자가 Technical Brief 확인
- [ ] 비즈니스 요구사항 충족 여부 확인
- [ ] 구현 범위 및 일정 승인

### 3. 승인 후 인프라 팀으로 이관
- [ ] **Schema Designer**: Drizzle 스키마 작성
- [ ] **Migration Generator**: 마이그레이션 파일 생성
- [ ] **사용자**: 마이그레이션 실행 (`pnpm db:push`)

### 4. CTO가 작업 분배 계획(work-plan.md) 작성
- [ ] Senior Developer 작업 목록
- [ ] Junior Developer 작업 목록
- [ ] 작업 순서 및 의존성 정의

### 5. 개발 시작
- [ ] **Senior Developer**: Core Services 구현 (TDD)
- [ ] **Senior Developer**: Handlers 구현 (TDD)
- [ ] **Junior Developer**: Router & Validators 작성
- [ ] **Junior Developer**: Probes & Error Codes 추가
- [ ] **Senior + Junior**: 단위 테스트 작성 및 통과

### 6. 코드 리뷰 및 머지
- [ ] CTO 코드 리뷰
- [ ] 테스트 통과 확인
- [ ] 문서화 완료 확인
- [ ] 메인 브랜치 머지

---

## 11. References

이 설계는 다음 베스트 프랙티스를 참조하였습니다:

### Refresh Token Security
- [Refresh Token Rotation: Best Practices for Developers - Serverion](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)
- [Refresh Token Rotation - Auth0 Docs](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [What Are Refresh Tokens and How to Use Them Securely - Auth0 Blog](https://auth0.com/blog/refresh-tokens-what-are-they-and-when-to-use-them/)
- [Why your app needs refresh tokens—and how they work - WorkOS](https://workos.com/blog/why-your-app-needs-refresh-tokens-and-how-they-work)

### Token Storage & Hashing
- [Password Security: Bcrypt, Hashing Best Practices - Calmops](https://calmops.com/programming/web/password-security-bcrypt-hashing-reset-flows/)
- [What are Refresh Tokens? Complete Implementation Guide - Security Boulevard](https://securityboulevard.com/2026/01/what-are-refresh-tokens-complete-implementation-guide-security-best-practices/)

### Reuse Detection & Grace Period
- [Refresh access tokens and rotate refresh tokens - Okta Developer](https://developer.okta.com/docs/guides/refresh-tokens/main/)
- [The Developer's Guide to Refresh Token Rotation - Descope](https://www.descope.com/blog/post/refresh-token-rotation)
- [Refresh tokens need a grace period - Ory Hydra Issue #1831](https://github.com/ory/hydra/issues/1831)

### User Story 원문
- [docs/refresh-token/user-story.md](./user-story.md)

---

## 12. Appendix

### A. JWT Payload Structure

#### Access Token
```json
{
  "sub": 1,              // User ID
  "appId": 1,            // App ID
  "email": "user@example.com",
  "nickname": "홍길동",
  "iat": 1736992800,     // Issued At
  "exp": 1736994600      // Expires At (30분)
}
```

#### Refresh Token
```json
{
  "sub": 1,              // User ID
  "appId": 1,            // App ID
  "jti": "uuid-v4",      // JWT ID (고유 식별자)
  "tokenFamily": "uuid-v4",  // Token Family ID
  "iat": 1736992800,     // Issued At
  "exp": 1738202400      // Expires At (14일)
}
```

### B. Database Queries

#### Refresh Token 조회 (by hash)
```sql
SELECT * FROM refresh_tokens
WHERE token_hash = $1
  AND revoked = false
  AND expires_at > NOW()
LIMIT 1;
```

#### Token Rotation (트랜잭션)
```sql
BEGIN;

-- 기존 Token 무효화
UPDATE refresh_tokens
SET revoked = true, revoked_at = NOW()
WHERE id = $1;

-- 새 Token 저장
INSERT INTO refresh_tokens (token_hash, user_id, app_id, jti, token_family, expires_at)
VALUES ($2, $3, $4, $5, $6, $7);

COMMIT;
```

#### Reuse Detection (Family 전체 무효화)
```sql
UPDATE refresh_tokens
SET revoked = true, revoked_at = NOW()
WHERE token_family = $1;
```

#### 로그아웃 (사용자 전체 Token 무효화)
```sql
UPDATE refresh_tokens
SET revoked = true, revoked_at = NOW()
WHERE user_id = $1;
```

### C. Error Response Examples

#### REFRESH_TOKEN_EXPIRED
```json
{
  "error": {
    "message": "Refresh token expired. Please login again.",
    "code": "REFRESH_TOKEN_EXPIRED"
  }
}
```

#### REFRESH_TOKEN_REUSE_DETECTED
```json
{
  "error": {
    "message": "Refresh token reuse detected. All tokens have been revoked. Please login again.",
    "code": "REFRESH_TOKEN_REUSE_DETECTED"
  }
}
```

#### REFRESH_TOKEN_NOT_FOUND
```json
{
  "error": {
    "message": "Refresh token not found",
    "code": "REFRESH_TOKEN_NOT_FOUND"
  }
}
```

---

**문서 버전**: 1.0
**최종 수정일**: 2026-01-16
**작성자**: Tech Lead (Claude Code)
**승인 대기**: CTO, 사용자
