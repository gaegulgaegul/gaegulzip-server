# 로깅(Logging) 베스트 프랙티스

> 출처:
> - https://jojoldu.tistory.com/712 (로그 레벨 구분하기)
> - https://jojoldu.tistory.com/773 (운영 로그와 디버그 로그 분리)

이 문서는 효율적인 로그 모니터링과 유지보수 가능한 로깅 구조를 구축하는 방법을 다룹니다.

## 목차
- [로그 레벨의 이해](#로그-레벨의-이해)
- [로그 레벨별 사용 기준](#로그-레벨별-사용-기준)
- [WARN vs ERROR 구분](#warn-vs-error-구분)
- [운영 로그와 디버그 로그 분리](#운영-로그와-디버그-로그-분리)
- [Domain Probe 패턴](#domain-probe-패턴)
- [모니터링 임계값](#모니터링-임계값)
- [TypeScript/Express 적용 예시](#typescriptexpress-적용-예시)

## 로그 레벨의 이해

### 로그 레벨의 목적

로그 레벨은 메시지의 중요도를 표시하여 **"개발자가 밤새 잠을 잘 수 있는지"**를 판단하는 기준입니다.

적절한 로그 레벨 구분은:
- 알람 피로도를 줄입니다
- 정말 중요한 문제에 집중할 수 있게 합니다
- 효율적인 모니터링 환경을 조성합니다

### 핵심 질문

각 로그를 작성할 때 다음을 자문하세요:

> "이 로그가 발생했을 때, 개발자가 즉시 대응해야 하는가?"

- **예** → ERROR
- **아니오, 하지만 주의가 필요** → WARN
- **아니오, 정상 작동** → INFO
- **개발/디버깅 용도** → DEBUG

## 로그 레벨별 사용 기준

### DEBUG

**목적**: 개발/테스트 단계에서 코드 흐름 추적

**사용 시나리오**:
- 함수 호출 및 반환값 추적
- 변수 값 확인
- 조건문 분기 확인
- 개발 중 임시 로깅

**운영 환경**: 일반적으로 비활성화

```typescript
logger.debug('Called removeCart', { productId: product.id, userId: user.id });
logger.debug('Cart items before removal', { items: cart.items });
```

### INFO

**목적**: 시스템의 정상적인 작동 상태 기록

**사용 시나리오**:
- 애플리케이션 시작/종료
- 주요 비즈니스 이벤트 완료 (주문 생성, 사용자 가입 등)
- 배치 작업 시작/완료
- 설정 정보 로딩

**운영 환경**: 활성화

```typescript
logger.info('User registered successfully', { userId: user.id, email: user.email });
logger.info('Daily batch job completed', { processedCount: 1000, duration: '5m' });
```

### WARN

**목적**: 잠재적 문제 상황 기록 (즉시 대응 불필요)

**사용 시나리오**:
- 외부 API 호출 실패 (재시도 가능)
- 사용자 입력 오류 (로그인 실패, 유효성 검증 실패)
- 설정 값 누락 (기본값으로 대체 가능)
- Deprecated 기능 사용

**핵심**: 개발자가 제어할 수 없는 빈번한 예외 상황

```typescript
logger.warn('External API call failed, using fallback', {
  api: 'weather-service',
  error: error.message
});

logger.warn('Login attempt failed', {
  email: email,
  reason: 'Invalid password'
});
```

### ERROR

**목적**: 즉시 조치가 필요한 심각한 오류

**사용 시나리오**:
- 데이터베이스 연결 실패
- 중요 비즈니스 로직 오류 (결제 실패, 재고 부족)
- 예상치 못한 예외
- 시스템 리소스 부족

**핵심**: 개발자가 즉시 확인하고 대응해야 하는 상황

```typescript
logger.error('Database connection failed', {
  error: error.message,
  stack: error.stack
});

logger.error('Payment processing failed', {
  orderId: order.id,
  amount: order.amount,
  error: error.message
});
```

## WARN vs ERROR 구분

### 외부 API 연동

**문제**: 분당 10,000건 트래픽 × 0.1% 실패율 = 분당 10개 ERROR 로그

**해결책**:
- 일반 외부 API 실패 → **WARN**
- 비즈니스 치명적 API 실패 (결제, 인증) → **ERROR**

**❌ 나쁜 예시**
```typescript
try {
  const weather = await weatherApi.getCurrentWeather(city);
} catch (error) {
  logger.error('Weather API failed', error); // 너무 심각하게 처리
  throw error;
}
```

**✅ 좋은 예시**
```typescript
try {
  const weather = await weatherApi.getCurrentWeather(city);
  return weather;
} catch (error) {
  logger.warn('Weather API failed, using cached data', {
    city,
    error: error.message
  });
  return cachedWeatherData;
}

// 반면, 결제 API는 ERROR
try {
  const payment = await paymentApi.processPayment(order);
  return payment;
} catch (error) {
  logger.error('Payment API failed - Critical', {
    orderId: order.id,
    amount: order.amount,
    error: error.message
  });
  throw error;
}
```

### 사용자 입력 오류

**문제**: 로그인 실패, 유효성 검증 실패는 빈번하게 발생

**해결책**:
- 일반 사용자 오류 → **WARN**
- 의심스러운 행동 (연속 5회 실패, IP 차단 등) → **ERROR**

**❌ 나쁜 예시**
```typescript
export const login = async (req: Request, res: Response) => {
  const user = await findUserByEmail(email);

  if (!user || !await bcrypt.compare(password, user.password)) {
    logger.error('Login failed', { email }); // 너무 심각하게 처리
    throw new UnauthorizedException('Invalid credentials');
  }
};
```

**✅ 좋은 예시**
```typescript
export const login = async (req: Request, res: Response) => {
  const user = await findUserByEmail(email);

  if (!user || !await bcrypt.compare(password, user.password)) {
    logger.warn('Login attempt failed', {
      email,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // 의심스러운 행동 감지
    const failedAttempts = await getFailedLoginAttempts(email);
    if (failedAttempts >= 5) {
      logger.error('Suspicious login activity detected', {
        email,
        attempts: failedAttempts,
        ip: req.ip
      });
    }

    throw new UnauthorizedException('Invalid credentials');
  }
};
```

## 운영 로그와 디버그 로그 분리

### 문제점: 로깅 코드와 비즈니스 로직 혼재

**비즈니스 로직이 로깅 코드에 묻힘**:

```typescript
// ❌ 나쁜 예시 - 비즈니스 로직이 로깅에 묻힘
export const removeCart = async (req: Request, res: Response) => {
  const { productId } = req.params;
  const product = await getProductById(productId);

  // 비즈니스 로직 시작
  await db.delete(cartItems).where(eq(cartItems.productId, product.id));

  // 로깅 로직이 비즈니스 로직 사이에 끼어있음
  if (product.type === ProductType.FOOD && product.isSpoiledFood()) {
    logger.info(`Removed spoiled food from cart`, {
      productId: product.id,
      productName: product.name,
      userId: req.user.id,
      timestamp: new Date().toISOString()
    });
  }

  if (product.isExpired()) {
    logger.warn(`Removed expired product`, {
      productId: product.id,
      expirationDate: product.expirationDate
    });
  }

  // 더 많은 비즈니스 로직...
  res.json({ success: true });
};
```

**문제점**:
1. 비즈니스 로직이 로깅 코드에 가려짐
2. 로그 메시지 포맷이 핸들러마다 불일치
3. 운영 로그 테스트가 어려움
4. 로깅 프레임워크에 강한 결합

### 해결책: Domain Probe 패턴

**운영 로그는 별도의 Probe 모듈로 분리**

```typescript
// ✅ 좋은 예시 - 비즈니스 로직과 로깅 분리

// src/modules/cart/handlers.ts - 비즈니스 로직은 깔끔하게
import * as cartProbe from './cart.probe';

/**
 * 장바구니에서 상품 제거
 */
export const removeCart = async (req: Request, res: Response) => {
  const { productId } = req.params;

  logger.debug('Called removeCart', { productId }); // 디버그 로그만

  const product = await getProductById(productId);
  await db.delete(cartItems).where(eq(cartItems.productId, product.id));

  cartProbe.remove(product);  // 운영 로그는 Probe에 위임

  res.json({ success: true });
};
```

```typescript
// src/modules/cart/cart.probe.ts - Probe는 운영 로그만 담당
import { logger } from '../../config/logger';
import { Product, ProductType } from './types';

/**
 * 상품 제거 운영 로그
 */
export const remove = (product: Product) => {
  if (product.type === ProductType.FOOD && product.isSpoiledFood()) {
    logger.info('Removed spoiled food from cart', {
      productId: product.id,
      productName: product.name,
      timestamp: new Date().toISOString()
    });
  }

  if (product.isExpired()) {
    logger.warn('Removed expired product', {
      productId: product.id,
      expirationDate: product.expirationDate
    });
  }
};
```

## Domain Probe 패턴

### 개념

**Domain Probe**는 운영 로그를 담당하는 별도 모듈입니다.

**원칙**:
- **운영 로그(INFO, WARN, ERROR)**: Probe 모듈(함수들)이 담당
- **디버그 로그(DEBUG)**: 핸들러 내에서 직접 작성

**Express 철학 적용**:
- Class 대신 독립적인 함수들로 구성
- 의존성 주입 대신 직접 import
- 미들웨어 중심 사고방식 유지

### 장점

1. **단일 책임 원칙**: 비즈니스 로직과 로깅 책임 분리
2. **테스트 용이성**: vi.mock()으로 쉽게 테스트
3. **일관성**: 중앙화된 로그 포맷
4. **유지보수성**: 로깅 변경이 비즈니스 로직에 영향 없음
5. **단순성**: Class 오버헤드 없이 함수만으로 구성

### 구현 예시

```typescript
// src/modules/order/handlers.ts
import { Request, Response } from 'express';
import { db } from '../../config/database';
import { orders } from './schema';
import * as orderProbe from './order.probe';
import * as paymentService from '../payment/payment.service';
import { logger } from '../../config/logger';

/**
 * 주문 생성
 */
export const create = async (req: Request, res: Response) => {
  const orderData = req.body;

  logger.debug('Creating order', { orderData });

  const [order] = await db.insert(orders).values(orderData).returning();

  try {
    const payment = await paymentService.process(order);
    await db.update(orders)
      .set({ paymentId: payment.id, status: 'PAID' })
      .where(eq(orders.id, order.id));

    orderProbe.created(order);  // 운영 로그

    res.status(201).json(order);
  } catch (error) {
    orderProbe.paymentFailed(order, error);  // 운영 로그
    throw error;
  }
};

/**
 * 주문 취소
 */
export const cancel = async (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { reason } = req.body;

  logger.debug('Cancelling order', { orderId, reason });

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId));

  if (!order) {
    orderProbe.notFound(orderId);  // 운영 로그
    throw new NotFoundException(`Order ${orderId} not found`);
  }

  if (order.status === OrderStatus.DELIVERED) {
    orderProbe.cannotCancel(order, 'Already delivered');  // 운영 로그
    throw new ValidationException('Cannot cancel delivered order');
  }

  await db.update(orders)
    .set({ status: OrderStatus.CANCELLED, cancelReason: reason })
    .where(eq(orders.id, orderId));

  orderProbe.cancelled({ ...order, status: OrderStatus.CANCELLED }, reason);  // 운영 로그

  res.json({ success: true });
};
```

```typescript
// src/modules/order/order.probe.ts
import { logger } from '../../config/logger';
import { Order } from './types';

/**
 * 주문 생성 성공
 */
export const created = (order: Order) => {
  logger.info('Order created successfully', {
    orderId: order.id,
    userId: order.userId,
    totalAmount: order.totalAmount,
    itemCount: order.items?.length || 0
  });
};

/**
 * 결제 실패 (Critical)
 */
export const paymentFailed = (order: Order, error: Error) => {
  logger.error('Order payment failed', {
    orderId: order.id,
    userId: order.userId,
    totalAmount: order.totalAmount,
    error: error.message,
    stack: error.stack
  });
};

/**
 * 주문 취소
 */
export const cancelled = (order: Order, reason: string) => {
  logger.info('Order cancelled', {
    orderId: order.id,
    userId: order.userId,
    status: order.status,
    reason
  });
};

/**
 * 주문 찾기 실패
 */
export const notFound = (orderId: number) => {
  logger.warn('Order not found', { orderId });
};

/**
 * 취소 불가능한 주문 취소 시도
 */
export const cannotCancel = (order: Order, reason: string) => {
  logger.warn('Cannot cancel order', {
    orderId: order.id,
    currentStatus: order.status,
    reason
  });
};
```

### 테스트 예시

```typescript
// tests/unit/order/handlers.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Request, Response } from 'express';
import * as handlers from '../../../src/modules/order/handlers';
import * as orderProbe from '../../../src/modules/order/order.probe';
import * as paymentService from '../../../src/modules/payment/payment.service';

// Probe 모듈 mock
vi.mock('../../../src/modules/order/order.probe');
vi.mock('../../../src/modules/payment/payment.service');

describe('Order Handlers', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {}
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    vi.clearAllMocks();
  });

  it('should log order creation', async () => {
    const orderData = { userId: 1, items: [{ productId: 1, quantity: 2 }] };
    mockReq.body = orderData;

    vi.mocked(paymentService.process).mockResolvedValue({ id: 'payment-1' });

    await handlers.create(mockReq as Request, mockRes as Response);

    // 운영 로그가 호출되었는지 검증
    expect(orderProbe.created).toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(201);
  });

  it('should log payment failure', async () => {
    const orderData = { userId: 1, items: [{ productId: 1, quantity: 2 }] };
    mockReq.body = orderData;

    // Payment 실패 시나리오
    const paymentError = new Error('Payment gateway timeout');
    vi.mocked(paymentService.process).mockRejectedValue(paymentError);

    await expect(
      handlers.create(mockReq as Request, mockRes as Response)
    ).rejects.toThrow();

    // 에러 로그가 호출되었는지 검증
    expect(orderProbe.paymentFailed).toHaveBeenCalled();
  });

  it('should log order cancellation', async () => {
    mockReq.params = { orderId: '1' };
    mockReq.body = { reason: 'Customer request' };

    await handlers.cancel(mockReq as Request, mockRes as Response);

    // 운영 로그가 호출되었는지 검증
    expect(orderProbe.cancelled).toHaveBeenCalled();
    expect(mockRes.json).toHaveBeenCalledWith({ success: true });
  });
});
```

## 모니터링 임계값

효율적인 알람 설정을 위한 권장 임계값입니다.

### INFO 레벨
- **목적**: 시스템 상태 모니터링
- **임계값**: 기존 대비 ±50% 이상 변화 시 알람
- **예시**:
  - 시간당 평균 로그인 1000건 → 1500건 이상 또는 500건 이하면 알람
  - 배치 작업 처리량 급감

### WARN 레벨
- **목적**: 잠재적 문제 조기 감지
- **임계값**: 분당 20개 이상 시 알람
- **예시**:
  - 외부 API 호출 실패 급증
  - 사용자 입력 오류 급증

### ERROR 레벨
- **목적**: 즉시 대응 필요
- **임계값**: 분당 5개 이상 시 알람
- **예시**:
  - 데이터베이스 연결 오류
  - 결제 처리 실패

**설정 예시 (CloudWatch, Datadog 등)**:

```yaml
# CloudWatch Alarm 예시
INFO_Spike:
  metric: log_count
  level: INFO
  threshold: 1500
  period: 1h
  comparison: GreaterThanThreshold

WARN_Frequent:
  metric: log_count
  level: WARN
  threshold: 20
  period: 1m
  comparison: GreaterThanThreshold

ERROR_Critical:
  metric: log_count
  level: ERROR
  threshold: 5
  period: 1m
  comparison: GreaterThanThreshold
```

## TypeScript/Express 적용 예시

### 1. Logger 설정

```typescript
// src/config/logger.ts
import winston from 'winston';

const logLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'gaegulzip-server' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    new winston.transports.File({
      filename: 'logs/combined.log'
    })
  ]
});
```

### 2. Probe 모듈 구조

```typescript
// src/modules/[feature]/[feature].probe.ts

/**
 * 각 feature별 Probe 모듈은 독립적인 함수들로 구성
 * Class가 아닌 함수 기반으로 작성하여 Express 철학에 부합
 */

import { logger } from '../../config/logger';

// 각 도메인별로 필요한 로깅 함수 정의
export const created = (data: any) => {
  logger.info('Resource created', data);
};

export const updated = (data: any) => {
  logger.info('Resource updated', data);
};

export const deleted = (data: any) => {
  logger.info('Resource deleted', data);
};
```

### 3. 실전 예시: User 모듈

```typescript
// src/modules/user/handlers.ts
import { Request, Response } from 'express';
import { db } from '../../config/database';
import { users } from './schema';
import * as userProbe from './user.probe';
import { logger } from '../../config/logger';
import bcrypt from 'bcrypt';

/**
 * 사용자 등록
 */
export const register = async (req: Request, res: Response) => {
  const userData = req.body;

  logger.debug('Registering user', { email: userData.email });

  // 이메일 중복 체크
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, userData.email));

  if (existingUser) {
    userProbe.duplicateEmail(userData.email);
    throw new ValidationException('Email already exists');
  }

  // 사용자 생성
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const [user] = await db
    .insert(users)
    .values({ ...userData, password: hashedPassword })
    .returning();

  userProbe.registered(user);

  res.status(201).json(user);
};

/**
 * 로그인
 */
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  logger.debug('User login attempt', { email });

  const [user] = await db.select().from(users).where(eq(users.email, email));

  if (!user || !await bcrypt.compare(password, user.password)) {
    userProbe.loginFailed(email);
    throw new UnauthorizedException('Invalid credentials');
  }

  const token = generateToken(user);

  userProbe.loginSuccess(user);

  res.json({ user, token });
};

/**
 * JWT 토큰 생성
 */
const generateToken = (user: User): string => {
  // 토큰 생성 로직
  return jwt.sign({ userId: user.id }, process.env.JWT_SECRET!);
};
```

```typescript
// src/modules/user/user.probe.ts
import { logger } from '../../config/logger';
import { User } from './types';

/**
 * 사용자 등록 성공
 */
export const registered = (user: User) => {
  logger.info('User registered successfully', {
    userId: user.id,
    email: user.email,
    createdAt: user.createdAt.toISOString()
  });
};

/**
 * 중복 이메일 감지 (사용자 오류)
 */
export const duplicateEmail = (email: string) => {
  logger.warn('Duplicate email registration attempt', { email });
};

/**
 * 로그인 성공
 */
export const loginSuccess = (user: User) => {
  logger.info('User logged in', {
    userId: user.id,
    email: user.email,
    lastLoginAt: new Date().toISOString()
  });
};

/**
 * 로그인 실패 (사용자 오류)
 */
export const loginFailed = (email: string) => {
  logger.warn('Login attempt failed', { email });
};
```

### 4. Global Error Handler에서 로깅

```typescript
// src/middleware/error-handler.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { AppException } from '../utils/exceptions';

export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // AppException은 예상된 예외이므로 WARN
  if (error instanceof AppException) {
    logger.warn('Business exception occurred', {
      name: error.name,
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method
    });

    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  // 예상치 못한 예외는 ERROR
  logger.error('Unexpected error occurred', {
    name: error.name,
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    query: req.query,
    params: req.params
  });

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: '서버 오류가 발생했습니다'
    }
  });
};
```

### 5. 요청 로깅 미들웨어

```typescript
// src/middleware/request-logger.ts
import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * 모든 HTTP 요청 로깅 (INFO 레벨)
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      userAgent: req.get('user-agent'),
      ip: req.ip
    });
  });

  next();
};
```

## 체크리스트

로그를 작성할 때 다음 항목을 확인하세요:

### 로그 레벨 선택
- [ ] 즉시 대응 필요한가? → ERROR
- [ ] 잠재적 문제인가? → WARN
- [ ] 정상 작동 기록인가? → INFO
- [ ] 개발/디버깅 용도인가? → DEBUG

### 로그 내용
- [ ] 충분한 컨텍스트 정보를 포함했는가? (ID, 상태, 시간 등)
- [ ] 민감 정보(비밀번호, 토큰 등)를 로깅하지 않았는가?
- [ ] 로그 메시지가 명확하고 실행 가능한가?
- [ ] 필요시 에러 스택 트레이스를 포함했는가?

### 구조
- [ ] 운영 로그는 Probe 패턴으로 분리했는가?
- [ ] 디버그 로그만 비즈니스 로직에 남겼는가?
- [ ] 로그 포맷이 일관성 있는가?
- [ ] 테스트 가능한 구조인가?

### 모니터링
- [ ] ERROR는 분당 5개 이상 시 알람 설정했는가?
- [ ] WARN은 분당 20개 이상 시 알람 설정했는가?
- [ ] INFO는 급격한 변화 감지 설정했는가?

## 요약

### 로그 레벨 구분
1. **DEBUG**: 개발/디버깅 (운영 환경 비활성화)
2. **INFO**: 정상 작동 기록 (모니터링용)
3. **WARN**: 잠재적 문제 (즉시 대응 불필요)
4. **ERROR**: 심각한 오류 (즉시 대응 필요)

### 핵심 원칙
1. **외부 API 실패 → WARN** (단, 결제 등 중요 API는 ERROR)
2. **사용자 입력 오류 → WARN** (단, 의심 행동은 ERROR)
3. **운영 로그는 Probe로 분리** (비즈니스 로직과 분리)
4. **디버그 로그만 비즈니스 로직에 포함**
5. **일관된 로그 포맷 유지**

### 모니터링 임계값
- **INFO**: 기존 대비 ±50% 이상 변화
- **WARN**: 분당 20개 이상
- **ERROR**: 분당 5개 이상

이 가이드를 따르면 알람 피로도를 줄이고, 정말 중요한 문제에 집중할 수 있는 효율적인 로깅 시스템을 구축할 수 있습니다.
