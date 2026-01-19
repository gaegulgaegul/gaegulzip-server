# 사용자 스토리: 다중 OAuth Provider 지원

## 개요

**As a** 개발 팀
**I want to** 네이버, 구글, 애플 OAuth 로그인 Provider를 병렬로 구현
**So that** 개발 속도를 70% 단축하고 (순차 3주 → 병렬 2-3일) 다중 소셜 로그인을 제공할 수 있다

## 배경

현재 시스템은 카카오 OAuth만 지원하고 있으며, Provider 패턴 기반으로 설계되어 있어 새로운 OAuth Provider 추가가 용이한 구조입니다. 사용자 확대와 비즈니스 요구사항에 따라 네이버, 구글, 애플 로그인을 추가로 지원해야 합니다.

## 기능 명세

### 1. 네이버 OAuth 로그인

**Provider 정보**:
- Provider ID: `naver`
- API 문서: https://developers.naver.com/docs/login/api/api.md

**API 엔드포인트**:
- Token 검증 & 사용자 정보: `GET https://openapi.naver.com/v1/nid/me`
  - 헤더: `Authorization: Bearer {access_token}`

**응답 필드 매핑**:
```json
{
  "response": {
    "id": "12345678",
    "email": "user@example.com",
    "nickname": "홍길동",
    "profile_image": "https://example.com/image.jpg"
  }
}
```
- `response.id` → `providerId`
- `response.email` → `email`
- `response.nickname` → `nickname`
- `response.profile_image` → `profileImage`

**크레덴셜**:
- Client ID (`naverClientId`)
- Client Secret (`naverClientSecret`)

---

### 2. 구글 OAuth 로그인

**Provider 정보**:
- Provider ID: `google`
- API 문서: https://developers.google.com/identity/protocols/oauth2

**API 엔드포인트**:
- Token 검증: `GET https://www.googleapis.com/oauth2/v1/tokeninfo?access_token={token}`
- 사용자 정보: `GET https://www.googleapis.com/oauth2/v2/userinfo`
  - 헤더: `Authorization: Bearer {access_token}`

**응답 필드 매핑**:
```json
{
  "id": "1234567890",
  "email": "user@gmail.com",
  "name": "홍길동",
  "picture": "https://example.com/photo.jpg"
}
```
- `id` → `providerId`
- `email` → `email`
- `name` → `nickname`
- `picture` → `profileImage`

**크레덴셜**:
- Client ID (`googleClientId`)
- Client Secret (`googleClientSecret`)

---

### 3. 애플 OAuth 로그인

**Provider 정보**:
- Provider ID: `apple`
- API 문서: https://developer.apple.com/documentation/sign_in_with_apple

**인증 방식**:
- JWT 기반 ID Token 검증
- Apple 공개키를 사용하여 서명 검증

**ID Token Payload 매핑**:
```json
{
  "sub": "001234.abc123...",
  "email": "user@privaterelay.appleid.com",
  "email_verified": true
}
```
- `sub` → `providerId`
- `email` → `email`
- 이름: 최초 로그인 시에만 제공 (이후 null) → `nickname`
- 프로필 이미지: 미제공 → `profileImage` (null)

**크레덴셜**:
- Client ID (`appleClientId`)
- Team ID (`appleTeamId`)
- Key ID (`appleKeyId`)
- Private Key (`applePrivateKey`)

---

## API 명세

### POST /auth/oauth

**기존 동작 유지**, provider 파라미터만 확장

**요청 Body**:
```json
{
  "code": "wowa",
  "provider": "naver | google | apple",  // 확장
  "accessToken": "네이버/구글/애플 액세스 토큰"
}
```

**응답 (200 OK)**:
```json
{
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",
  "tokenType": "Bearer",
  "expiresIn": 1800,
  "user": {
    "id": 1,
    "provider": "naver",
    "email": "user@example.com",
    "nickname": "홍길동",
    "profileImage": "https://example.com/image.jpg",
    "appCode": "wowa",
    "lastLoginAt": "2026-01-18T12:00:00Z"
  },
  "token": "eyJhbGc..."  // Deprecated
}
```

**오류 응답**:
- `400`: Provider가 설정되지 않음 (`VALIDATION_ERROR`)
- `401`: Token 검증 실패 (`INVALID_TOKEN`)
- `404`: 앱을 찾을 수 없음 (`NOT_FOUND`)
- `502`: 외부 API 호출 실패 (`EXTERNAL_API_ERROR`)

---

## 수락 기준

### 기능 요구사항
- [ ] 네이버, 구글, 애플 Provider가 `IOAuthProvider` 인터페이스를 구현
- [ ] 각 Provider가 `verifyToken()` 및 `getUserInfo()` 메서드 제공
- [ ] 정규화된 `OAuthUserInfo` 형식으로 사용자 정보 반환
- [ ] 외부 API 오류를 `ExternalApiException`으로 래핑
- [ ] 기존 카카오 Provider와 동일한 패턴 준수

### 통합 요구사항
- [ ] `providers/index.ts`의 Factory 함수에 3개 Provider 추가
- [ ] `ProviderCredentials` 인터페이스에 크레덴셜 타입 정의
- [ ] `handlers.ts`의 `oauthLogin` 핸들러에서 크레덴셜 추출 로직 추가
- [ ] `apps` 테이블에서 기존 예비 컬럼 활용 (마이그레이션 불필요)

### 품질 요구사항
- [ ] 각 Provider별 단위 테스트 (성공, 실패, 엣지 케이스)
- [ ] 카카오 테스트와 동일한 수준의 커버리지
- [ ] 모든 테스트 통과

### 비기능 요구사항
- [ ] 병렬 개발로 2-3일 내 완료 (순차 대비 70% 시간 단축)
- [ ] Git 충돌 없이 작업 진행 (Phase 1 병렬, Phase 2 순차)
- [ ] 기존 카카오 로그인 기능에 영향 없음

---

## 비즈니스 가치

1. **사용자 확대**: 네이버(한국 중장년층), 구글(글로벌), 애플(iOS 필수)
2. **개발 속도**: 병렬 작업으로 70% 시간 단축
3. **확장성**: Provider 패턴으로 향후 추가 Provider 대응 용이
4. **앱스토어 정책 준수**: 애플 로그인은 다른 소셜 로그인 제공 시 필수

---

## 우선순위

이 작업은 **높음** 우선순위입니다.

**근거**:
- 사용자 확대를 위한 필수 기능
- Provider 패턴 기반으로 병렬 작업 가능 (시간 효율성)
- 앱스토어 정책 준수 (애플 로그인)
