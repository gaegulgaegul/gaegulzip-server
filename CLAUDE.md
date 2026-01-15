# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

gaegulzip-server is a TypeScript/Express backend server with Drizzle ORM and PostgreSQL.

## Commands

```bash
# Install dependencies
pnpm install

# Development (with hot reload)
pnpm dev

# Build for production
pnpm build

# Run production build
pnpm start

# Database migrations
pnpm drizzle-kit generate   # Generate migration files
pnpm drizzle-kit migrate    # Apply migrations
pnpm drizzle-kit push       # Push schema changes (dev only)

# Run tests
pnpm test                   # Run all unit tests
pnpm test:watch             # Watch mode
```

## Tech Stack

- **Runtime**: Node.js with TypeScript (ES2022)
- **Framework**: Express 5.x
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL (Supabase)
- **Package Manager**: pnpm
- **Testing**: Vitest (unit tests only)

## Project Structure

```
src/
├── config/                 # Configuration (db, env)
│   └── database.ts
├── modules/                # Feature-based modules
│   └── [feature]/
│       ├── index.ts              # Router export (entry point)
│       ├── handlers.ts           # Request handlers (middleware functions)
│       ├── schema.ts             # Drizzle schema
│       └── middleware.ts         # Feature-specific middleware (optional)
├── middleware/             # Shared Express middleware
│   ├── error-handler.ts
│   └── auth.ts
├── utils/                  # Shared utilities
├── app.ts                  # Express app setup
└── server.ts               # Entry point
tests/
├── unit/                   # Unit tests only
│   └── [feature]/
│       └── handlers.test.ts
drizzle/
└── migrations/             # Generated migration files
drizzle.config.ts           # Drizzle Kit configuration
```

## Environment Variables

Required in `.env`:
- `PORT` - Server port (default: 3001)
- `DATABASE_URL` - PostgreSQL connection string

## Express Conventions

Express는 미들웨어 기반의 미니멀 프레임워크. 아키텍처를 강제하지 않는다.

### Middleware-Centric Approach
- Handler는 곧 미들웨어 함수 `(req, res, next) => {}`
- 비즈니스 로직이 복잡해지면 그때 분리 (YAGNI)
- Controller/Service 패턴은 NestJS 스타일이므로 사용하지 않음

### Feature Module Example
```typescript
// src/modules/user/index.ts
import { Router } from 'express';
import * as handlers from './handlers';

const router = Router();
router.get('/', handlers.list);
router.get('/:id', handlers.getById);
router.post('/', handlers.create);

export default router;
```

```typescript
// src/modules/user/handlers.ts
import { Request, Response } from 'express';
import { db } from '../../config/database';
import { users } from './schema';

export const list = async (req: Request, res: Response) => {
  const result = await db.select().from(users);
  res.json(result);
};
```

### Middleware Order
```typescript
app.use(express.json());
app.use(cors());
app.use(helmet());
// routes
app.use(errorHandler);  // Error handler must be last
```

### Error Handling
- Use express-async-errors or async wrapper for async handlers
- Centralize error handling in a single middleware
- Use custom AppError class for operational errors

**📖 상세 가이드**: [예외 처리 가이드](./.claude/guide/exception-handling.md)

핵심 원칙:
- **특수값 대신 예외 사용**: -1, null 등으로 오류를 표현하지 말 것
- **의미 있는 예외 클래스**: `CustomException` 대신 `UserNotFoundException`, `ValidationException` 등 사용
- **추적 가능한 예외**: 구체적인 값과 작업명을 예외 메시지에 포함
- **계층별 예외 정의**: `AppException` → `BusinessException` → `ValidationException` 등
- **외부 SDK 예외 감싸기**: 외부 라이브러리 예외를 내부 예외로 변환하여 의존성 분리
- **글로벌 핸들러 활용**: 각 핸들러마다 try-catch 하지 말고 전역 에러 핸들러에서 처리

### API Response Design

**📖 상세 가이드**: [API Response 설계 가이드](./.claude/guide/api-response-design.md)

**필드 설계**:
- **최소 스펙**: 현재 필요한 필드만 포함 (추가는 쉽지만 제거는 Breaking Change)
- **빈 배열 활용**: 복수형 필드가 비었을 때 `null` 대신 `[]` 반환
- **Boolean은 2가지 상태**: `true/false`만, `null` 금지 (3가지 상태 필요시 Enum 사용)

