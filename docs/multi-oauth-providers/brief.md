# 기술 설계: 다중 OAuth Provider 구현

## 1. 아키텍처 설계

### 1.1 현재 구조 (카카오 Provider 기반)

```
src/modules/auth/providers/
├── base.ts                      # IOAuthProvider 인터페이스
├── kakao.ts                     # KakaoProvider 구현
└── index.ts                     # createOAuthProvider() 팩토리

tests/unit/auth/providers/
└── kakao.test.ts                # KakaoProvider 테스트
```

### 1.2 확장 후 구조

```
src/modules/auth/providers/
├── base.ts                      # IOAuthProvider 인터페이스 (변경 없음)
├── kakao.ts                     # KakaoProvider 구현 (변경 없음)
├── naver.ts                     # NaverProvider 구현 (신규)
├── google.ts                    # GoogleProvider 구현 (신규)
├── apple.ts                     # AppleProvider 구현 (신규)
└── index.ts                     # createOAuthProvider() 팩토리 (수정)

tests/unit/auth/providers/
├── kakao.test.ts                # KakaoProvider 테스트 (변경 없음)
├── naver.test.ts                # NaverProvider 테스트 (신규)
├── google.test.ts               # GoogleProvider 테스트 (신규)
└── apple.test.ts                # AppleProvider 테스트 (신규)
```

### 1.3 IOAuthProvider 인터페이스

**파일**: `src/modules/auth/providers/base.ts`

```typescript
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

**OAuthUserInfo 정규화 타입**:
```typescript
export interface OAuthUserInfo {
  providerId: string;          // Provider에서 제공하는 사용자 고유 ID
  email: string | null;        // 이메일 (선택)
  nickname: string | null;     // 별명 (선택)
  profileImage: string | null; // 프로필 이미지 URL (선택)
}
```

---

## 2. Provider별 구현 상세

### 2.1 네이버 Provider

**파일**: `src/modules/auth/providers/naver.ts`

#### 클래스 구조
```typescript
export class NaverProvider implements IOAuthProvider {
  readonly name = 'naver';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async verifyToken(accessToken: string): Promise<void>
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo>
}
```

#### verifyToken() 구현 전략

**API 호출**:
- 엔드포인트: `GET https://openapi.naver.com/v1/nid/me`
- 헤더: `Authorization: Bearer {accessToken}`

**응답 예시**:
```json
{
  "resultcode": "00",
  "message": "success",
  "response": {
    "id": "12345678",
    "email": "user@example.com",
    "nickname": "홍길동",
    "profile_image": "https://example.com/image.jpg"
  }
}
```

**검증 로직**:
```typescript
async verifyToken(accessToken: string): Promise<void> {
  try {
    const response = await axios.get(
      'https://openapi.naver.com/v1/nid/me',
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (response.data.resultcode !== '00') {
      throw new UnauthorizedException(
        'Naver token verification failed',
        'INVALID_TOKEN'
      );
    }
  } catch (error: any) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new ExternalApiException('naver', error);
  }
}
```

#### getUserInfo() 구현

**정규화 로직**:
```typescript
async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  try {
    const response = await axios.get<NaverUserInfoResponse>(
      'https://openapi.naver.com/v1/nid/me',
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    if (response.data.resultcode !== '00') {
      throw new UnauthorizedException(
        'Failed to get user info from Naver',
        'EXTERNAL_API_ERROR'
      );
    }

    const { id, email, nickname, profile_image } = response.data.response;

    return {
      providerId: id,
      email: email ?? null,
      nickname: nickname ?? null,
      profileImage: profile_image ?? null,
    };
  } catch (error: any) {
    throw new ExternalApiException('naver', error);
  }
}
```

#### 타입 정의
```typescript
interface NaverUserInfoResponse {
  resultcode: string;
  message: string;
  response: {
    id: string;
    email?: string;
    nickname?: string;
    profile_image?: string;
  };
}
```

---

### 2.2 구글 Provider

**파일**: `src/modules/auth/providers/google.ts`

#### 클래스 구조
```typescript
export class GoogleProvider implements IOAuthProvider {
  readonly name = 'google';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async verifyToken(accessToken: string): Promise<void>
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo>
}
```

#### verifyToken() 구현 전략

**API 호출**:
- 엔드포인트: `GET https://www.googleapis.com/oauth2/v1/tokeninfo?access_token={token}`

**응답 예시**:
```json
{
  "issued_to": "1234567890",
  "audience": "1234567890.apps.googleusercontent.com",
  "user_id": "1234567890",
  "scope": "openid profile email",
  "expires_in": 3599,
  "email": "user@gmail.com",
  "verified_email": true
}
```

