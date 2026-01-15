# WOWA API Documentation

**Base URL**: `http://localhost:3001` (개발 환경)

---

## 📋 목차

- [인증 (Authentication)](#인증-authentication)
  - [OAuth 로그인 (토큰 방식)](#oauth-로그인-토큰-방식)
  - [OAuth 로그인 (Authorization Code 방식)](#oauth-로그인-authorization-code-방식)
- [시스템](#시스템)
  - [Health Check](#health-check)
  - [Root](#root)

---

## 인증 (Authentication)

### OAuth 로그인 (토큰 방식)

모바일 앱에서 이미 발급받은 액세스 토큰으로 로그인하는 방식입니다.

**Endpoint**: `POST /auth/oauth`

**Request Headers**:
```
Content-Type: application/json
```

**Request Body**:
```json
{
  "code": "wowa",
  "provider": "kakao",
  "accessToken": "카카오_액세스_토큰"
}
```

**Parameters**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| code | string | ✅ | 앱 식별 코드 (예: "wowa") |
| provider | string | ✅ | OAuth 제공자 ("kakao", "naver", "google", "apple") |
| accessToken | string | ✅ | OAuth 제공자로부터 발급받은 액세스 토큰 |

**Success Response** (200 OK):
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "provider": "kakao",
    "email": "user@example.com",
    "nickname": "홍길동",
    "profileImage": "https://k.kakaocdn.net/...",
    "appCode": "wowa",
    "lastLoginAt": "2026-01-15T10:30:00.000Z"
  }
}
```

**Error Responses**:

**400 Bad Request** - 잘못된 요청
```json
{
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "details": [
      {
        "code": "invalid_enum_value",
        "message": "Invalid provider. Must be one of: kakao, naver, google, apple",
        "path": ["provider"]
      }
    ]
  }
}
```

**404 Not Found** - 앱을 찾을 수 없음
```json
{
  "error": {
    "message": "App not found: invalid-code",
    "code": "NOT_FOUND"
  }
}
```

**401 Unauthorized** - 토큰 검증 실패
```json
{
  "error": {
    "message": "Invalid access token",
    "code": "INVALID_TOKEN"
  }
}
```

**502 Bad Gateway** - 외부 API 에러
```json
{
  "error": {
    "message": "External API error from kakao: Request failed with status code 401",
    "code": "EXTERNAL_API_ERROR"
  }
}
```

**cURL 예제**:
```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "wowa",
    "provider": "kakao",
    "accessToken": "YOUR_KAKAO_ACCESS_TOKEN"
  }'
```

---

### OAuth 로그인 (Authorization Code 방식)

웹 브라우저를 통한 OAuth 로그인 플로우입니다.

**Step 1: 인가 URL로 리다이렉트**

사용자를 다음 URL로 리다이렉트합니다:

```
https://kauth.kakao.com/oauth/authorize?client_id=bba5e37e4e979132f70af2b6c7b0ab23&redirect_uri=http://localhost:3001/auth/oauth/callback&response_type=code&state=wowa
```

**Parameters**:
| 파라미터 | 값 | 설명 |
|----------|-----|------|
| client_id | bba5e37e4e979132f70af2b6c7b0ab23 | 카카오 REST API Key |
| redirect_uri | http://localhost:3001/auth/oauth/callback | 콜백 URL |
| response_type | code | Authorization Code 방식 |
| state | wowa | 앱 코드 |

**Step 2: 콜백 처리**

**Endpoint**: `GET /auth/oauth/callback`

**Query Parameters**:
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| code | string | ✅ | 카카오로부터 받은 인가 코드 |
| state | string | ⚠️ | 앱 코드 (기본값: "wowa") |

**Success Response** (200 OK):

HTML 페이지로 다음 정보를 표시합니다:
- ✅ 로그인 성공 메시지
- 사용자 정보 (ID, Email, Nickname, Provider)
- JWT Token
- Kakao Access Token
- API 테스트용 curl 명령어

**브라우저 예제**:
```
1. 브라우저에서 다음 URL 접속:
https://kauth.kakao.com/oauth/authorize?client_id=bba5e37e4e979132f70af2b6c7b0ab23&redirect_uri=http://localhost:3001/auth/oauth/callback&response_type=code&state=wowa

2. 카카오 로그인 페이지에서 로그인

3. 자동으로 http://localhost:3001/auth/oauth/callback?code=xxx&state=wowa 로 리다이렉트

4. 로그인 결과 페이지 표시
```

---

## 시스템

### Health Check

서버 상태를 확인합니다.

**Endpoint**: `GET /health`

**Success Response** (200 OK):
```json
{
  "status": "OK",
  "uptime": 123.456
}
```

**cURL 예제**:
```bash
curl http://localhost:3001/health
```

---

### Root

API 기본 정보를 반환합니다.

**Endpoint**: `GET /`

**Success Response** (200 OK):
```json
{
  "message": "gaegulzip-server API",
  "version": "1.0.0"
}
```

**cURL 예제**:
```bash
curl http://localhost:3001/
```

---

## 🔐 인증 (JWT)

로그인 성공 시 받은 JWT 토큰은 다음과 같이 사용합니다:

**Request Headers**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**JWT Payload**:
```json
{
  "sub": 1,                    // users.id (JWT 표준)
  "appId": 1,                  // apps.id
  "email": "user@example.com", // 사용자 이메일
  "nickname": "홍길동",         // 사용자 닉네임
  "iat": 1705308000,          // 발급 시간 (timestamp)
  "exp": 1705912800           // 만료 시간 (timestamp)
}
```

---

## 📱 모바일 앱 통합 가이드

### iOS (Swift)

```swift
import KakaoSDKAuth
import KakaoSDKUser

// 1. 카카오 SDK로 로그인
UserApi.shared.loginWithKakaoAccount { (oauthToken, error) in
    if let token = oauthToken?.accessToken {
        // 2. 서버에 토큰 전송
        self.loginToWOWAServer(accessToken: token)
    }
}

func loginToWOWAServer(accessToken: String) {
    let url = URL(string: "http://localhost:3001/auth/oauth")!
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")

    let body: [String: Any] = [
        "code": "wowa",
        "provider": "kakao",
        "accessToken": accessToken
    ]

    request.httpBody = try? JSONSerialization.data(withJSONObject: body)

    URLSession.shared.dataTask(with: request) { data, response, error in
        // 3. JWT 토큰 받아서 저장
        if let data = data {
            let decoder = JSONDecoder()
            if let loginResponse = try? decoder.decode(LoginResponse.self, from: data) {
                // loginResponse.token 저장
                print("JWT Token: \(loginResponse.token)")
            }
        }
    }.resume()
}
```

### Android (Kotlin)

```kotlin
import com.kakao.sdk.user.UserApiClient

// 1. 카카오 SDK로 로그인
UserApiClient.instance.loginWithKakaoAccount(context) { token, error ->
    token?.let {
        // 2. 서버에 토큰 전송
        loginToWOWAServer(it.accessToken)
    }
}

fun loginToWOWAServer(accessToken: String) {
    val client = OkHttpClient()
    val json = JSONObject().apply {
        put("code", "wowa")
        put("provider", "kakao")
        put("accessToken", accessToken)
    }

    val request = Request.Builder()
        .url("http://localhost:3001/auth/oauth")
        .post(json.toString().toRequestBody("application/json".toMediaType()))
        .build()

    client.newCall(request).enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) {
            // 3. JWT 토큰 받아서 저장
            val body = response.body?.string()
            // body에서 token 파싱하여 저장
            println("JWT Token: $body")
        }
    })
}
```

---

## 🚀 개발 환경 설정

### 1. 서버 실행

```bash
# 개발 모드 (hot reload)
pnpm dev

