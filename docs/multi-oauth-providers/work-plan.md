# 작업 계획: 다중 OAuth Provider 병렬 구현

## 개요

이 작업은 **Phase 1 (병렬 구현)** → **Phase 2 (순차 통합)** 2단계로 진행됩니다.

- **Phase 1**: 3명이 독립적으로 Provider 구현 (Git 충돌 없음)
- **Phase 2**: 1명이 통합 작업 (Factory, handlers, 테스트)

**예상 소요 시간**: 2-3일 (순차 대비 70% 단축)

---

## Phase 1: 병렬 Provider 구현 (3명 동시 작업)

### 작업자 A: 네이버 Provider 구현

#### 파일 생성
- `src/modules/auth/providers/naver.ts`
- `tests/unit/auth/providers/naver.test.ts`

#### 구현 내용

**1. NaverProvider 클래스 생성**

```typescript
// src/modules/auth/providers/naver.ts
import axios from 'axios';
import { IOAuthProvider, OAuthUserInfo } from './base';
import { UnauthorizedException, ExternalApiException } from '../../utils/errors';

/**
 * 네이버 OAuth Provider
 */
export class NaverProvider implements IOAuthProvider {
  readonly name = 'naver';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  /**
   * 네이버 Access Token 유효성 검증
   */
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

  /**
   * 네이버 사용자 정보 조회 (정규화)
   */
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
}

/**
 * 네이버 사용자 정보 응답 타입
 */
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

**2. 단위 테스트 작성**

```typescript
// tests/unit/auth/providers/naver.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { NaverProvider } from '../../../src/modules/auth/providers/naver';
import { ExternalApiException, UnauthorizedException } from '../../../src/utils/errors';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('NaverProvider', () => {
  let provider: NaverProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new NaverProvider('naver-client-id', 'naver-client-secret');
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          resultcode: '00',
          message: 'success',
          response: { id: '123' },
        },
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://openapi.naver.com/v1/nid/me',
        { headers: { Authorization: 'Bearer valid-token' } }
      );
    });

    it('should throw UnauthorizedException when resultcode is not 00', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          resultcode: '401',
          message: 'invalid token',
        },
      });

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
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
          resultcode: '00',
          message: 'success',
          response: {
            id: '123',
            email: 'test@naver.com',
            nickname: '홍길동',
            profile_image: 'https://example.com/image.jpg',
          },
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '123',
        email: 'test@naver.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/image.jpg',
      });
    });

    it('should handle optional fields as null', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          resultcode: '00',
          message: 'success',
          response: { id: '123' },
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '123',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('should throw ExternalApiException on API error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });
});
```

#### 체크리스트
- [ ] `naver.ts` 파일 생성 및 구현
- [ ] `naver.test.ts` 파일 생성 및 테스트 작성
- [ ] 모든 테스트 통과 확인: `pnpm test tests/unit/auth/providers/naver.test.ts`

---

### 작업자 B: 구글 Provider 구현

#### 파일 생성
- `src/modules/auth/providers/google.ts`
- `tests/unit/auth/providers/google.test.ts`

#### 구현 내용

**1. GoogleProvider 클래스 생성**

```typescript
// src/modules/auth/providers/google.ts
import axios from 'axios';
import { IOAuthProvider, OAuthUserInfo } from './base';
import { UnauthorizedException, ExternalApiException } from '../../utils/errors';

/**
 * 구글 OAuth Provider
 */
export class GoogleProvider implements IOAuthProvider {
  readonly name = 'google';

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  /**
   * 구글 Access Token 유효성 검증
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      const response = await axios.get(
        `https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`
      );

      // audience (aud) 검증
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

  /**
   * 구글 사용자 정보 조회 (정규화)
   */
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
}

/**
 * 구글 사용자 정보 응답 타입
 */
interface GoogleUserInfo {
  id: string;
  email?: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
}
```

**2. 단위 테스트 작성**

```typescript
// tests/unit/auth/providers/google.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { GoogleProvider } from '../../../src/modules/auth/providers/google';
import { ExternalApiException, UnauthorizedException } from '../../../src/utils/errors';

vi.mock('axios');
const mockedAxios = vi.mocked(axios);

