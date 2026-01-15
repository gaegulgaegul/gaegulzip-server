---
name: api-documenter
description: |
  OpenAPI 3.0 문서를 자동 생성합니다.
  handlers.ts와 schema.ts를 분석하여 API 명세를 작성합니다.
  "API 문서 만들어줘", "OpenAPI 문서 생성해줘" 요청 시 사용합니다.
---

# API Documenter Skill

OpenAPI 3.0 명세를 자동 생성하는 스킬입니다.

## 사용 방법

```bash
# 스킬 실행
/api-documenter [feature-name]

# 예시
/api-documenter users
```

## 기능

1. **handlers.ts 분석**: API 엔드포인트 추출
2. **schema.ts 분석**: 데이터 타입 정의 추출
3. **OpenAPI 3.0 생성**: docs/openapi.yaml 작성
4. **최신 표준 준수**: context7 MCP로 OpenAPI 베스트 프랙티스 확인
5. **과거 패턴 참조**: claude-mem MCP로 과거 API 문서 작성 패턴 참조

## 워크플로우

### 1. handlers.ts 읽기
```typescript
Read("src/modules/[feature]/handlers.ts")
// JSDoc 주석에서 API 정보 추출
// - 함수명
// - 파라미터
// - 응답 타입
```

### 2. index.ts (Router) 읽기
```typescript
Read("src/modules/[feature]/index.ts")
// Router 정의에서 경로 추출
// - HTTP Method (GET, POST, PUT, DELETE)
// - Path (/api/v1/users, /api/v1/users/:id)
```

### 3. schema.ts 읽기
```typescript
Read("src/modules/[feature]/schema.ts")
// Drizzle 스키마에서 타입 정의 추출
// - 필드 이름
// - 데이터 타입
// - 필수 여부
// - 설명
```

### 4. context7 MCP로 베스트 프랙티스 확인
```typescript
"OpenAPI 3.0 specification best practices"
"OpenAPI schema definition patterns"
```

### 5. claude-mem MCP로 과거 패턴 참조
```typescript
"search for past API documentation patterns"
"search for past OpenAPI definitions"
```

### 6. OpenAPI 3.0 문서 생성
템플릿을 기반으로 `docs/openapi.yaml` 생성

## 출력 파일

### docs/openapi.yaml

```yaml
openapi: 3.0.0
info:
  title: gaegulzip-server API
  version: 1.0.0
  description: gaegulzip-server RESTful API Documentation

servers:
  - url: http://localhost:3001/api/v1
    description: Development server

paths:
  /users:
    get:
      summary: 모든 사용자 조회
      description: 시스템의 모든 사용자 목록을 반환합니다
      tags:
        - Users
      responses:
        '200':
          description: 성공
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'
        '500':
          description: 서버 에러
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    post:
      summary: 새 사용자 생성
      description: 이메일과 이름으로 새 사용자를 생성합니다
      tags:
        - Users
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required:
                - email
                - name
              properties:
                email:
                  type: string
                  format: email
                  example: user@example.com
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
                  example: John Doe
      responses:
        '201':
          description: 생성 성공
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
        '400':
          description: 유효성 에러
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '500':
          description: 서버 에러
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

  /users/{id}:
    get:
      summary: 특정 사용자 조회
      description: ID로 사용자를 조회합니다
      tags:
        - Users
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
          description: 사용자 ID
      responses:
        '200':
          description: 성공
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
        '404':
          description: 사용자 없음
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'
        '500':
          description: 서버 에러
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Error'

    put:
      summary: 사용자 정보 수정
      description: ID로 사용자 정보를 수정합니다
      tags:
        - Users
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
          description: 사용자 ID
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                email:
                  type: string
                  format: email
                name:
                  type: string
                  minLength: 1
                  maxLength: 100
      responses:
        '200':
          description: 수정 성공
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    $ref: '#/components/schemas/User'
        '400':
          description: 유효성 에러
        '404':
          description: 사용자 없음
        '500':
          description: 서버 에러

    delete:
      summary: 사용자 삭제
      description: ID로 사용자를 삭제합니다
      tags:
        - Users
      parameters:
        - in: path
          name: id
          required: true
          schema:
            type: integer
          description: 사용자 ID
      responses:
        '200':
          description: 삭제 성공
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
                    example: User deleted successfully
        '404':
          description: 사용자 없음
        '500':
          description: 서버 에러

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: integer
          description: 사용자 ID
          example: 1
        email:
          type: string
          format: email
          description: 이메일 주소
          example: user@example.com
        name:
          type: string
          description: 사용자 이름
          example: John Doe
        createdAt:
          type: string
          format: date-time
          description: 생성 일시
          example: 2024-01-15T10:30:00Z
        updatedAt:
          type: string
          format: date-time
          description: 수정 일시
          example: 2024-01-15T10:30:00Z
      required:
        - id
        - email
        - name
        - createdAt
        - updatedAt

    Error:
      type: object
      properties:
        error:
          type: string
          description: 에러 메시지
          example: Invalid request
      required:
        - error

tags:
  - name: Users
    description: 사용자 관리 API
```

## 타입 매핑 (Drizzle → OpenAPI)

| Drizzle Type | OpenAPI Type | Format |
|--------------|--------------|--------|
| `serial()` | `integer` | - |
| `integer()` | `integer` | - |
| `varchar()` | `string` | - |
| `text()` | `string` | - |
| `boolean()` | `boolean` | - |
| `timestamp()` | `string` | `date-time` |
| `uuid()` | `string` | `uuid` |
| `jsonb()` | `object` | - |

## JSDoc에서 정보 추출

### handlers.ts 예시
```typescript
/**
 * 사용자를 생성합니다
 * @param req - 요청 객체 (body: { email, name })
 * @param res - 응답 객체
 * @returns 201: 생성된 사용자, 400: 유효성 에러, 500: 서버 에러
 */
export const createUser: RequestHandler = async (req, res) => {
  // ...
};
```

**추출 정보**:
- **summary**: "사용자를 생성합니다"
- **request**: `{ email, name }`
- **responses**: `201`, `400`, `500`

## 사용 도구

- **Read**: 파일 읽기
- **Write**: OpenAPI 문서 작성
- **Glob**: handlers/schema 파일 찾기
- **Grep**: 특정 패턴 검색
- **context7 MCP**: OpenAPI 3.0 베스트 프랙티스
- **claude-mem MCP**: 과거 API 문서 패턴

## 체크리스트

작업 완료 전 확인:
- [ ] handlers.ts 읽고 엔드포인트 추출
- [ ] index.ts 읽고 경로/메서드 추출
- [ ] schema.ts 읽고 타입 정의 추출
- [ ] context7 MCP로 OpenAPI 베스트 프랙티스 확인
- [ ] claude-mem MCP로 과거 패턴 참조
- [ ] OpenAPI 3.0 문서 작성 (docs/openapi.yaml)
- [ ] 모든 엔드포인트 포함
- [ ] 모든 스키마 정의 포함
- [ ] 예시 값 포함
- [ ] 한국어 설명 포함

## 다음 단계

OpenAPI 문서 생성 완료 후:
1. **사용자 검토**: 문서 정확성 확인
2. **Swagger UI**: 문서 시각화 (선택)
3. **최종 승인**: 전체 워크플로우 완료
