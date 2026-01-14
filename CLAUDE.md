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

### Database Client
```typescript
// src/config/database.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client);
```

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