# 프로덕션 빌드
pnpm build
pnpm start
```

### 2. 카카오 개발자 콘솔 설정

1. https://developers.kakao.com/console
2. **WOWA 앱** 선택
3. **제품 설정** → **카카오 로그인**
4. **Redirect URI** 등록:
   - 개발: `http://localhost:3001/auth/oauth/callback`
   - 프로덕션: `https://api.wowa.com/auth/oauth/callback`

### 3. 환경 변수 (.env)

```env
DATABASE_URL=postgresql://...
JWT_SECRET_FALLBACK=your-jwt-secret-at-least-32-chars-long
NODE_ENV=development
PORT=3001
```

---

## 📊 데이터베이스 스키마

### apps 테이블

멀티 OAuth 제공자 크레덴셜 관리

```sql
CREATE TABLE apps (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,           -- 앱 식별 코드
  name VARCHAR(255) NOT NULL,                 -- 앱 이름

  kakao_rest_api_key VARCHAR(255),            -- 카카오 REST API 키
  kakao_client_secret VARCHAR(255),           -- 카카오 클라이언트 시크릿

  naver_client_id VARCHAR(255),               -- 네이버 클라이언트 ID
  naver_client_secret VARCHAR(255),           -- 네이버 클라이언트 시크릿

  google_client_id VARCHAR(255),              -- 구글 클라이언트 ID
  google_client_secret VARCHAR(255),          -- 구글 클라이언트 시크릿

  apple_client_id VARCHAR(255),               -- 애플 클라이언트 ID
  apple_team_id VARCHAR(255),                 -- 애플 팀 ID
  apple_key_id VARCHAR(255),                  -- 애플 키 ID
  apple_private_key TEXT,                     -- 애플 Private Key

  jwt_secret VARCHAR(255) NOT NULL,           -- JWT 시크릿
  jwt_expires_in VARCHAR(20) DEFAULT '7d',    -- JWT 만료 시간
  is_active BOOLEAN DEFAULT true,             -- 활성화 여부
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### users 테이블

멀티 제공자 사용자 통합 관리

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  app_id INTEGER NOT NULL,                    -- 소속 앱 ID

  provider VARCHAR(20) NOT NULL,              -- OAuth 제공자
  provider_id VARCHAR(100) NOT NULL,          -- 제공자별 사용자 ID

  email VARCHAR(255),                         -- 이메일
  nickname VARCHAR(255),                      -- 닉네임
  profile_image VARCHAR(500),                 -- 프로필 이미지 URL

  app_metadata JSONB DEFAULT '{}',            -- 앱별 추가 정보
  last_login_at TIMESTAMP,                    -- 마지막 로그인
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(app_id, provider, provider_id)       -- 중복 방지
);
```

---

## ⚠️ 주의사항

### 보안

- **프로덕션 환경**에서는 반드시 HTTPS 사용
- JWT Secret은 최소 32자 이상의 강력한 랜덤 문자열 사용
- 카카오 Client Secret은 절대 클라이언트에 노출하지 않음

### 에러 처리

- 모든 API는 일관된 에러 형식 반환:
  ```json
  {
    "error": {
      "message": "에러 메시지",
      "code": "ERROR_CODE"
    }
  }
  ```

### Rate Limiting

- 현재 Rate Limiting 미구현
- 프로덕션 배포 전 추가 권장

---

## 📞 문의

- **이슈 등록**: GitHub Issues
- **개발 문서**: [CLAUDE.md](./CLAUDE.md)
- **설정 가이드**: [SETUP_GUIDE.md](./SETUP_GUIDE.md)