describe('GoogleProvider', () => {
  let provider: GoogleProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GoogleProvider('google-client-id', 'google-client-secret');
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          issued_to: '1234567890',
          audience: 'google-client-id',
          user_id: '1234567890',
          expires_in: 3599,
        },
      });

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when audience mismatch', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          audience: 'wrong-client-id',
        },
      });

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
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
          id: '1234567890',
          email: 'test@gmail.com',
          verified_email: true,
          name: '홍길동',
          picture: 'https://example.com/photo.jpg',
        },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '1234567890',
        email: 'test@gmail.com',
        nickname: '홍길동',
        profileImage: 'https://example.com/photo.jpg',
      });
    });

    it('should handle optional fields as null', async () => {
      mockedAxios.get.mockResolvedValueOnce({
        data: { id: '1234567890' },
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '1234567890',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('should throw ExternalApiException on API error', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(ExternalApiException);
    });
  });
});
```

#### 체크리스트
- [ ] `google.ts` 파일 생성 및 구현
- [ ] `google.test.ts` 파일 생성 및 테스트 작성
- [ ] 모든 테스트 통과 확인: `pnpm test tests/unit/auth/providers/google.test.ts`

---

### 작업자 C: 애플 Provider 구현

#### 파일 생성
- `src/modules/auth/providers/apple.ts`
- `tests/unit/auth/providers/apple.test.ts`

#### 구현 내용

**1. AppleProvider 클래스 생성**

```typescript
// src/modules/auth/providers/apple.ts
import jwt from 'jsonwebtoken';
import { IOAuthProvider, OAuthUserInfo } from './base';
import { UnauthorizedException, ExternalApiException } from '../../utils/errors';

/**
 * 애플 OAuth Provider
 */
export class AppleProvider implements IOAuthProvider {
  readonly name = 'apple';

  constructor(
    private readonly clientId: string,
    private readonly teamId: string,
    private readonly keyId: string,
    private readonly privateKey: string
  ) {}