**검증 로직**:
```typescript
async verifyToken(accessToken: string): Promise<void> {
  try {
    const response = await axios.get(
      `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
    );

    // audience (aud) 검증 (선택)
    if (response.data.audience !== this.clientId) {
      throw new UnauthorizedException(
        'Google token audience mismatch',
        'INVALID_TOKEN'
      );
    }
  } catch (error: any) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new ExternalApiException('google', error);
  }
}
```

#### getUserInfo() 구현

**API 호출**:
- 엔드포인트: `GET https://www.googleapis.com/oauth2/v2/userinfo`
- 헤더: `Authorization: Bearer {accessToken}`

**응답 예시**:
```json
{
  "id": "1234567890",
  "email": "user@gmail.com",
  "verified_email": true,
  "name": "홍길동",
  "picture": "https://example.com/photo.jpg"
}
```

**정규화 로직**:
```typescript
async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  try {
    const response = await axios.get<GoogleUserInfo>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    );

    const { id, email, name, picture } = response.data;

    return {
      providerId: id,
      email: email ?? null,
      nickname: name ?? null,
      profileImage: picture ?? null,
    };
  } catch (error: any) {
    throw new ExternalApiException('google', error);
  }
}
```

#### 타입 정의
```typescript
interface GoogleUserInfo {
  id: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
}
```

---

### 2.3 애플 Provider

**파일**: `src/modules/auth/providers/apple.ts`

#### 클래스 구조
```typescript
export class AppleProvider implements IOAuthProvider {
  readonly name = 'apple';

  constructor(
    private readonly clientId: string,
    private readonly teamId: string,
    private readonly keyId: string,
    private readonly privateKey: string
  ) {}

  async verifyToken(accessToken: string): Promise<void>
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo>
}
```

#### verifyToken() 구현 전략

**JWT 검증**:
- 애플은 ID Token (JWT) 형식
- `jsonwebtoken` 라이브러리 사용
- Apple 공개키로 서명 검증

**검증 로직**:
```typescript
import jwt from 'jsonwebtoken';

async verifyToken(accessToken: string): Promise<void> {
  try {
    // 간단한 검증 (공개키 없이 디코딩만)
    const decoded = jwt.decode(accessToken, { complete: true });

    if (!decoded || typeof decoded === 'string') {
      throw new UnauthorizedException(
        'Invalid Apple ID token',
        'INVALID_TOKEN'
      );
    }

    // aud (audience) 검증
    const payload = decoded.payload as any;
    if (payload.aud !== this.clientId) {
      throw new UnauthorizedException(
        'Apple token audience mismatch',
        'INVALID_TOKEN'
      );
    }

    // 만료 시간 검증
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException(
        'Apple token expired',
        'EXPIRED_TOKEN'
      );
    }

    // 향후 개선: Apple 공개키 다운로드 및 서명 검증
    // https://appleid.apple.com/auth/keys
  } catch (error: any) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }
    throw new ExternalApiException('apple', error);
  }
}
```

**향후 개선 사항**:
- Apple 공개키 다운로드: `https://appleid.apple.com/auth/keys`
- `jsonwebtoken.verify()` 사용하여 서명 검증
- 공개키 캐싱 (1시간 TTL)

#### getUserInfo() 구현

**ID Token에서 정보 추출**:
```typescript
async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
  try {
    const decoded = jwt.decode(accessToken) as any;

    if (!decoded || !decoded.sub) {
      throw new UnauthorizedException(
        'Invalid Apple ID token',
        'INVALID_TOKEN'
      );
    }

    return {
      providerId: decoded.sub,
      email: decoded.email ?? null,
      nickname: null,  // 애플은 이름을 최초 로그인 시에만 제공 (ID Token에 없음)
      profileImage: null,  // 애플은 프로필 이미지 미제공
    };
  } catch (error: any) {
    throw new ExternalApiException('apple', error);
  }
}
```

**주의사항**:
- 애플은 이름을 최초 로그인 시에만 제공 (ID Token에 포함되지 않음)
- 프로필 이미지는 제공하지 않음
- 이메일은 선택적 (사용자가 공유 거부 시 `null`)

---

## 3. DB 스키마 설계

### 3.1 apps 테이블 (변경 없음)

기존 `apps` 테이블에 이미 다음 컬럼이 예비되어 있음:

```typescript
export const apps = pgTable('apps', {
  // ... 기존 필드

  // 네이버 OAuth
  naverClientId: varchar('naver_client_id', { length: 255 }),
  naverClientSecret: varchar('naver_client_secret', { length: 255 }),

  // 구글 OAuth
  googleClientId: varchar('google_client_id', { length: 255 }),
  googleClientSecret: varchar('google_client_secret', { length: 255 }),

  // 애플 OAuth
  appleClientId: varchar('apple_client_id', { length: 255 }),
  appleTeamId: varchar('apple_team_id', { length: 255 }),
  appleKeyId: varchar('apple_key_id', { length: 255 }),
  applePrivateKey: varchar('apple_private_key'),

  // ...
});
```

**결론**: 마이그레이션 불필요. 기존 컬럼 활용.

### 3.2 users 테이블 (변경 없음)

```typescript
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  appId: integer('app_id').notNull(),

  provider: varchar('provider', { length: 20 }).notNull(), // 'kakao' | 'naver' | 'google' | 'apple'
  providerId: varchar('provider_id', { length: 100 }).notNull(),

  email: varchar('email', { length: 255 }),
  nickname: varchar('nickname', { length: 255 }),
  profileImage: varchar('profile_image', { length: 500 }),

  // ...
}, (table) => ({
  uniqueProviderUser: unique().on(table.appId, table.provider, table.providerId),
}));
```

**핵심**:
- `provider`: 'naver', 'google', 'apple' 문자열로 저장 가능 (varchar(20) 충분)
- 복합 Unique 제약: `(appId, provider, providerId)` - 같은 앱에서 같은 provider의 같은 providerId는 1개만

---

## 4. 보안 메커니즘

### 4.1 공통 보안 원칙

1. **Token 검증 필수**: 모든 Provider에서 `verifyToken()` 구현
2. **HTTPS 통신**: axios 기본값 사용
3. **에러 래핑**: 외부 API 오류를 내부 예외로 변환 (`ExternalApiException`)
4. **크레덴셜 주입**: 생성자 주입으로 의존성 분리

### 4.2 Provider별 특이사항

**네이버**:
- Access Token을 Bearer 헤더로 전송
- `/v1/nid/me` 엔드포인트 1회 호출로 검증 + 정보 조회 동시 수행 가능
- `resultcode` 필드로 성공 여부 확인

**구글**:
- Token 검증: `/oauth2/v1/tokeninfo` 호출
- 사용자 정보: `/oauth2/v2/userinfo` 호출
- 2회 API 호출 필요
- `audience` 필드 검증 권장

**애플**:
- JWT 기반 ID Token 검증
- 공개키 다운로드 및 서명 검증 (향후 개선)
- 초기에는 `jwt.decode()` + 수동 검증
- 만료 시간 (`exp`) 검증 필수

### 4.3 에러 처리

**ExternalApiException 래핑**:
```typescript
try {
  await axios.get(...);
} catch (error: any) {
  if (error instanceof UnauthorizedException) {
    throw error;
  }
  throw new ExternalApiException('naver', error);
}
```

**의도**:
- 외부 API 오류를 내부 예외로 변환
- 스택 트레이스 및 원본 오류 보존
- 글로벌 에러 핸들러에서 일관된 처리

---

## 5. 통합 포인트

### 5.1 providers/index.ts 수정

#### ProviderCredentials 확장

```typescript
interface ProviderCredentials {
  kakao?: {
    restApiKey: string;
    clientSecret: string;
  };
  naver?: {
    clientId: string;
    clientSecret: string;
  };
  google?: {
    clientId: string;
    clientSecret: string;
  };
  apple?: {
    clientId: string;
    teamId: string;
    keyId: string;
    privateKey: string;
  };
}
```

#### createOAuthProvider() 확장

```typescript
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

    case 'naver':
      if (!credentials.naver) {
        throw new ValidationException('Naver credentials not configured');
      }
      return new NaverProvider(
        credentials.naver.clientId,
        credentials.naver.clientSecret
      );

    case 'google':
      if (!credentials.google) {
        throw new ValidationException('Google credentials not configured');
      }
      return new GoogleProvider(
        credentials.google.clientId,
        credentials.google.clientSecret
      );

    case 'apple':
      if (!credentials.apple) {
        throw new ValidationException('Apple credentials not configured');
      }
      return new AppleProvider(
        credentials.apple.clientId,
        credentials.apple.teamId,
        credentials.apple.keyId,
        credentials.apple.privateKey
      );

    default:
      throw new ValidationException(`Unsupported provider: ${provider}`);
  }
}
```

#### import 추가

```typescript
import { NaverProvider } from './naver';
import { GoogleProvider } from './google';
import { AppleProvider } from './apple';
```

---

