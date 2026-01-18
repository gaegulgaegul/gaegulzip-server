# User Stories: Refresh Token Implementation

> 생성일: 2026-01-16
> 요청자: Refresh Token 기능 구현 (현재 Access Token만 존재, Refresh Token 추가 필요)

---

## 1. Overview

현재 시스템은 7일 만료 기간의 Access Token만 사용하여 인증을 관리합니다. 이는 다음과 같은 문제점이 있습니다:

1. **보안 취약점**: 긴 만료 기간의 Access Token이 탈취될 경우 악용 기간이 길어짐
2. **사용자 경험 저하**: Token 만료 시 매번 재로그인 필요
3. **토큰 무효화 불가**: 로그아웃 또는 보안 이슈 발생 시 Token 무효화 불가능

### 비즈니스 배경

- **보안 강화**: Access Token 만료 기간을 단축(15-30분)하여 탈취 시 피해 최소화
- **사용자 경험 개선**: Refresh Token을 통해 자동 재인증으로 끊김 없는 서비스 제공
- **토큰 관리**: 로그아웃, 비밀번호 변경 등 이벤트 발생 시 Token 무효화 가능
- **산업 표준 준수**: OAuth 2.0 표준에 따른 Refresh Token 메커니즘 구현

### 구현 범위

1. Refresh Token 발급 및 저장
2. Access Token 갱신 (Refresh Token 사용)
3. Refresh Token Rotation (보안 강화)
4. Token Revocation (로그아웃 시)
5. Reuse Detection (중복 사용 탐지)

---

## 2. User Stories

### 2.1 User Story: Refresh Token 발급

#### As a 모바일 앱 사용자

OAuth 로그인을 통해 인증합니다.

#### I want to Refresh Token을 함께 발급받기

로그인 시 Access Token과 Refresh Token을 함께 받아, Access Token 만료 시 자동으로 갱신할 수 있도록 합니다.

#### So that 매번 재로그인 없이 지속적으로 서비스 이용 가능

Access Token이 만료되어도 Refresh Token으로 자동 갱신하여 사용자 경험을 유지합니다.

#### Acceptance Criteria

- [ ] OAuth 로그인(`POST /auth/oauth`) 성공 시 Access Token과 Refresh Token을 함께 반환
- [ ] OAuth Callback(`GET /auth/oauth/callback`) 성공 시 Access Token과 Refresh Token을 함께 반환
- [ ] Access Token 만료 기간: 30분 (기존 7일에서 단축)
- [ ] Refresh Token 만료 기간: 14일
- [ ] Refresh Token은 데이터베이스에 안전하게 저장 (해시화)
- [ ] Refresh Token에는 고유 식별자(jti) 포함
- [ ] Refresh Token은 single-use (1회 사용 후 자동 rotation)

#### Edge Cases

- 앱별로 다른 Refresh Token 만료 기간 설정 가능 (apps.refreshTokenExpiresIn)
- 동일 사용자가 여러 디바이스에서 로그인 시 각각 별도의 Refresh Token 발급
- Refresh Token 저장 실패 시 로그인 실패 처리 (트랜잭션)

---

### 2.2 User Story: Access Token 갱신

#### As a 모바일 앱

Access Token이 만료되었을 때 자동으로 갱신합니다.

#### I want to Refresh Token으로 새로운 Access Token 받기

만료된 Access Token을 Refresh Token으로 갱신하여 사용자가 재로그인하지 않도록 합니다.

#### So that 끊김 없는 API 호출 가능

API 요청 중 Access Token 만료 시 자동으로 갱신하여 사용자 경험을 유지합니다.

#### Acceptance Criteria

- [ ] `POST /auth/refresh` 엔드포인트 제공
- [ ] Refresh Token 유효성 검증 (만료 시간, 무효화 여부)
- [ ] 새로운 Access Token 발급 (30분 만료)
- [ ] 새로운 Refresh Token 발급 (Rotation - 기존 Token 무효화)
- [ ] 기존 Refresh Token은 사용 후 즉시 무효화
- [ ] 응답에 새로운 Access Token과 Refresh Token 포함

#### Edge Cases

