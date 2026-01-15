# API Response Body 설계 가이드

> 출처:
> - https://jojoldu.tistory.com/720 (API Response Body)
> - https://jojoldu.tistory.com/721 (Null 처리)
> - https://jojoldu.tistory.com/718 (Number/Boolean NOT NULL)
> - https://jojoldu.tistory.com/577 (Boolean vs Timestamp vs Enum)

이 문서는 개발자 경험을 중심으로 직관적이고 예측 가능한 API 응답을 설계하는 방법을 다룹니다.

## 목차
- [핵심 원칙](#핵심-원칙)
- [필드 설계 가이드](#필드-설계-가이드)
- [Null 처리 전략](#null-처리-전략)
- [네이밍 규칙](#네이밍-규칙)
- [데이터 타입과 포맷](#데이터-타입과-포맷)
- [일관성 유지](#일관성-유지)
- [TypeScript 적용 예시](#typescript-적용-예시)

## 핵심 원칙

### API는 사용자 인터페이스

API는 클라이언트 개발자가 사용하는 인터페이스입니다. 설계 시 **사용하는 쪽의 편의성**을 최우선으로 고려해야 합니다.

**좋은 API의 특징**
- 직관적: 문서를 보지 않아도 이해 가능
- 예측 가능: 일관된 패턴 사용
- 자명한: 타입과 이름만으로 의도 파악 가능

## 필드 설계 가이드

### 1. 최소 스펙 유지

**원칙**: 현재 필요한 필드만 포함하세요.

**이유**:
- 새 필드 추가는 쉽지만, 기존 필드 제거는 **Breaking Change**
- 불필요한 필드는 클라이언트 개발자를 혼란스럽게 만듦
- 확실하지 않은 필드는 추후 추가하는 것이 안전

**❌ 나쁜 예시**
```typescript
// "나중에 쓸 것 같아서" 미리 추가
interface UserResponse {
  id: number;
  email: string;
  nickname?: string;        // 현재 미사용
  profileUrl?: string;      // 현재 미사용
  preferredLanguage?: string; // 현재 미사용
  timezone?: string;        // 현재 미사용
}
```

**✅ 좋은 예시**
```typescript
// 현재 필요한 필드만
interface UserResponse {
  id: number;
  email: string;
}

// 나중에 필요할 때 추가
interface UserResponse {
  id: number;
  email: string;
  nickname: string;  // 실제 사용 시점에 추가
}
```

### 2. 빈 배열 활용 (Null Object Pattern)

**원칙**: 복수형 필드가 비었을 때 `null` 대신 `[]` 반환

**❌ 나쁜 예시**
```typescript
interface UserResponse {
  id: number;
  email: string;
  orders: Order[] | null;  // null 가능
}

// 클라이언트에서 매번 null 체크 필요
const orders = response.orders ?? [];
orders.forEach(order => {
  // ...
});
```

**✅ 좋은 예시**
```typescript
interface UserResponse {
  id: number;
  email: string;
  orders: Order[];  // 항상 배열, 빈 배열 가능
}

// 클라이언트에서 바로 사용 가능
response.orders.forEach(order => {
  // ...
});
```

### 3. Boolean 필드에 null 금지

**원칙**: Boolean은 `true/false` 두 가지 상태만 가져야 합니다.

**❌ 나쁜 예시**
```typescript
interface UserResponse {
  id: number;
  email: string;
  isActive: boolean | null;  // 세 가지 상태 (true, false, null)
}
```

**✅ 좋은 예시 - 두 가지 상태**
```typescript
interface UserResponse {
  id: number;
  email: string;
  isActive: boolean;  // true 또는 false만
}
```

**✅ 좋은 예시 - 세 가지 상태 필요 시 Enum 사용**
```typescript
enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  UNKNOWN = 'UNKNOWN'
}

interface UserResponse {
  id: number;
  email: string;
  status: UserStatus;  // 명시적인 세 가지 상태
}
```

## Null 처리 전략

> "1000+ JS projects where null/undefined errors dominated the top 10 defects" - Rollbar 분석

Null 처리는 안정적인 API 설계의 핵심입니다. Null safe 문법(`?.`, `??`)은 에러를 방지하지만 근본 원인을 해결하지는 못합니다.

### 1. Pre-Condition 검증

**원칙**: 함수 진입점에서 null 검증을 수행하여 비즈니스 로직을 null-free로 만듭니다.

**검증 방법**:
- 명시적 `if` 문
- 유효성 검증 라이브러리 (class-validator)
- Decorator 기반 검증 (@IsNotEmpty)

**❌ 나쁜 예시**
```typescript
export const getUser = async (req: Request, res: Response) => {
  const user = await db.select().from(users).where(eq(users.id, req.params.id));

  // 비즈니스 로직 곳곳에서 null 체크
  if (user) {
    const email = user.email ?? 'unknown';
    const name = user.name ?? 'Anonymous';
    // ...
  }
};
```

**✅ 좋은 예시**
```typescript
export const getUser = async (req: Request, res: Response) => {
  const { id } = req.params;

  // Pre-condition: 진입점에서 검증
  if (!id || isNaN(Number(id))) {
    throw new ValidationException('Invalid user ID');
  }

  const [user] = await db.select().from(users).where(eq(users.id, Number(id)));

  if (!user) {
    throw new NotFoundException(`User ${id} not found`);
  }

  // 이후 비즈니스 로직은 null-free
  const response: UserResponse = {
    id: user.id,
    email: user.email,        // null 체크 불필요
    userName: user.userName,  // null 체크 불필요
    // ...
  };

  res.json(response);
};
```

### 2. Null 반환 피하기

**원칙**: 함수는 가능한 한 null을 반환하지 않습니다.

#### 방법 1: 예외 던지기

작업을 계속할 수 없는 경우 null 대신 예외를 던집니다.

**❌ 나쁜 예시**
```typescript
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  return user || null;  // null 반환
};

// 호출하는 곳마다 null 체크 필요
const user = await findUserByEmail(email);
if (!user) {
  throw new NotFoundException('User not found');
}
```

**✅ 좋은 예시**
```typescript
export const findUserByEmail = async (email: string): Promise<User> => {
  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user) {
    throw new NotFoundException(`User with email ${email} not found`);
  }

  return user;  // 항상 User 반환 (null 없음)
};

// 호출하는 곳에서 null 체크 불필요
const user = await findUserByEmail(email);
// user는 항상 존재
```

#### 방법 2: Null Object Pattern

유효한 기본값을 반환합니다.

**✅ 좋은 예시 - 배열**
```typescript
export const getUserOrders = async (userId: number): Promise<Order[]> => {
  const orders = await db.select().from(orders).where(eq(orders.userId, userId));
  return orders || [];  // null 대신 빈 배열
};

// 호출하는 곳에서 바로 사용 가능
const orders = await getUserOrders(userId);
orders.forEach(order => {  // null 체크 불필요
  // ...
});
```

**✅ 좋은 예시 - Boolean**
```typescript
export const isUserActive = async (userId: number): Promise<boolean> => {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  return user?.isActive ?? false;  // null 대신 false
};
```

### 3. 함수 파라미터에서 Null 최소화

**원칙**: 함수는 가능한 한 null을 받지 않습니다.

**문제**: Nullable 파라미터는 호출자가 부주의하게 null을 전달하도록 유도하여 코드베이스 전체에 null이 확산됩니다.

**❌ 나쁜 예시**
```typescript
export const createOrder = async (
  userId: number | null,  // null 허용
  items: OrderItem[] | null  // null 허용
): Promise<Order> => {
  if (!userId) {
    throw new ValidationException('User ID is required');
  }

  if (!items || items.length === 0) {
    throw new ValidationException('Order items are required');
  }

  // 비즈니스 로직...
};

// 호출하는 곳에서 null 전달 가능
await createOrder(null, null);  // 런타임 에러
```

**✅ 좋은 예시**
```typescript
export const createOrder = async (
  userId: number,        // null 불가
  items: OrderItem[]     // null 불가
): Promise<Order> => {
  // 파라미터가 항상 존재하므로 검증 불필요

  // Early exit 패턴 사용
  if (items.length === 0) {
    throw new ValidationException('Order items cannot be empty');
  }

  // 비즈니스 로직...
};

// 호출하는 곳에서 null 전달 불가 (컴파일 에러)
const handler = async (req: Request, res: Response) => {
  const { userId, items } = req.body;

  // 진입점에서 검증
  if (!userId || !items) {
    throw new ValidationException('Missing required fields');
  }

  const order = await createOrder(userId, items);
  res.json(order);
};
```

### 4. Number와 Boolean은 NOT NULL

**문제점 1: 의미 혼란**

Nullable number/boolean은 2가지가 아닌 3가지 상태를 만들어 혼란을 야기합니다.

**❌ 나쁜 예시**
```typescript
interface TestResultResponse {
  isPassed: boolean | null;  // true, false, null 세 가지 상태
}

// null의 의미가 불명확
// null = 아직 테스트 안 함?
// null = 테스트 결과 알 수 없음?
// null = 테스트 진행 중?
```

**✅ 좋은 예시**
```typescript
enum TestStatus {
  READY = 'READY',      // 테스트 준비
  PASS = 'PASS',        // 통과
  FAIL = 'FAIL'         // 실패
}

interface TestResultResponse {
  status: TestStatus;  // 명확한 세 가지 상태
}
```

**문제점 2: SQL 복잡성**

Nullable number는 SQL 집계 함수에서 예상치 못한 결과를 만듭니다.

**❌ 나쁜 예시**
```sql
-- price 값: [1000, null, 1000, 0]
SELECT AVG(price) FROM products;
-- 결과: 666.67 (null 자동 제외, 예상: 500)

-- 올바른 평균을 위해 COALESCE 필요
SELECT AVG(COALESCE(price, 0)) FROM products;
-- 결과: 500
```

**문제점 3: 쿼리 복잡성**

Nullable boolean은 쿼리를 복잡하게 만듭니다.

**❌ 나쁜 예시**
```sql
-- false와 null을 모두 포함하려면
WHERE is_active IS FALSE OR is_active IS NULL;
```

**✅ 좋은 예시**
```sql
-- NOT NULL이면 단순 비교
WHERE is_active = false;
```

**해결책: 항상 기본값 설정**

**Database Schema**:
```typescript
// src/modules/product/schema.ts
import { pgTable, serial, varchar, integer, boolean } from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  price: integer('price').notNull().default(0),        // NOT NULL with default
  isActive: boolean('is_active').notNull().default(true), // NOT NULL with default
});

export const testResults = pgTable('test_results', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 50 }).notNull().default('READY'), // NOT NULL with default
});
```

**Response Type**:
```typescript
interface ProductResponse {
  id: number;
  name: string;
  price: number;      // 항상 존재 (기본값 0)
  isActive: boolean;  // 항상 존재 (기본값 true)
}

enum TestStatus {
  READY = 'READY',
  PASS = 'PASS',
  FAIL = 'FAIL'
}

interface TestResultResponse {
  id: number;
  status: TestStatus;  // 항상 존재 (기본값 READY)
}
```

### Null 처리 요약

1. **Pre-condition 검증**: 진입점에서 null 검증하여 비즈니스 로직을 null-free로
2. **Null 반환 피하기**: 예외 던지기 또는 Null Object Pattern 사용
3. **Nullable 파라미터 최소화**: 함수는 non-null 파라미터를 받도록 설계
4. **Number/Boolean NOT NULL**: 항상 기본값 설정하여 3-state 문제 방지
5. **Null safe 문법은 최후 수단**: `?.`, `??`는 근본 해결책이 아님

## 네이밍 규칙

### 1. camelCase 사용

**원칙**: 모든 필드명은 camelCase를 사용합니다.

**이유**:
- 다양한 프로그래밍 언어에서 일관성 유지
- JavaScript/TypeScript 표준 컨벤션
- OpenAPI 코드 생성 도구와 호환성 향상

**❌ 나쁜 예시**
```typescript
interface UserResponse {
  user_id: number;           // snake_case
  UserEmail: string;         // PascalCase
  created_at: string;        // snake_case
}
```

**✅ 좋은 예시**
```typescript
interface UserResponse {
  userId: number;
  userEmail: string;
  createdAt: string;
}
```

### 2. 축약 금지

**원칙**: 팀 내 축약어는 사용하지 않습니다.

**예외**: 보편적으로 통용되는 축약어 (id, url, api 등)

**❌ 나쁜 예시**
```typescript
interface OrderResponse {
  ordId: number;        // order ID
  usrNm: string;        // user name
  ordDt: string;        // order date
  cnt: number;          // count
  amt: number;          // amount
}
```

**✅ 좋은 예시**
```typescript
interface OrderResponse {
  orderId: number;
  userName: string;
  orderDate: string;
  count: number;
  amount: number;
}
```

### 3. 타입에 맞는 명칭

**Boolean 필드**: `is`, `has`, `can` 등의 prefix 사용

```typescript
interface UserResponse {
  isActive: boolean;
  hasSubscription: boolean;
  canEdit: boolean;
}
```

**날짜 필드**: `At` suffix 사용

```typescript
interface OrderResponse {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  paidAt: string | null;
}
```

**복수형 필드**: 복수형 표기

```typescript
interface UserResponse {
  orders: Order[];      // ✅ 복수형
  // order: Order[];    // ❌ 단수형

  addresses: Address[];  // ✅ 복수형
  // address: Address[]; // ❌ 단수형
}
```

## 데이터 타입과 포맷

### 1. 날짜는 ISO-8601 형식 사용

**원칙**: UNIX 타임스탬프 대신 ISO-8601 형식 사용

**❌ 나쁜 예시**
```typescript
interface OrderResponse {
  createdAt: number;  // 1622188037000 (UNIX timestamp)
}

// 클라이언트에서 변환 필요
const date = new Date(response.createdAt);
```

**✅ 좋은 예시**
```typescript
interface OrderResponse {
  createdAt: string;  // "2021-05-28T14:07:17Z" (ISO-8601)
}

// 클라이언트에서 직관적
const date = new Date(response.createdAt);
```

**ISO-8601 포맷 예시**
```
2021-05-28T14:07:17Z           // UTC
2021-05-28T14:07:17+09:00      // 타임존 포함
2021-05-28T14:07:17.123Z       // 밀리초 포함
```

### 2. Enum은 문자열로

**원칙**: Enum 값은 ordinal(숫자) 대신 문자열 사용

**❌ 나쁜 예시**
```typescript
// 서버 응답
interface OrderResponse {
  status: number;  // 0: PENDING, 1: PAID, 2: SHIPPED, 3: DELIVERED
}

// 클라이언트에서 매직 넘버 사용
if (order.status === 1) {
  // PAID 처리
}
```

**✅ 좋은 예시**
```typescript
enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED'
}

interface OrderResponse {
  status: OrderStatus;
}

// 클라이언트에서 명시적 사용
if (order.status === OrderStatus.PAID) {
  // PAID 처리
}
```

**장점**:
- 디버깅 용이 (문자열로 바로 확인 가능)
- 순서 변경에 안전
- 자체 문서화 (값만 봐도 의미 파악 가능)

### 3. 제한된 문자열 값은 Enum으로

**원칙**: 가능한 값이 제한적이면 반드시 Enum 타입으로 정의

**❌ 나쁜 예시**
```typescript
interface UserResponse {
  role: string;  // 'ADMIN' | 'USER' | 'GUEST' 이지만 타입에 명시 안 됨
}
```

**✅ 좋은 예시**
```typescript
enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  GUEST = 'GUEST'
}

interface UserResponse {
  role: UserRole;  // 가능한 값이 명확
}
```

### 4. Boolean vs Timestamp vs Enum 선택 가이드

**핵심 질문**: "탈퇴 여부를 표현할 때 `is_left`, `left_at`, `left_status` 중 무엇을 사용해야 할까?"

**정답**: "상황에 따라 다릅니다." 세 가지 요소를 고려하세요.

#### 선택 기준

**1. 상태의 복잡도**
- **2가지 상태**: Boolean 고려 (active/inactive, enabled/disabled)
- **3가지 이상 상태**: Enum 우선 (pending/active/suspended/deleted)
- **시간 정보 필요**: Timestamp 추가 고려

**2. 쿼리 패턴**
- **긍정 조건 쿼리** (`WHERE status = 'ACTIVE'`): Enum/Boolean이 인덱스 활용 우수
- **부정 조건 쿼리** (`WHERE deleted_at IS NULL`): 인덱스 활용 저조, Full Table Scan 가능성
- **시간 범위 쿼리** (`WHERE created_at > ?`): Timestamp 적합

**3. 확장 가능성**
- **미래 상태 추가 가능성 높음**: Enum (확장 용이)
- **확장 가능성 낮음**: Boolean (단순성)

#### 권장 접근법

**1순위: Enum 사용**

```typescript
// ✅ 좋은 예시 - 확장 가능하고 명확
enum AccountStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED'
}

interface UserResponse {
  id: number;
  email: string;
  accountStatus: AccountStatus;
}

// Database Schema
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  accountStatus: varchar('account_status', { length: 50 })
    .notNull()
    .default('ACTIVE'),
});

// 쿼리 예시 - 인덱스 활용 우수
const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.accountStatus, 'ACTIVE'));
```

**장점**:
- 새로운 상태 추가 용이 (`PENDING_DELETION` 등)
- 쿼리 인덱스 활용 우수
- 명시적이고 자기 문서화
- TypeScript 타입 안정성

**2순위: Boolean + Timestamp 조합**

단순한 상태이면서 시간 정보가 필요한 경우

```typescript
// ✅ 좋은 예시 - 시간 정보가 중요한 경우
interface UserResponse {
  id: number;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;  // 마지막 로그인 시간 (자주 조회)
  deactivatedAt: string | null;  // 비활성화 시간 (감사 목적)
}

// Database Schema
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at'),
  deactivatedAt: timestamp('deactivated_at'),
});
```

**사용 시나리오**:
- "마지막 인증 시간" 같은 정보를 자주 표시
- 별도 감사(audit) 테이블 없이 간단한 이력 추적

**3순위: Timestamp만 사용**

**⚠️ 주의**: Timestamp만 사용하는 것은 인덱스 성능 문제가 있을 수 있습니다.

```typescript
// ⚠️ 주의 필요 - 인덱스 활용 저조
interface UserResponse {
  id: number;
  email: string;
  deletedAt: string | null;  // null = 활성, 값 있음 = 삭제됨
}

// 쿼리 예시 - IS NULL은 인덱스 활용 저조
const activeUsers = await db
  .select()
  .from(users)
  .where(isNull(users.deletedAt));  // Full Table Scan 가능성
```

**문제점**:
- `IS NULL` 조건은 인덱스를 효과적으로 활용하지 못함
- 상태가 2가지(존재/삭제)로 제한됨
- 추가 상태 확장 어려움

#### 실전 예시

**사용자 계정 상태**

```typescript
// ✅ 권장: Enum (확장 가능성 높음)
enum UserAccountStatus {
  ACTIVE = 'ACTIVE',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  SUSPENDED = 'SUSPENDED',
  DELETED = 'DELETED'
}

interface UserResponse {
  id: number;
  email: string;
  accountStatus: UserAccountStatus;
  createdAt: string;
  updatedAt: string;
}
```

**주문 상태**

```typescript
// ✅ 권장: Enum + Timestamp 조합
enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

interface OrderResponse {
  id: number;
  status: OrderStatus;
  paidAt: string | null;        // 결제 시간 (자주 표시)
  shippedAt: string | null;     // 배송 시작 시간
  deliveredAt: string | null;   // 배송 완료 시간
  createdAt: string;
  updatedAt: string;
}
```

**구독 활성화 상태**

```typescript
// ✅ 권장: Boolean (단순하고 확장 불필요)
interface SubscriptionResponse {
  id: number;
  userId: number;
  isActive: boolean;  // 활성/비활성만 필요
  startedAt: string;
  expiresAt: string;
}
```

**소프트 삭제 (Soft Delete)**

```typescript
// ✅ 권장: Enum 또는 Boolean
// 방법 1: Enum (추가 상태 가능성 있음)
enum RecordStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
  DELETED = 'DELETED'
}

interface ProductResponse {
  id: number;
  name: string;
  status: RecordStatus;
}

// 방법 2: Boolean (단순)
interface ProductResponse {
  id: number;
  name: string;
  isDeleted: boolean;  // 단순 삭제 여부만
  deletedAt: string | null;  // 삭제 시간 (감사 목적)
}
```

#### 피해야 할 패턴

**❌ RDBMS Native Enum 타입 사용**

PostgreSQL, MySQL의 enum 타입은 변경이 어렵습니다.

```sql
-- ❌ 나쁜 예시
CREATE TYPE user_status AS ENUM ('active', 'inactive');
-- 새로운 값 추가가 복잡하고 제한적
```

```typescript
// ✅ 좋은 예시 - VARCHAR + Application Enum
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 50 }).notNull().default('ACTIVE'),
  // Application에서 Enum으로 관리
});

enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  // 추가 용이
}
```

**❌ Timestamp만 의존 (인덱스 고려 없음)**

```typescript
// ❌ 나쁜 예시
interface UserResponse {
  deletedAt: string | null;
}

// 쿼리 성능 저하
const activeUsers = await db
  .select()
  .from(users)
  .where(isNull(users.deletedAt));  // 인덱스 활용 어려움
```

```typescript
// ✅ 좋은 예시 - Enum 또는 Boolean 추가
interface UserResponse {
  isDeleted: boolean;  // 쿼리 성능
  deletedAt: string | null;  // 감사 정보
}

// 빠른 쿼리
const activeUsers = await db
  .select()
  .from(users)
  .where(eq(users.isDeleted, false));  // 인덱스 활용 우수
```

#### 의사결정 플로우차트

```
상태를 표현해야 함
  ├─ 3가지 이상 상태 필요? → YES → Enum 사용
  ├─ 2가지 상태만 필요?
  │   ├─ 시간 정보 자주 조회? → YES → Boolean + Timestamp
  │   └─ 시간 정보 불필요? → NO → Boolean만
  └─ 미래 확장 가능성?
      ├─ 높음 → Enum (확장 용이)
      └─ 낮음 → Boolean (단순성)
```

### 데이터 타입 선택 요약

| 상황 | 권장 | 예시 |
|------|------|------|
| 3가지 이상 상태 | Enum | `status: 'ACTIVE' \| 'SUSPENDED' \| 'DELETED'` |
| 2가지 상태 + 시간 중요 | Boolean + Timestamp | `isActive: boolean, deactivatedAt: string \| null` |
| 2가지 상태 + 단순 | Boolean | `isActive: boolean` |
| 시간 범위 쿼리 필요 | Timestamp | `createdAt: string` |
| 확장 가능성 높음 | Enum | `accountStatus: UserAccountStatus` |
| 인덱스 성능 중요 | Enum/Boolean (NOT NULL) | `WHERE status = 'ACTIVE'` |

## 일관성 유지

### 1. 요청/응답 간 필드명 일관성

**원칙**: 같은 개념은 요청과 응답에서 동일한 이름 사용

**❌ 나쁜 예시**
```typescript
// 요청
interface CreateUserRequest {
  email: string;
  password: string;
  userName: string;
}

// 응답
interface UserResponse {
  email: string;
  name: string;  // userName과 다른 이름
}
```

**✅ 좋은 예시**
```typescript
// 요청
interface CreateUserRequest {
  email: string;
  password: string;
  userName: string;
}

// 응답
interface UserResponse {
  email: string;
  userName: string;  // 요청과 동일
}
```

### 2. 전체 API에서 같은 의미는 같은 명칭

**원칙**: 전체 시스템에서 같은 개념은 일관된 이름 사용

**❌ 나쁜 예시**
```typescript
interface UserResponse {
  createdAt: string;
  modifiedAt: string;  // updated와 modified 혼용
}

interface OrderResponse {
  createdAt: string;
  updatedAt: string;
}
```

**✅ 좋은 예시**
```typescript
interface UserResponse {
  createdAt: string;
  updatedAt: string;
}

interface OrderResponse {
  createdAt: string;
  updatedAt: string;
}
```

**일관성 체크리스트**:
- 생성 시간: `createdAt`
- 수정 시간: `updatedAt`
- 삭제 시간: `deletedAt`
- 사용자 ID: `userId`
- 주문 ID: `orderId`

## TypeScript 적용 예시

### 1. 응답 타입 정의

```typescript
// src/types/responses.ts

/**
 * 기본 응답 인터페이스
 */
export interface BaseResponse {
  createdAt: string;
  updatedAt: string;
}

/**
 * 사용자 역할
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  USER = 'USER',
  GUEST = 'GUEST'
}

/**
 * 사용자 응답
 */
export interface UserResponse extends BaseResponse {
  id: number;
  email: string;
  userName: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
}

/**
 * 주문 상태
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

/**
 * 주문 응답
 */
export interface OrderResponse extends BaseResponse {
  id: number;
  userId: number;
  status: OrderStatus;
  totalAmount: number;
  items: OrderItemResponse[];
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
}

/**
 * 주문 항목 응답
 */
export interface OrderItemResponse {
  id: number;
  productName: string;
  quantity: number;
  price: number;
}

/**
 * 페이지네이션 응답
 */
export interface PageResponse<T> {
  items: T[];
  totalCount: number;
  page: number;
  pageSize: number;
  hasNext: boolean;
}
```

### 2. 핸들러에서 활용

```typescript
// src/modules/user/handlers.ts
import { Request, Response } from 'express';
import { db } from '../../config/database';
import { users } from './schema';
import { UserResponse, UserRole } from '../../types/responses';
import { eq } from 'drizzle-orm';

/**
 * ID로 사용자 조회
 */
export const getById = async (req: Request, res: Response<UserResponse>) => {
  const { id } = req.params;

  const [user] = await db.select().from(users).where(eq(users.id, Number(id)));

  if (!user) {
    throw new NotFoundException(`ID ${id}에 해당하는 사용자를 찾을 수 없습니다`);
  }

  // 응답 형식 준수
  const response: UserResponse = {
    id: user.id,
    email: user.email,
    userName: user.userName,
    role: user.role as UserRole,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };

  res.json(response);
};

/**
 * 사용자 목록 조회 (페이지네이션)
 */
export const list = async (
  req: Request,
  res: Response<PageResponse<UserResponse>>
) => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 20;
  const offset = (page - 1) * pageSize;

  const [userList, totalCount] = await Promise.all([
    db.select().from(users).limit(pageSize).offset(offset),
    db.select({ count: count() }).from(users).then(r => r[0].count),
  ]);

  const response: PageResponse<UserResponse> = {
    items: userList.map(user => ({
      id: user.id,
      email: user.email,
      userName: user.userName,
      role: user.role as UserRole,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    })),
    totalCount,
    page,
    pageSize,
    hasNext: offset + pageSize < totalCount,
  };

  res.json(response);
};
```

### 3. 유틸리티 함수

```typescript
// src/utils/response.ts

/**
 * Date 객체를 ISO-8601 문자열로 변환
 */
export const toISOString = (date: Date | null | undefined): string | null => {
  return date ? date.toISOString() : null;
};

/**
 * 빈 배열 반환 헬퍼
 */
export const emptyArray = <T>(): T[] => [];

/**
 * 페이지네이션 응답 생성 헬퍼
 */
export const createPageResponse = <T>(
  items: T[],
  totalCount: number,
  page: number,
  pageSize: number
): PageResponse<T> => ({
  items,
  totalCount,
  page,
  pageSize,
  hasNext: (page - 1) * pageSize + items.length < totalCount,
});
```

### 4. 검증 및 변환

```typescript
// src/modules/order/handlers.ts
import { Request, Response } from 'express';
import { OrderResponse, OrderStatus } from '../../types/responses';
import { toISOString } from '../../utils/response';

/**
 * 주문 생성
 */
export const create = async (
  req: Request,
  res: Response<OrderResponse>
) => {
  const { userId, items } = req.body;

  // 비즈니스 로직...
  const order = await createOrder(userId, items);

  // 응답 형식 준수
  const response: OrderResponse = {
    id: order.id,
    userId: order.userId,
    status: OrderStatus.PENDING,
    totalAmount: order.totalAmount,
    items: order.items.map(item => ({
      id: item.id,
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
    })),
    paidAt: null,
    shippedAt: null,
    deliveredAt: null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };

  res.status(201).json(response);
};
```

## 체크리스트

API 응답 설계 시 다음 항목을 확인하세요:

### 필드 설계
- [ ] 현재 필요한 필드만 포함했는가?
- [ ] 빈 배열을 `null` 대신 `[]`로 반환하는가?
- [ ] Boolean 필드에 `null`을 사용하지 않았는가?
- [ ] Number 필드에 기본값(0 등)을 설정했는가?

### Null 처리
- [ ] 진입점에서 Pre-condition 검증을 수행하는가?
- [ ] 함수가 null 대신 예외를 던지거나 기본값을 반환하는가?
- [ ] 함수 파라미터가 non-null로 설계되었는가?
- [ ] Number/Boolean 필드가 NOT NULL로 정의되었는가?

### 네이밍
- [ ] 모든 필드가 camelCase를 따르는가?
- [ ] 축약어를 사용하지 않았는가?
- [ ] Boolean 필드에 `is`, `has` prefix를 사용했는가?
- [ ] 날짜 필드에 `At` suffix를 사용했는가?
- [ ] 복수형 필드는 복수형으로 표기했는가?

### 데이터 타입
- [ ] 날짜는 ISO-8601 형식인가?
- [ ] Enum 값은 문자열로 정의했는가?
- [ ] 제한된 문자열 값을 Enum으로 정의했는가?
- [ ] 3가지 이상 상태는 Enum을 사용했는가?
- [ ] 쿼리 패턴과 인덱스 성능을 고려했는가?

### 일관성
- [ ] 요청/응답 간 필드명이 일관성 있는가?
- [ ] 전체 API에서 같은 의미는 같은 이름을 사용하는가?

## 요약

### 필드 설계
1. **최소 스펙 유지** - 현재 필요한 필드만 포함
2. **빈 배열 활용** - null 대신 [] 반환
3. **Boolean은 2가지 상태** - null 없이 true/false만

### Null 처리
4. **Pre-condition 검증** - 진입점에서 null 검증
5. **Null 반환 피하기** - 예외 또는 기본값 반환
6. **Non-null 파라미터** - 함수는 null을 받지 않음
7. **Number/Boolean NOT NULL** - 항상 기본값 설정

### 네이밍
8. **camelCase 사용** - 일관된 네이밍 컨벤션
9. **축약 금지** - 명확한 이름 사용
10. **타입별 네이밍** - Boolean(`is`), 날짜(`At`), 복수형

### 데이터 타입
11. **ISO-8601 날짜** - 직관적인 날짜 포맷
12. **문자열 Enum** - 명시적이고 안전한 Enum
13. **Enum 우선 사용** - 3가지 이상 상태는 Enum
14. **인덱스 성능 고려** - Boolean/Enum이 Timestamp보다 쿼리 성능 우수

### 일관성
15. **일관성 유지** - 요청/응답 및 전체 API에서 통일

이 가이드를 따르면 직관적이고 안정적이며 사용하기 쉬운 API를 설계할 수 있습니다.