  /**
   * 애플 ID Token (JWT) 유효성 검증
   */
  async verifyToken(accessToken: string): Promise<void> {
    try {
      // JWT 디코딩 (서명 검증 없이)
      const decoded = jwt.decode(accessToken, { complete: true });

      if (!decoded || typeof decoded === 'string') {
        throw new UnauthorizedException(
          'Invalid Apple ID token',
          'INVALID_TOKEN'
        );
      }

      const payload = decoded.payload as any;

      // aud (audience) 검증
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

  /**
   * 애플 사용자 정보 조회 (ID Token에서 추출)
   */
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
}
```

**2. 단위 테스트 작성**

```typescript
// tests/unit/auth/providers/apple.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import { AppleProvider } from '../../../src/modules/auth/providers/apple';
import { ExternalApiException, UnauthorizedException } from '../../../src/utils/errors';

vi.mock('jsonwebtoken');
const mockedJwt = vi.mocked(jwt);

describe('AppleProvider', () => {
  let provider: AppleProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new AppleProvider(
      'apple-client-id',
      'apple-team-id',
      'apple-key-id',
      'apple-private-key'
    );
  });

  describe('verifyToken', () => {
    it('should verify token successfully when valid', async () => {
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256', kid: 'key-123' },
        payload: {
          iss: 'https://appleid.apple.com',
          aud: 'apple-client-id',
          exp: Math.floor(Date.now() / 1000) + 3600,
          sub: '001234.abc123',
        },
        signature: 'signature',
      } as any);

      await expect(provider.verifyToken('valid-token')).resolves.not.toThrow();
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      mockedJwt.decode.mockReturnValueOnce(null);

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when audience mismatch', async () => {
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256' },
        payload: {
          aud: 'wrong-client-id',
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
        signature: 'signature',
      } as any);

      await expect(provider.verifyToken('invalid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when token expired', async () => {
      mockedJwt.decode.mockReturnValueOnce({
        header: { alg: 'RS256' },
        payload: {
          aud: 'apple-client-id',
          exp: Math.floor(Date.now() / 1000) - 3600, // 1시간 전 만료
        },
        signature: 'signature',
      } as any);

      await expect(provider.verifyToken('expired-token')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('getUserInfo', () => {
    it('should return normalized user info when valid token', async () => {
      mockedJwt.decode.mockReturnValueOnce({
        sub: '001234.abc123',
        email: 'user@privaterelay.appleid.com',
        email_verified: true,
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '001234.abc123',
        email: 'user@privaterelay.appleid.com',
        nickname: null,
        profileImage: null,
      });
    });

    it('should handle missing email as null', async () => {
      mockedJwt.decode.mockReturnValueOnce({
        sub: '001234.abc123',
      });

      const result = await provider.getUserInfo('valid-token');

      expect(result).toEqual({
        providerId: '001234.abc123',
        email: null,
        nickname: null,
        profileImage: null,
      });
    });

    it('should throw UnauthorizedException when token is invalid', async () => {
      mockedJwt.decode.mockReturnValueOnce(null);

      await expect(provider.getUserInfo('invalid-token')).rejects.toThrow(UnauthorizedException);
    });
  });
});
```

#### 체크리스트
- [ ] `apple.ts` 파일 생성 및 구현
- [ ] `apple.test.ts` 파일 생성 및 테스트 작성
- [ ] 모든 테스트 통과 확인: `pnpm test tests/unit/auth/providers/apple.test.ts`

---

## Phase 2: 순차 통합 작업 (1명 단독 작업)

Phase 1 완료 후, 1명이 다음 순서로 통합 작업을 수행합니다.

### 작업 1: providers/index.ts 수정

**파일**: `src/modules/auth/providers/index.ts`

#### 1.1 import 추가

```typescript
import { NaverProvider } from './naver';
import { GoogleProvider } from './google';
import { AppleProvider } from './apple';
```

#### 1.2 ProviderCredentials 확장

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

#### 1.3 createOAuthProvider() 확장

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

#### 체크리스트
- [ ] import 추가
- [ ] ProviderCredentials 확장
- [ ] createOAuthProvider() 확장

---

### 작업 2: handlers.ts 수정

**파일**: `src/modules/auth/handlers.ts`

#### 크레덴셜 추출 로직 확장 (라인 46-56)

기존 코드를 다음과 같이 수정:

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

#### 체크리스트
- [ ] oauthLogin 핸들러 크레덴셜 추출 로직 확장

---

### 작업 3: validators.ts 수정 (선택)

**파일**: `src/modules/auth/validators.ts`

#### provider enum 확장

```typescript
export const oauthLoginSchema = z.object({
  code: z.string().min(1),
  provider: z.enum(['kakao', 'naver', 'google', 'apple']),
  accessToken: z.string().min(1),
});
```

#### 체크리스트
- [ ] oauthLoginSchema provider enum 확장

---

### 작업 4: 통합 테스트 추가 (선택)

**파일**: `tests/unit/auth/handlers.test.ts`

네이버, 구글, 애플 로그인 성공 케이스를 추가:

```typescript
describe('oauthLogin - Naver', () => {
  it('should return access token and user on successful naver login', async () => {
    // Mock 설정 및 테스트 로직
  });
});

describe('oauthLogin - Google', () => {
  it('should return access token and user on successful google login', async () => {
    // Mock 설정 및 테스트 로직
  });
});

describe('oauthLogin - Apple', () => {
  it('should return access token and user on successful apple login', async () => {
    // Mock 설정 및 테스트 로직
  });
});
```

#### 체크리스트
- [ ] 네이버 로그인 통합 테스트 추가
- [ ] 구글 로그인 통합 테스트 추가
- [ ] 애플 로그인 통합 테스트 추가

---

## 전체 체크리스트

### Phase 1 (병렬)
- [ ] 작업자 A: `naver.ts` + `naver.test.ts` 완료
- [ ] 작업자 B: `google.ts` + `google.test.ts` 완료
- [ ] 작업자 C: `apple.ts` + `apple.test.ts` 완료
- [ ] Phase 1 테스트 통과 확인

### Phase 2 (순차)
- [ ] `providers/index.ts`: import 추가
- [ ] `providers/index.ts`: ProviderCredentials 확장
- [ ] `providers/index.ts`: createOAuthProvider() 확장
- [ ] `handlers.ts`: oauthLogin 크레덴셜 추출 로직 확장
- [ ] `validators.ts`: provider enum 확장 (선택)
- [ ] `handlers.test.ts`: 통합 테스트 추가 (선택)
- [ ] Phase 2 테스트 통과 확인

---

## 검증 계획

### 단위 테스트
```bash
# 각 Provider 테스트
pnpm test tests/unit/auth/providers/naver.test.ts
pnpm test tests/unit/auth/providers/google.test.ts
pnpm test tests/unit/auth/providers/apple.test.ts

# 핸들러 테스트
pnpm test tests/unit/auth/handlers.test.ts

# 전체 테스트
pnpm test
```

### 수동 통합 테스트

**네이버 로그인**:
```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "wowa",
    "provider": "naver",
    "accessToken": "<네이버 액세스 토큰>"
  }'
```

**구글 로그인**:
```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "wowa",
    "provider": "google",
    "accessToken": "<구글 액세스 토큰>"
  }'
```

**애플 로그인**:
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

## 예상 소요 시간

- **Phase 1 (병렬)**: 1-2일 (3명 동시 작업)
- **Phase 2 (순차)**: 0.5일 (1명 통합 작업)
- **총 예상 시간**: 2-3일

**순차 작업 대비 시간 절감**: 70% (순차 3주 → 병렬 2-3일)

---

## Senior Developer 작업 항목

Phase 1과 Phase 2 모두 Senior Developer 수준의 작업입니다.

**Phase 1**:
- Provider 클래스 구현 (인터페이스 준수, 에러 처리)
- 단위 테스트 작성 (TDD 원칙)

**Phase 2**:
- Factory 패턴 통합
- 핸들러 로직 확장
- 통합 테스트

---

## Junior Developer 작업 항목

이 작업에는 Junior Developer 작업이 별도로 없습니다. (라우터는 이미 존재)

---

## 참고 사항

- **Git 충돌**: Phase 1에서는 독립 파일만 작성하므로 충돌 없음
- **카카오 참고**: `src/modules/auth/providers/kakao.ts` 및 `tests/unit/auth/providers/kakao.test.ts` 참고
- **CLAUDE.md 준수**: 예외 처리, API Response, 로깅, JSDoc 모두 준수