- Refresh Token이 이미 사용된 경우(Reuse Detection) → 모든 Token 무효화 후 재로그인 요구
- Refresh Token이 만료된 경우 → 401 Unauthorized, 재로그인 필요
- Refresh Token이 무효화된 경우 → 401 Unauthorized, 재로그인 필요
- 데이터베이스 연결 실패 시 → 500 Internal Server Error

---

### 2.3 User Story: Refresh Token Rotation

#### As a 보안 담당자

Refresh Token이 탈취될 위험을 최소화합니다.

#### I want to Refresh Token을 1회 사용 후 자동으로 교체

매번 새로운 Refresh Token을 발급하여 탈취 시 악용 기간을 최소화합니다.

#### So that 보안 위협 최소화

Refresh Token이 탈취되어도 1회만 사용 가능하며, 재사용 시 탐지하여 모든 Token을 무효화합니다.

#### Acceptance Criteria

- [ ] Refresh Token 사용 시 새로운 Refresh Token 발급
- [ ] 기존 Refresh Token은 즉시 무효화 처리 (revoked=true)
- [ ] 무효화된 Token 재사용 시 Reuse Detection 작동
- [ ] Reuse Detection 시 해당 사용자의 모든 Refresh Token 무효화
- [ ] Reuse Detection 로그 기록 (보안 감사)

#### Edge Cases

- 네트워크 불안정으로 응답을 받지 못한 경우 → 재시도 시 Reuse Detection 작동하지 않도록 Grace Period(5초) 적용
- 동시에 여러 디바이스에서 Refresh 요청 시 → 각각 별도의 Refresh Token으로 처리

---

### 2.4 User Story: Token Revocation (로그아웃)

#### As a 앱 사용자

로그아웃 시 발급된 모든 Token을 무효화합니다.

#### I want to 로그아웃 시 Refresh Token 무효화

다른 디바이스 또는 탈취된 Token으로 접근하지 못하도록 합니다.

#### So that 보안 강화

로그아웃 후에는 어떤 Token으로도 서비스에 접근할 수 없도록 보장합니다.

#### Acceptance Criteria

- [ ] `POST /auth/logout` 엔드포인트 제공
- [ ] 현재 Refresh Token 무효화 (revoked=true)
- [ ] 선택적으로 모든 디바이스의 Refresh Token 무효화 (revokeAll 파라미터)
- [ ] 무효화된 Token은 재사용 불가
- [ ] 로그아웃 성공 시 204 No Content 반환

#### Edge Cases

- Refresh Token이 이미 무효화된 경우 → 204 No Content (멱등성)
- Refresh Token이 존재하지 않는 경우 → 401 Unauthorized
- revokeAll=true 시 해당 사용자의 모든 Refresh Token 무효화

---

### 2.5 User Story: Token Reuse Detection

#### As a 시스템 관리자

Refresh Token 탈취를 조기에 탐지합니다.

#### I want to 이미 사용된 Refresh Token 재사용 시 알림

공격자가 탈취한 Token을 사용하려는 시도를 탐지하여 즉시 대응합니다.

#### So that 보안 위협 조기 탐지 및 대응

탈취된 Token 사용 시도를 탐지하여 해당 사용자의 모든 Token을 무효화하고 재로그인을 유도합니다.

#### Acceptance Criteria

- [ ] 이미 사용된(revoked=true) Refresh Token 재사용 시 탐지
- [ ] 탐지 시 해당 사용자의 모든 Refresh Token 무효화
- [ ] 탐지 로그 기록 (userId, tokenId, timestamp, IP)
- [ ] 401 Unauthorized 반환 및 재로그인 요구 메시지
- [ ] 운영 로그로 보안 팀에 알림 (ERROR 레벨)

#### Edge Cases

- Grace Period(5초) 내 재시도는 Reuse Detection 예외 처리 (네트워크 불안정)
- 동일 사용자가 여러 디바이스에서 정상적으로 사용 중인 경우는 탐지하지 않음

---

## 3. API Specifications

### 3.1 API Endpoint: OAuth Login (토큰 방식) - 수정

**기존 엔드포인트 수정**: `POST /auth/oauth`

**변경 사항**: 응답에 Refresh Token 추가

**Request**: 기존과 동일