**Null 처리** (중요):
- **Pre-condition 검증**: 진입점에서 null 검증하여 비즈니스 로직을 null-free로
- **Null 반환 피하기**: 예외 던지기 또는 Null Object Pattern (빈 배열, 기본값) 사용
- **Non-null 파라미터**: 함수는 가능한 한 null을 받지 않도록 설계
- **Number/Boolean NOT NULL**: DB 스키마에서 항상 기본값 설정 (nullable은 3-state 문제 유발)

**네이밍**:
- **camelCase 사용**: 모든 필드명은 camelCase (snake_case 금지)
- **축약 금지**: `cnt`, `nm` 대신 `count`, `name` 사용
- **타입별 네이밍**: Boolean(`isActive`), 날짜(`createdAt`), 복수형(`orders`)

**데이터 타입**:
- **ISO-8601 날짜**: UNIX timestamp 대신 `"2021-05-28T14:07:17Z"` 형식
- **문자열 Enum**: ordinal(숫자) 대신 `"PENDING"`, `"PAID"` 등 문자열 사용
- **Enum 우선 사용**: 3가지 이상 상태는 Enum (`AccountStatus.ACTIVE` 등)
- **Boolean vs Timestamp**: 쿼리 패턴 고려 (Enum/Boolean이 인덱스 성능 우수)

**일관성**:
- 요청/응답 및 전체 API에서 같은 개념은 같은 이름 사용

## Drizzle ORM Conventions

### Schema Definition
```typescript
// src/modules/user/schema.ts
import { pgTable, serial, varchar, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
});
```

### Database Design Rules
- **테이블 및 컬럼 주석 필수**: 모든 테이블과 컬럼에는 반드시 comment를 추가하여 의미를 명확히 전달
- **FK 사용 금지**: Foreign Key 제약조건을 사용하지 않음 (애플리케이션 레벨에서 관계 관리)

### Database Client
```typescript
// src/config/database.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
```

## Logging Best Practices

**📖 상세 가이드**: [로깅 베스트 프랙티스](./.claude/guide/logging-best-practices.md)

### 로그 레벨 구분
- **DEBUG**: 개발/디버깅 (운영 환경 비활성화)
- **INFO**: 정상 작동 기록 (주요 비즈니스 이벤트, 배치 작업 등)
- **WARN**: 잠재적 문제 (외부 API 실패, 사용자 입력 오류)
- **ERROR**: 즉시 대응 필요 (DB 연결 실패, 결제 오류, 예상치 못한 예외)

### Domain Probe 패턴
- **운영 로그(INFO/WARN/ERROR)**: 별도 Probe 모듈(함수들)로 분리
- **디버그 로그(DEBUG)**: 핸들러 내에서 직접 작성
- Class 대신 함수 기반, 테스트 가능하고 일관된 로그 포맷 유지

```typescript
// Handler: 비즈니스 로직 집중
import * as orderProbe from './order.probe';

export const createOrder = async (req: Request, res: Response) => {
  logger.debug('Creating order', { data: req.body });

  const [order] = await db.insert(orders).values(req.body).returning();

  orderProbe.created(order);  // 운영 로그

  res.status(201).json(order);
};

// order.probe.ts: 운영 로그 담당
export const created = (order: Order) => {
  logger.info('Order created', { orderId: order.id, amount: order.amount });
};
```

### 핵심 원칙
- 외부 API 실패 → WARN (단, 결제 등 중요 API는 ERROR)
- 사용자 입력 오류 → WARN (단, 의심 행동은 ERROR)
- 민감 정보(비밀번호, 토큰) 로깅 금지
- 충분한 컨텍스트 포함 (ID, 상태, 시간 등)

## Code Documentation

모든 코드에 JSDoc 주석을 작성한다.

### Class
```typescript
/**
 * 사용자 인증을 처리하는 클래스
 */
class AuthManager {
  // ...
}
```

### Function/Method
```typescript
/**
 * 이메일로 사용자를 조회한다
 * @param email - 조회할 사용자 이메일
 * @returns 사용자 객체 또는 null
 */
export const findByEmail = async (email: string): Promise<User | null> => {
  // ...
};
```

### Variable/Constant
```typescript
/** 토큰 만료 시간 (초) */
const TOKEN_EXPIRY = 3600;

/** 데이터베이스 연결 클라이언트 */
const client = postgres(process.env.DATABASE_URL!);
```

## Testing Guidelines

- **Unit tests only**: Focus on testing handlers and utilities in isolation
- Mock external dependencies (database, external APIs)
- Test file naming: `[name].test.ts`
- One assertion concept per test
- Use descriptive test names: `should return user when valid id provided`
