# 예외(Exception) 처리 가이드

> 출처: https://jojoldu.tistory.com/734

이 문서는 견고한 프로그램과 좋은 사용자 경험을 제공하기 위한 예외 처리 방식을 다룹니다.

## 목차
- [핵심 원칙](#핵심-원칙)
- [복구 가능성에 따른 분류](#복구-가능성에-따른-분류)
- [좋은 예외 처리 패턴](#좋은-예외-처리-패턴)
- [피해야 할 패턴](#피해야-할-패턴)
- [TypeScript/Express 적용 예시](#typescriptexpress-적용-예시)

## 핵심 원칙

### 1. 특수값 대신 예외 사용

**❌ 나쁜 예시**
```typescript
function divide(a: number, b: number): number {
  if (b === 0) {
    return -1; // 특수값으로 오류 표현
  }
  return a / b;
}
```

**✅ 좋은 예시**
```typescript
function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('0으로 나눌 수 없습니다');
  }
  return a / b;
}
```

**이유**: 예외는 문제의 원인, 메시지, 스택 트레이스를 명확히 제공합니다.

### 2. 문자열 throw 금지

**❌ 나쁜 예시**
```typescript
throw 'error message';
throw { message: 'error' };
```

**✅ 좋은 예시**
```typescript
throw new CustomException('error message');
throw new Error('error message');
```

**이유**: 타입 안정성과 일관된 에러 처리를 위해 Error 객체를 사용해야 합니다.

### 3. 추적 가능한 예외

예외 메시지에는 **구체적인 값과 작업명**을 포함해야 합니다.

**❌ 나쁜 예시**
```typescript
throw new Error('Invalid input');
```

**✅ 좋은 예시**
```typescript
throw new InvalidInputException(
  `사용자 ${userId}의 입력(${inputData})이 잘못되었습니다`
);
```

## 복구 가능성에 따른 분류

### 복구 가능한 오류
- **정의**: 사용자 재시도나 대체 로직으로 해결 가능한 오류
- **예시**: 사용자 오입력, 네트워크 오류, 파일 찾기 실패
- **로그 레벨**: `warn`
- **처리**: 사용자에게 명확한 안내 메시지 제공

```typescript
if (!user) {
  logger.warn(`사용자를 찾을 수 없습니다: ${userId}`);
  throw new UserNotFoundException(`ID ${userId}에 해당하는 사용자를 찾을 수 없습니다`);
}
```

### 복구 불가능한 오류
- **정의**: 시스템 재시작이나 개발자 개입이 필요한 오류
- **예시**: 메모리 부족, 스택오버플로우, DB 연결 실패
- **로그 레벨**: `error`
- **처리**: 즉시 로깅 후 적절한 종료 또는 재시작

```typescript
try {
  await db.connect();
} catch (error) {
  logger.error('데이터베이스 연결 실패', error);
  throw new DatabaseConnectionException('데이터베이스에 연결할 수 없습니다');
}
```

## 좋은 예외 처리 패턴

### 1. 의미 있는 예외명 사용

**❌ 나쁜 예시**
```typescript
class CustomException extends Error {}
class MyError extends Error {}
```

**✅ 좋은 예시**
```typescript
class InvalidCredentialsException extends Error {}
class UserNotFoundException extends Error {}
class DuplicateEmailException extends Error {}
```

### 2. 계층별 예외 정의

```typescript
// 기본 예외 클래스
export class AppException extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

// 계층별 예외
export class DataAccessException extends AppException {
  constructor(message: string) {
    super(message, 500, 'DATA_ACCESS_ERROR');
  }
}

export class BusinessLogicException extends AppException {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode, 'BUSINESS_LOGIC_ERROR');
  }
}

export class ValidationException extends BusinessLogicException {
  constructor(message: string) {
    super(message, 400);
    this.code = 'VALIDATION_ERROR';
  }
}
```

### 3. 외부 SDK 예외 감싸기

외부 라이브러리의 예외를 그대로 노출하지 말고 내부 예외로 감싸서 의존성을 분리합니다.

```typescript
// ❌ 나쁜 예시 - 외부 라이브러리 예외 그대로 노출
import { PostgresError } from 'postgres';

export const createUser = async (email: string) => {
  try {
    return await db.insert(users).values({ email });
  } catch (error) {
    if (error instanceof PostgresError && error.code === '23505') {
      throw error; // 외부 라이브러리 예외 그대로 노출
    }
    throw error;
  }
};

// ✅ 좋은 예시 - 내부 예외로 감싸기
export const createUser = async (email: string) => {
  try {
    return await db.insert(users).values({ email });
  } catch (error) {
    if (error instanceof PostgresError && error.code === '23505') {
      throw new DuplicateEmailException(`이메일 ${email}은 이미 사용 중입니다`);
    }
    throw new DataAccessException('사용자 생성 중 오류가 발생했습니다');
  }
};
```

### 4. 가능한 늦게 처리 (Global Error Handler)

각 핸들러마다 try-catch를 하지 말고, 글로벌 에러 핸들러에서 일관되게 처리합니다.

```typescript
// ❌ 나쁜 예시 - 각 핸들러마다 try-catch
export const getUser = async (req: Request, res: Response) => {
  try {
    const user = await db.select().from(users).where(eq(users.id, req.params.id));
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error' });
  }
};

// ✅ 좋은 예시 - 예외만 throw하고 글로벌 핸들러에서 처리
export const getUser = async (req: Request, res: Response) => {
  const user = await db.select().from(users).where(eq(users.id, req.params.id));
  if (!user) {
    throw new UserNotFoundException(`ID ${req.params.id}에 해당하는 사용자를 찾을 수 없습니다`);
  }
  res.json(user);
};
```

## 피해야 할 패턴

### 1. catch 후 아무것도 하지 않고 재발생

```typescript
// ❌ 나쁜 예시
try {
  await riskyOperation();
} catch (error) {
  throw error; // 아무 가치도 추가하지 않음
}

// ✅ 로깅이나 컨텍스트 추가 없이 재발생한다면 catch 자체를 제거
await riskyOperation();
```

### 2. 정상 흐름 제어용 예외 사용

```typescript
// ❌ 나쁜 예시
try {
  const user = await findUser(id);
  processUser(user);
} catch (UserNotFoundException) {
  createDefaultUser();
}

// ✅ 좋은 예시
const user = await findUser(id);
if (user) {
  processUser(user);
} else {
  createDefaultUser();
}
```

### 3. 과도한 try-catch 중첩

```typescript
// ❌ 나쁜 예시
try {
  try {
    try {
      await operation();
    } catch (error) {
      // ...
    }
  } catch (error) {
    // ...
  }
} catch (error) {
  // ...
}

// ✅ 좋은 예시 - 단일 레벨 처리 또는 글로벌 핸들러 활용
await operation();
```

### 4. 모든 예외를 동일하게 처리

```typescript
// ❌ 나쁜 예시
try {
  await complexOperation();
} catch (error) {
  res.status(500).json({ message: 'Error occurred' });
}

// ✅ 좋은 예시 - 예외 타입별 처리
try {
  await complexOperation();
} catch (error) {
  if (error instanceof ValidationException) {
    res.status(400).json({ message: error.message });
  } else if (error instanceof UserNotFoundException) {
    res.status(404).json({ message: error.message });
  } else {
    res.status(500).json({ message: 'Internal server error' });
  }
}
```

## TypeScript/Express 적용 예시

### 1. 커스텀 예외 클래스 정의

```typescript
// src/utils/exceptions.ts

/**
 * 애플리케이션 기본 예외 클래스
 */
export class AppException extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 비즈니스 로직 예외
 */
export class BusinessException extends AppException {
  constructor(message: string, statusCode: number = 400) {
    super(message, statusCode, 'BUSINESS_ERROR');
  }
}

/**
 * 유효성 검증 예외
 */
export class ValidationException extends BusinessException {
  constructor(message: string) {
    super(message, 400);
    this.code = 'VALIDATION_ERROR';
  }
}

/**
 * 리소스 미발견 예외
 */
export class NotFoundException extends BusinessException {
  constructor(message: string) {
    super(message, 404);
    this.code = 'NOT_FOUND';
  }
}

/**
 * 데이터 접근 예외
 */
export class DataAccessException extends AppException {
  constructor(message: string) {
    super(message, 500, 'DATA_ACCESS_ERROR');
  }
}
```

### 2. Global Error Handler

```typescript
// src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { AppException } from '../utils/exceptions';

/**
 * 전역 에러 핸들러 미들웨어
 */
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // AppException 계층 구조의 예외 처리
  if (error instanceof AppException) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  // 예상치 못한 예외
  console.error('Unexpected error:', error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다',
    },
  });
};
```

### 3. 핸들러에서 활용

```typescript
// src/modules/user/handlers.ts
import { Request, Response } from 'express';
import { db } from '../../config/database';
import { users } from './schema';
import { NotFoundException, ValidationException } from '../../utils/exceptions';
import { eq } from 'drizzle-orm';

/**
 * ID로 사용자 조회
 */
export const getById = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    throw new ValidationException(`유효하지 않은 사용자 ID: ${id}`);
  }

  const [user] = await db.select().from(users).where(eq(users.id, Number(id)));

  if (!user) {
    throw new NotFoundException(`ID ${id}에 해당하는 사용자를 찾을 수 없습니다`);
  }

  res.json(user);
};

/**
 * 사용자 생성
 */
export const create = async (req: Request, res: Response) => {
  const { email } = req.body;

  if (!email || !email.includes('@')) {
    throw new ValidationException('유효한 이메일을 입력해주세요');
  }

  try {
    const [newUser] = await db.insert(users).values({ email }).returning();
    res.status(201).json(newUser);
  } catch (error) {
    // PostgreSQL 고유 제약조건 위반 처리
    if (error.code === '23505') {
      throw new ValidationException(`이메일 ${email}은 이미 사용 중입니다`);
    }
    throw new DataAccessException('사용자 생성 중 오류가 발생했습니다');
  }
};
```

### 4. App 설정에서 에러 핸들러 등록

```typescript
// src/app.ts
import express from 'express';
import 'express-async-errors'; // async 에러 자동 처리
import { errorHandler } from './middleware/error-handler';

const app = express();

app.use(express.json());

// ... routes

// ⚠️ 에러 핸들러는 반드시 마지막에 등록
app.use(errorHandler);

export default app;
```

## 요약

1. **특수값 대신 예외 사용** - 명확한 오류 정보 전달
2. **의미 있는 예외 클래스 정의** - 예외 타입만으로 상황 파악
3. **추적 가능한 예외 메시지** - 구체적인 값과 컨텍스트 포함
4. **계층 구조 활용** - 일관된 예외 처리
5. **외부 의존성 감싸기** - 결합도 낮추기
6. **글로벌 핸들러 활용** - 중복 제거 및 일관성 유지
7. **복구 가능성 구분** - 적절한 로그 레벨 및 처리 전략

이 가이드를 따르면 유지보수하기 쉽고 견고한 예외 처리 시스템을 구축할 수 있습니다.