```json
{
  "code": "wowa",
  "provider": "kakao",
  "accessToken": "mzMEt7vFIdnKEJUuNkaTc30YNqVCwIiLAAAAAQoNIdkAAAGbv280cm1lzvpaqIEo"
}
```

**Response (수정)**:

- Success (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "rt_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c...",
  "tokenType": "Bearer",
  "expiresIn": 1800,
  "user": {
    "id": 1,
    "provider": "kakao",
    "email": "user@example.com",
    "nickname": "홍길동",
    "profileImage": "https://k.kakaocdn.net/dn/profile.jpg",
    "appCode": "wowa",
    "lastLoginAt": "2026-01-16T10:30:00.000Z"
  }
}
```

**Response Fields**:

- `accessToken` (string): JWT Access Token (30분 만료)
- `refreshToken` (string): Refresh Token (14일 만료, single-use)
- `tokenType` (string): "Bearer" (고정)
- `expiresIn` (number): Access Token 만료까지 남은 시간(초) - 1800 (30분)
- `user` (object): 사용자 정보 (기존과 동일)

**Business Logic**:

1. OAuth Provider 토큰 검증 (기존과 동일)
2. 사용자 정보 조회 및 저장/업데이트 (기존과 동일)
3. Access Token 생성 (만료: 30분)
4. Refresh Token 생성 (만료: 14일)
   - 고유 식별자(jti) 생성: UUID v4
   - Token 페이로드: `{ sub: userId, appId, jti, tokenFamily }`
   - Token Family ID 생성: 첫 로그인 시 새로운 Family ID 부여
5. Refresh Token 데이터베이스 저장
   - Hash(Refresh Token) 저장 (bcrypt)
   - 메타데이터 저장: userId, appId, jti, tokenFamily, expiresAt, createdAt
6. 응답 반환 (Access Token + Refresh Token)

**Validation Rules**:

- Refresh Token 저장 실패 시 전체 트랜잭션 롤백
- 앱별 Refresh Token 만료 기간 설정 가능 (apps.refreshTokenExpiresIn)

---

### 3.2 API Endpoint: OAuth Callback - 수정

**기존 엔드포인트 수정**: `GET /auth/oauth/callback`

**변경 사항**: HTML 응답에 Refresh Token 추가 표시

**Request**: 기존과 동일

**Response**: HTML 페이지에 Refresh Token 추가 표시

**Business Logic**: 3.1과 동일 (Access Token + Refresh Token 발급)

---

### 3.3 API Endpoint: Refresh Access Token

**Method**: `POST`
**Path**: `/auth/refresh`

**Request**:

- Headers:

```
Content-Type: application/json
```

- Body:

```json
{
  "refreshToken": "rt_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c..."
}
```

**Request Fields**:

- `refreshToken` (string, required): 기존 Refresh Token

**Response**:

- Success (200 OK):

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "rt_1a2b3c4d5e6f7g8h9i0j1k2l3m4n5o6p...",
  "tokenType": "Bearer",
  "expiresIn": 1800
}
```

- Error (401 Unauthorized - Refresh Token 만료):

```json
{
  "error": {
    "message": "Refresh token expired. Please login again.",
    "code": "REFRESH_TOKEN_EXPIRED"
  }
}
```

- Error (401 Unauthorized - Refresh Token 무효화):

```json
{
  "error": {
    "message": "Refresh token has been revoked. Please login again.",
    "code": "REFRESH_TOKEN_REVOKED"
  }
}
```

- Error (401 Unauthorized - Reuse Detection):

```json
{
  "error": {
    "message": "Refresh token reuse detected. All tokens have been revoked. Please login again.",
    "code": "REFRESH_TOKEN_REUSE_DETECTED"
  }
}
```

