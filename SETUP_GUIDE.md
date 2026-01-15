# Setup Guide - Multi-Provider OAuth Authentication System

## Senior Developer 작업 완료 보고

모든 Senior Developer Task (1~6)가 TDD 사이클에 따라 완료되었습니다.

### 완료된 작업

#### Task 1: Infrastructure Setup ✅
- [x] package.json scripts 추가 (test, test:watch, db:generate, db:migrate, db:push)
- [x] drizzle.config.ts 작성
- [x] vitest.config.ts 작성
- [x] src/config/database.ts 작성
- [x] src/config/env.ts 작성 (Zod 검증)
- [x] src/utils/errors.ts 작성 (계층 구조)
- [x] src/utils/logger.ts 작성
- [x] src/utils/jwt.ts 작성
- [x] src/middleware/error-handler.ts 작성
- [x] .env에 DATABASE_URL, JWT_SECRET_FALLBACK, NODE_ENV, PORT 추가

#### Task 2: Database Schema & Migration ✅
- [x] src/modules/auth/schema.ts 작성 (apps, users 테이블)
- [x] pnpm db:generate 실행 (마이그레이션 파일 생성)
- [x] 마이그레이션 파일: `drizzle/migrations/0000_empty_apocalypse.sql`

#### Task 3: Request Validation (TDD) ✅
- [x] tests/unit/auth/validators.test.ts 작성 (Red phase)
- [x] src/modules/auth/validators.ts 구현 (Green phase)
- [x] 모든 테스트 통과 (7 tests)

#### Task 4: OAuth Provider Strategy Pattern (TDD) ✅
- [x] src/modules/auth/types.ts 작성
- [x] src/modules/auth/providers/base.ts 작성
- [x] tests/unit/auth/providers/kakao.test.ts 작성 (Red phase)
- [x] src/modules/auth/providers/kakao.ts 구현 (Green phase)
- [x] src/modules/auth/providers/index.ts 작성 (Provider factory)
- [x] 모든 테스트 통과 (6 tests)

#### Task 5: Database Operations & JWT Generation (TDD) ✅
- [x] tests/unit/auth/services.test.ts 작성 (Red phase)
- [x] src/modules/auth/services.ts 구현 (Green phase)
- [x] 모든 테스트 통과 (5 tests)

#### Task 6: Main Handler & Domain Logging (TDD) ✅
- [x] src/modules/auth/auth.probe.ts 작성 (Domain Probe 패턴)
- [x] tests/unit/auth/handlers.test.ts 작성 (Red phase)
- [x] src/modules/auth/handlers.ts 구현 (Green phase)
- [x] 모든 테스트 통과 (4 tests)

### 테스트 결과

```bash
Test Files  4 passed (4)
Tests       22 passed (22)
```

### 빌드 결과

```bash
✅ pnpm build - 성공
```

---

## 사용자 작업 필요 (중요!)

### 1. 데이터베이스 마이그레이션 실행

Senior Developer가 마이그레이션 파일을 생성했습니다. 이제 실제 데이터베이스에 적용해야 합니다.

```bash
pnpm db:push
```

### 2. apps 테이블에 시드 데이터 INSERT