### 5.2 handlers.ts 수정

**oauthLogin 핸들러의 크레덴셜 추출 로직 확장** (라인 46-56):

```typescript
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
} else if (provider === 'naver') {
  if (!app.naverClientId || !app.naverClientSecret) {
    throw new ValidationException(`Provider ${provider} not configured for app ${code}`);
  }
  credentials.naver = {
    clientId: app.naverClientId,
    clientSecret: app.naverClientSecret,
  };
} else if (provider === 'google') {
  if (!app.googleClientId || !app.googleClientSecret) {
    throw new ValidationException(`Provider ${provider} not configured for app ${code}`);
  }
  credentials.google = {
    clientId: app.googleClientId,
    clientSecret: app.googleClientSecret,
  };
} else if (provider === 'apple') {
  if (!app.appleClientId || !app.appleTeamId || !app.appleKeyId || !app.applePrivateKey) {
    throw new ValidationException(`Provider ${provider} not configured for app ${code}`);
  }
  credentials.apple = {
    clientId: app.appleClientId,
    teamId: app.appleTeamId,
    keyId: app.appleKeyId,
    privateKey: app.applePrivateKey,
  };
}
```

---

### 5.3 validators.ts 수정 (선택)

**oauthLoginSchema Provider 타입 확장**:

```typescript
export const oauthLoginSchema = z.object({
  code: z.string().min(1),
  provider: z.enum(['kakao', 'naver', 'google', 'apple']),
  accessToken: z.string().min(1),
});
```

---

## 6. 테스트 전략

### 6.1 단위 테스트

각 Provider별 테스트 파일 생성:
- `tests/unit/auth/providers/naver.test.ts`
- `tests/unit/auth/providers/google.test.ts`
- `tests/unit/auth/providers/apple.test.ts`

**테스트 케이스**:
1. **verifyToken() 성공**: 유효한 토큰 → 예외 없음
2. **verifyToken() 실패**: 무효한 토큰 → `UnauthorizedException`
3. **verifyToken() 네트워크 오류**: axios 오류 → `ExternalApiException`
4. **getUserInfo() 성공**: 정규화된 `OAuthUserInfo` 반환
5. **getUserInfo() 선택 필드 누락**: `null` 처리

**참고 테스트**: `tests/unit/auth/providers/kakao.test.ts`

---

### 6.2 통합 테스트 (수동)

**네이버 로그인 테스트**:
```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "wowa",
    "provider": "naver",
    "accessToken": "<네이버 액세스 토큰>"
  }'
```

**구글 로그인 테스트**:
```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "wowa",
    "provider": "google",
    "accessToken": "<구글 액세스 토큰>"
  }'
```

**애플 로그인 테스트**:
```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "wowa",
    "provider": "apple",
    "accessToken": "<애플 ID 토큰>"
  }'
```

---

## 7. 의존성

### 7.1 기존 의존성 활용

- `axios`: HTTP 클라이언트 (모든 Provider)
- `jsonwebtoken`: JWT 검증 (애플)

### 7.2 신규 의존성 없음

애플 Provider는 기존 `jsonwebtoken` 패키지로 충분.

---

## 8. 제약 사항 및 향후 개선 사항

### 8.1 애플 Provider

**현재 제약**:
- 공개키 검증 미구현 (간단한 디코딩 + 수동 검증)
- 이름 정보 누락 (최초 로그인 시에만 제공됨)
- 프로필 이미지 미제공

**향후 개선**:
- Apple 공개키 다운로드 및 캐싱 (`https://appleid.apple.com/auth/keys`)
- `jsonwebtoken.verify()` 사용하여 서명 검증
- 이름 정보를 앱 서버에서 별도 관리 (최초 로그인 시 저장)

### 8.2 공통

**향후 개선**:
- Provider별 Rate Limiting 처리
- Access Token 캐싱 (중복 요청 방지)
- 운영 로그 강화 (Provider별 API 호출 통계)

---

## 9. CLAUDE.md 준수

### 9.1 예외 처리

- `ExternalApiException`으로 외부 API 오류 래핑
- `UnauthorizedException`으로 인증 실패 표현
- `ValidationException`으로 크레덴셜 누락 표현

### 9.2 API Response

- camelCase 사용 (`providerId`, `profileImage`)
- null 처리 (선택 필드는 `null`)

### 9.3 로깅

- Domain Probe 패턴 활용 (`authProbe.loginSuccess()`)
- 외부 API 호출 실패 시 WARN 로그

### 9.4 JSDoc

- 모든 Provider 클래스 및 메서드에 한국어 JSDoc 주석 작성