- Error (400 Bad Request - 유효성 검증 실패):

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "code": "invalid_type",
        "message": "refreshToken is required",
        "path": ["refreshToken"]
      }
    ]
  }
}
```

**Business Logic**:

1. Refresh Token 유효성 검증
   - 형식 검증 (문자열, 최소 길이)
   - JWT 서명 검증
   - 만료 시간 확인
2. 데이터베이스에서 Refresh Token 조회
   - Hash(Refresh Token)으로 조회
   - 존재하지 않으면 401 Unauthorized
3. Refresh Token 상태 확인
   - revoked=true 인 경우:
     - Grace Period(5초) 확인
     - Grace Period 내: 정상 처리 (네트워크 재시도)
     - Grace Period 초과: **Reuse Detection** 작동
       - 해당 사용자의 모든 Refresh Token 무효화
       - 보안 로그 기록 (ERROR 레벨)
       - 401 Unauthorized 반환
   - expiresAt < now 인 경우: 401 Unauthorized
4. 새로운 Access Token 생성 (30분 만료)
5. 새로운 Refresh Token 생성 (Rotation)
   - 새로운 jti 생성
   - 동일한 tokenFamily 유지
   - 14일 만료
6. 기존 Refresh Token 무효화
   - revoked=true 설정
   - revokedAt=now 설정
7. 새로운 Refresh Token 저장 (Hash)
8. 응답 반환

**Validation Rules**:

- refreshToken: 필수, 문자열, 최소 32자
- Refresh Token JWT 서명 검증 필수
- 데이터베이스 저장 실패 시 트랜잭션 롤백

---

### 3.4 API Endpoint: Logout

**Method**: `POST`
**Path**: `/auth/logout`

**Request**:

- Headers:

```
Content-Type: application/json
```

- Body:

```json
{
  "refreshToken": "rt_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c...",
  "revokeAll": false
}
```

**Request Fields**:

- `refreshToken` (string, required): 무효화할 Refresh Token
- `revokeAll` (boolean, optional): 모든 디바이스의 Token 무효화 여부 (기본값: false)

**Response**:

- Success (204 No Content): 빈 응답

- Error (401 Unauthorized - Refresh Token 없음):

```json
{
  "error": {
    "message": "Refresh token not found",
    "code": "REFRESH_TOKEN_NOT_FOUND"
  }
}
```

- Error (400 Bad Request):

```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "code": "invalid_type",
        "message": "refreshToken is required",
        "path": ["refreshToken"]
      }
    ]
  }
}
```

**Business Logic**:

1. Refresh Token 유효성 검증 (형식, 서명)
2. 데이터베이스에서 Refresh Token 조회
   - Hash(Refresh Token)으로 조회
   - 존재하지 않으면 401 Unauthorized
3. revokeAll=false (기본값):
   - 현재 Refresh Token만 무효화 (revoked=true, revokedAt=now)
4. revokeAll=true:
   - 해당 사용자(userId)의 모든 Refresh Token 무효화
5. 운영 로그 기록 (INFO 레벨)
6. 204 No Content 반환

**Validation Rules**:

- refreshToken: 필수, 문자열
- revokeAll: 선택, 불리언 (기본값: false)
- 이미 무효화된 Token도 204 반환 (멱등성)

---

## 4. Business Rules

### 4.1 Token 만료 시간

- **Access Token**: 30분 (기존 7일에서 단축)
- **Refresh Token**: 14일 (앱별 설정 가능)
- 앱별로 `apps.accessTokenExpiresIn`, `apps.refreshTokenExpiresIn` 설정 가능

### 4.2 Refresh Token Rotation

- Refresh Token은 single-use (1회 사용 후 무효화)
- 사용 시 새로운 Refresh Token 발급
- 기존 Refresh Token은 즉시 무효화 (revoked=true)
- 동일한 Token Family 유지 (tokenFamily ID)

### 4.3 Reuse Detection

- 이미 무효화된(revoked=true) Refresh Token 재사용 시 탐지
- Grace Period: 5초 (네트워크 재시도 허용)
- 탐지 시 해당 사용자의 모든 Refresh Token 무효화
- 보안 로그 기록 (ERROR 레벨, userId, tokenId, IP)

### 4.4 Token Family

- 첫 로그인 시 새로운 Token Family ID 생성 (UUID v4)
- Refresh Token Rotation 시 동일한 Family ID 유지
- Reuse Detection 시 해당 Family의 모든 Token 무효화

### 4.5 Token Storage

- Refresh Token은 **해시화하여 저장** (bcrypt)
- 데이터베이스 테이블: `refresh_tokens`
- 저장 정보:
  - tokenHash: bcrypt(refreshToken)
  - userId: 사용자 ID
  - appId: 앱 ID
  - jti: 고유 식별자 (UUID v4)
  - tokenFamily: Token Family ID (UUID v4)
  - expiresAt: 만료 시간
  - revoked: 무효화 여부 (boolean, default: false)
  - revokedAt: 무효화 시간 (nullable)
  - createdAt: 생성 시간

### 4.6 로그아웃

- `revokeAll=false`: 현재 디바이스의 Refresh Token만 무효화
- `revokeAll=true`: 모든 디바이스의 Refresh Token 무효화
- 로그아웃 후에도 Access Token은 만료 시까지 유효 (30분)

---

## 5. Non-Functional Requirements

### 5.1 Performance

- **Refresh Token 조회**: 인덱스(tokenHash) 사용, 응답 시간 < 100ms
- **Token 발급**: 응답 시간 < 200ms
- **Reuse Detection**: 실시간 탐지, 응답 시간 < 100ms

### 5.2 Security

- **Refresh Token 저장**: bcrypt 해시 사용 (salt rounds: 10)
- **Reuse Detection**: 탈취 시도 즉시 탐지 및 대응
- **Token Rotation**: 매 사용 시 새로운 Token 발급
- **Grace Period**: 5초 (네트워크 재시도 허용)
- **보안 로그**: Reuse Detection 시 ERROR 레벨 로그 기록

### 5.3 Data Integrity

- **트랜잭션**: Refresh Token 저장 실패 시 로그인 전체 롤백
- **Atomic Operations**: Token 무효화 및 새 Token 발급은 원자적 수행
- **데이터 정합성**: revoked=true인 Token은 재사용 불가

### 5.4 Scalability

- **Database**: PostgreSQL (현재 시스템과 동일)
- **Indexing**: tokenHash, userId, expiresAt에 인덱스 생성
- **Cleanup**: 만료된 Refresh Token 정기 삭제 (배치 작업, 30일 이상 된 Token)

### 5.5 Monitoring & Logging

- **INFO 로그**:
  - Refresh Token 발급 (userId, appId, jti)
  - Refresh Token 갱신 (userId, oldJti, newJti)
  - 로그아웃 (userId, revokeAll)
- **ERROR 로그**:
  - Reuse Detection (userId, jti, IP, timestamp)
  - Token 저장 실패 (userId, reason)

---

## 6. Dependencies

### 6.1 Database Schema Changes

새로운 테이블 추가: `refresh_tokens`

```sql
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

CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE INDEX idx_refresh_tokens_token_family ON refresh_tokens(token_family);
```

### 6.2 Apps Table Schema Changes

```sql
ALTER TABLE apps
  ADD COLUMN access_token_expires_in VARCHAR(20) DEFAULT '30m',
  ADD COLUMN refresh_token_expires_in VARCHAR(20) DEFAULT '14d';

-- 기존 jwtExpiresIn을 accessTokenExpiresIn으로 마이그레이션
UPDATE apps SET access_token_expires_in = jwt_expires_in;

-- 기존 컬럼은 Deprecated (하위 호환성)
```

### 6.3 External Libraries

- **bcrypt** (또는 bcryptjs): Refresh Token 해싱
- **uuid**: jti 및 tokenFamily 생성
- 기존: **jsonwebtoken**: JWT 생성/검증

### 6.4 Module Dependencies

- **src/modules/auth**: 기존 인증 모듈 확장
- **src/utils/jwt.ts**: Access Token 생성 (기존)
- **새로 추가**:
  - `src/modules/auth/refresh-token.service.ts`: Refresh Token 비즈니스 로직
  - `src/modules/auth/refresh-token.schema.ts`: Refresh Token DB 스키마
  - `src/modules/auth/refresh-token.probe.ts`: Refresh Token 운영 로그

---

## 7. Assumptions

### 7.1 Token 저장소

- PostgreSQL 사용 (현재 시스템과 동일)
- Redis 등 별도 캐시 레이어 사용하지 않음 (향후 고려 가능)

### 7.2 클라이언트 저장

- 모바일 앱: Secure Storage (iOS Keychain, Android Keystore)에 Refresh Token 저장
- 웹 앱: HttpOnly Cookie에 Refresh Token 저장 (향후 고려)

### 7.3 디바이스 관리

- 동일 사용자가 여러 디바이스에서 로그인 가능
- 각 디바이스는 별도의 Refresh Token 보유
- revokeAll=true 시 모든 디바이스에서 로그아웃

### 7.4 하위 호환성

- 기존 클라이언트는 `token` 필드 사용 (Deprecated)
- 새로운 클라이언트는 `accessToken`, `refreshToken` 필드 사용
- 기존 `apps.jwtExpiresIn` 필드는 유지 (Deprecated, `accessTokenExpiresIn`으로 대체)

### 7.5 Rate Limiting

- 현재 구현 범위에 포함하지 않음
- 프로덕션 배포 전 `/auth/refresh` 엔드포인트에 Rate Limiting 추가 권장

### 7.6 Access Token Blacklist

- Access Token은 만료 전까지 유효 (Blacklist 구현하지 않음)
- 로그아웃 후에도 Access Token은 30분간 사용 가능
- 보안 이슈 발생 시 Refresh Token 무효화하여 재발급 차단

---

## 8. API Response 변경 사항 요약

### 8.1 기존 응답 (Deprecated)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": { ... }
}
```