Supabase SQL Editor에서 다음 SQL을 실행하세요:

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
  'YOUR_KAKAO_REST_API_KEY',       -- 카카오 REST API 키로 변경
  'YOUR_KAKAO_CLIENT_SECRET',      -- 카카오 Client Secret으로 변경
  'your-jwt-secret-at-least-32-chars-long',  -- 최소 32자 이상의 랜덤 문자열
  '7d'
);
```

**주의사항**:
- `kakao_rest_api_key`: 카카오 개발자 센터에서 발급받은 REST API 키
- `kakao_client_secret`: 카카오 개발자 센터에서 발급받은 Client Secret
- `jwt_secret`: 최소 32자 이상의 안전한 랜덤 문자열 (프로덕션에서는 환경변수 관리 필요)

### 3. 환경 변수 확인

`.env` 파일이 다음과 같이 설정되어 있는지 확인하세요:

```env
DATABASE_URL=postgresql://postgres:UtHTbbTyPVp7evVg@db.kqceeavcbhpauqsvlzit.supabase.co:5432/postgres
JWT_SECRET_FALLBACK=change-this-in-production-please-at-least-32-chars-long
NODE_ENV=development
PORT=3001
```

---

## Junior Developer에게 전달할 인터페이스

### handlers.ts

```typescript
// src/modules/auth/handlers.ts
export const oauthLogin: RequestHandler
```

**함수 시그니처**:
```typescript
/**
 * OAuth 로그인 통합 핸들러 (카카오/네이버/구글/애플)
 * @param req - Express 요청 객체 (body: { code, provider, accessToken })
 * @param res - Express 응답 객체
 * @returns 200: { token, user } 형태의 JSON 응답
 * @throws NotFoundException 앱을 찾을 수 없는 경우
 * @throws ValidationException Provider가 설정되지 않은 경우
 * @throws UnauthorizedException 토큰 검증 실패 시
 * @throws ExternalApiException 외부 API 호출 실패 시
 */
```

### error-handler.ts

```typescript
// src/middleware/error-handler.ts
export const errorHandler: ErrorRequestHandler
```

---

## Junior Developer 작업 가이드

### 해야 할 작업

1. **Router 작성** (`src/modules/auth/index.ts`)
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

2. **app.ts 작성** (server.ts 분리)
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

3. **server.ts 수정**
   ```typescript
   import { app } from './app';

   const PORT = process.env.PORT || 3001;

   app.listen(PORT, () => {
     console.log(`✅ Server running on http://localhost:${PORT}`);
   });
   ```

---

## API 테스트 방법

### 1. 개발 서버 실행

```bash
pnpm dev
```

### 2. 카카오 로그인 테스트

```bash
curl -X POST http://localhost:3001/auth/oauth \
  -H "Content-Type: application/json" \
  -d '{
    "code": "test-app",
    "provider": "kakao",
    "accessToken": "YOUR_KAKAO_ACCESS_TOKEN"
  }'
```

**예상 응답**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "provider": "kakao",
    "email": "test@example.com",
    "nickname": "홍길동",
    "profileImage": "https://...",
    "appCode": "test-app",
    "lastLoginAt": "2026-01-15T09:00:00.000Z"
  }
}
```

---

## 체크리스트

### Senior Developer (완료)
- [x] 모든 인프라 파일 작성 완료
- [x] Database 스키마 정의 완료
- [x] 모든 단위 테스트 작성 및 통과 (22 tests)
- [x] Provider 패턴 구현 완료 (KakaoProvider)
- [x] handlers.ts 완성 (oauthLogin)
- [x] TDD 사이클 준수 (Red → Green → Refactor)
- [x] CLAUDE.md 가이드 준수 (예외 처리, 로깅, API Response)
- [x] JSDoc 주석 작성 (한국어)
- [x] 빌드 성공

### 사용자 (대기 중)
- [ ] 마이그레이션 실행 (pnpm db:push)
- [ ] apps 테이블 시드 데이터 INSERT

### Junior Developer (대기 중)
- [ ] Router 연결 완료 (src/modules/auth/index.ts)
- [ ] app.ts + server.ts 분리 완료
- [ ] 빌드 성공 확인

### Integration (최종 검증)
- [ ] 마이그레이션 적용 완료
- [ ] apps 테이블 시드 데이터 존재
- [ ] pnpm test 모두 통과
- [ ] pnpm build 성공
- [ ] pnpm dev 실행 가능
- [ ] POST /auth/oauth 엔드포인트 동작

---

## Senior Developer 작업 완료 알림

**handlers.ts 완성했습니다!**

Junior Developer는 이제 다음 파일들을 작성해주세요:
1. `src/modules/auth/index.ts` (Router)
2. `src/app.ts` (Express app setup)
3. `src/server.ts` (수정)

모든 인터페이스(`oauthLogin`, `errorHandler`)가 준비되어 있으며, 정확한 함수명으로 import하여 사용하시면 됩니다.