### 8.2 새로운 응답 (Recommended)

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "rt_9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c...",
  "tokenType": "Bearer",
  "expiresIn": 1800,
  "user": { ... },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."  // Deprecated (하위 호환성)
}
```

### 8.3 마이그레이션 가이드

1. **Phase 1**: `accessToken`, `refreshToken` 필드 추가 (기존 `token` 필드 유지)
2. **Phase 2**: 클라이언트 업데이트 (새로운 필드 사용)
3. **Phase 3**: 기존 `token` 필드 제거 (v2.0.0)

---

## 9. Security Considerations

### 9.1 Refresh Token 탈취 시나리오

**시나리오**: 공격자가 Refresh Token을 탈취

**대응**:

1. Refresh Token은 1회 사용 후 자동 무효화 (Rotation)
2. 정상 사용자가 다음 Refresh 요청 시 새로운 Token 발급
3. 공격자가 탈취한(이미 사용된) Token으로 재요청 시 Reuse Detection 작동
4. 해당 사용자의 모든 Token 무효화
5. 보안 팀에 알림 (ERROR 로그)

### 9.2 Token Family를 통한 추적

- 첫 로그인 시 Token Family ID 생성
- Rotation 시 동일한 Family ID 유지
- Reuse Detection 시 해당 Family의 모든 Token 무효화
- 다른 디바이스의 정상 사용은 영향 없음 (별도 Family)

### 9.3 Grace Period

- 네트워크 불안정으로 응답을 받지 못한 경우 재시도 허용
- 5초 이내 재시도는 Reuse Detection 예외 처리
- 5초 초과 시 정상적인 Reuse Detection 작동

---

## 10. Testing Requirements

### 10.1 Unit Tests

- Refresh Token 생성 및 검증
- Token Rotation 로직
- Reuse Detection 로직
- Token 해시화 및 비교

### 10.2 Integration Tests

- OAuth 로그인 → Access Token + Refresh Token 발급
- Refresh Token으로 Access Token 갱신
- 로그아웃 → Token 무효화
- Reuse Detection → 모든 Token 무효화

### 10.3 Security Tests

- 만료된 Refresh Token 사용 → 401
- 무효화된 Refresh Token 사용 → 401
- Reuse Detection 작동 확인
- Grace Period 동작 확인

---

## Sources

업계 표준 및 보안 Best Practices 참조:

- [Refresh Token Rotation: Best Practices for Developers](https://www.serverion.com/uncategorized/refresh-token-rotation-best-practices-for-developers/)
- [The Developer's Guide to Refresh Token Rotation](https://www.descope.com/blog/post/refresh-token-rotation)
- [JWT Token Lifecycle Management: Expiration, Refresh, and Revocation Strategies](https://skycloak.io/blog/jwt-token-lifecycle-management-expiration-refresh-revocation-strategies/)
- [Auth.js | Refresh Token Rotation](https://authjs.dev/guides/refresh-token-rotation)
- [Token Best Practices - Auth0 Docs](https://auth0.com/docs/secure/tokens/token-best-practices)
- [Refresh access tokens and rotate refresh tokens | Okta Developer](https://developer.okta.com/docs/guides/refresh-tokens/main/)
