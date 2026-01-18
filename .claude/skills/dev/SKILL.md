---
name: dev
description: 자동화된 개발 팀 워크플로우. 요구사항 분석부터 코드 구현, 리뷰, 문서화까지 전체 개발 프로세스를 실행합니다. Plan 모드 → Senior Developer → Junior Developer → Independent Reviewer → API Documenter 순서로 진행됩니다. "/dev '기능 설명'" 형식으로 호출하면 docs/[feature]/ 디렉토리에 user-story.md, brief.md, work-plan.md, 구현 코드, 리뷰 보고서, API 문서를 생성합니다.
---

# Dev - 자동화된 개발 팀 워크플로우

## 개요

`/dev` 스킬은 Plan 모드와 멀티 에이전트 팀 워크플로우를 사용하여 전체 기능 개발 생명주기를 자동화합니다. 기능 설명을 받아 요구사항 분석, 기술 설계, 작업 계획, 코드 구현, 코드 리뷰, API 문서화를 자동으로 실행합니다.

**주요 특징**:
- 모든 커뮤니케이션은 한국어로 진행
- 요구사항 분석, 기술 설계, 작업 분배는 Plan 모드에서 처리
- TDD 기반 구현
- Fresh Eyes 검증

## 워크플로우

다음 단계를 순차적으로 실행하되, 오류 발생 시 중단합니다:

### Step 1: 기능명 추출
사용자 설명에서 디렉토리 이름으로 사용할 간결한 기능명을 추출합니다.

**변환 예시:**
- "Refresh Token 추가" → `refresh-token`
- "사용자 프로필 조회 API" → `user-profile-api`
- "이메일 인증 기능" → `email-verification`

**규칙:**
- kebab-case 사용 (소문자 + 하이픈)
- 30자 이내로 유지
- 한글/특수문자 제거

### Step 2-4: Plan 모드 - 요구사항 분석, 기술 설계, 작업 분배
EnterPlanMode를 호출하여 Plan 모드로 진입합니다.

**Plan 모드에서 수행할 작업:**
1. 요구사항 분석 (Product Owner 역할)
   - 사용자 스토리 작성
   - API 명세 정의
   - 수락 기준 명시

2. 기술 설계 (Tech Lead 역할)
   - 아키텍처 설계
   - DB 스키마 설계
   - 보안 메커니즘 설계
   - 기술 스택 선정

3. 작업 분배 (CTO 역할)
   - Senior/Junior Developer 작업 분리
   - 작업 순서 정의
   - Interface Contract 명시

**출력 파일:**
- `docs/[feature]/user-story.md`
- `docs/[feature]/brief.md`
- `docs/[feature]/work-plan.md`

**Plan 모드 종료:**
- ExitPlanMode 호출
- 사용자에게 계획 승인 요청
- 승인 후 다음 단계 진행

**중요:**
- 모든 커뮤니케이션은 한국어로 진행
- CLAUDE.md 가이드 준수 (예외 처리, API Response, 로깅)
- TDD 원칙 적용
- 실제 에이전트를 호출하지 않고 Plan 모드에서 직접 분석/설계

### Step 5: Senior Developer - 핵심 구현
`senior-developer` 서브에이전트를 실행하여 핸들러와 테스트를 구현합니다.

**입력:** `docs/[feature]/work-plan.md`
**출력:**
- `src/modules/[module]/handlers.ts`
- `src/modules/[module]/services.ts`
- `tests/unit/[module]/*.test.ts`

**작업 프롬프트 템플릿:**
```
핸들러 구현해줘 (TDD).
work-plan은 docs/[feature]/work-plan.md에 있어.

work-plan의 Senior Developer 작업 항목을 모두 구현해줘.
```

### Step 6: Junior Developer - 라우터 연결
`junior-developer` 서브에이전트를 실행하여 라우트를 연결합니다.

**입력:** `docs/[feature]/work-plan.md`, 구현된 핸들러
**출력:** `src/modules/[module]/index.ts`

**작업 프롬프트 템플릿:**
```
라우터 만들어줘.
work-plan은 docs/[feature]/work-plan.md에 있어.

work-plan의 Junior Developer 작업 항목을 모두 구현해줘.
```

### Step 7: 구현 요약
사용자에게 구현 요약을 제시합니다:

```
✅ 구현 완료: [feature name]

생성된 파일:
- docs/[feature]/user-story.md
- docs/[feature]/brief.md
- docs/[feature]/work-plan.md
- src/modules/[module]/...
- tests/unit/[module]/...

다음: 리뷰 및 문서화 단계
```

### Step 8: 사용자 승인 (리뷰 단계)
리뷰 및 문서화 진행을 위해 사용자 승인을 요청합니다.

**질문:**
```
구현이 완료되었습니다.
리뷰 및 API 문서화를 진행할까요?
```

**선택지:**
- "승인 - 계속 진행" (Step 9로 진행)
- "수정 필요" (적절한 단계로 복귀)

### Step 9: Independent Reviewer - 코드 리뷰
`independent-reviewer` 서브에이전트를 실행하여 요구사항 대비 구현을 검증합니다.

**입력:** `docs/[feature]/brief.md`, 구현된 코드
**출력:** 리뷰 보고서 (stdout 또는 파일)

**작업 프롬프트 템플릿:**
```
검증해줘.
brief는 docs/[feature]/brief.md에 있어.

구현된 코드가 요구사항을 충족하는지 Fresh Eyes로 검증해줘.
```

### Step 10: API Documenter - OpenAPI 문서화
`api-documenter` 서브에이전트를 실행하여 API 문서를 생성합니다.

**입력:** 구현된 핸들러 및 스키마
**출력:** OpenAPI 명세 파일

**작업 프롬프트 템플릿:**
```
API 문서 만들어줘.

구현된 모듈의 handlers.ts와 schema.ts를 분석하여 OpenAPI 3.0 문서를 생성해줘.
```

### Step 11: 최종 사용자 승인
워크플로우 완료를 위해 최종 승인을 요청합니다.

**질문:**
```
리뷰 및 문서화가 완료되었습니다.
작업을 완료할까요?
```

**선택지:**
- "완료" (Step 12로 진행)
- "추가 작업 필요" (필요한 작업 명시)

### Step 12: 완료
최종 완료 요약을 제시합니다:

```
🎉 작업 완료: [feature name]

📁 생성된 파일:
- docs/[feature]/user-story.md
- docs/[feature]/brief.md
- docs/[feature]/work-plan.md
- src/modules/[module]/...
- tests/unit/[module]/...
- API 문서

✅ 다음 단계:
1. 테스트 실행: pnpm test
2. 마이그레이션 실행 (필요시): pnpm drizzle-kit migrate
3. 서버 실행: pnpm dev
4. API 문서 확인
```

## 에러 처리

단계 실패 시:
1. 즉시 워크플로우 중단
2. 실패한 단계명과 함께 사용자에게 에러 보고
3. 재시도 또는 중단 여부 확인

**에러 메시지 예시:**
```
❌ Step 2-4 (Plan 모드) 실패: [error details]

다음 중 선택해주세요:
- 재시도
- 수정 후 재시도
- 중단
```

## 출력 디렉토리 구조

모든 산출물은 `docs/[feature]/`에 저장됩니다:

```
docs/
└── [feature]/
    ├── user-story.md      # Step 2-4: 요구사항 분석 (Plan 모드)
    ├── brief.md           # Step 2-4: 기술 설계 (Plan 모드)
    ├── work-plan.md       # Step 2-4: 작업 분배 (Plan 모드)
    └── api-doc.yaml       # Step 10: API 문서 (OpenAPI 3.0)
```

구현 파일은 프로젝트 구조를 따릅니다:
```
src/modules/[module]/
tests/unit/[module]/
```

## 사용 예시

**예시 1: 간단한 기능**
```
사용자: /dev "Refresh Token 추가"

프로세스:
1. 기능명 추출: refresh-token
2-4. Plan 모드 진입
   - 요구사항 분석 → docs/refresh-token/user-story.md
   - 기술 설계 → docs/refresh-token/brief.md
   - 작업 분배 → docs/refresh-token/work-plan.md
   - 사용자 승인 요청
5. Senior Dev가 핸들러와 테스트 구현
6. Junior Dev가 라우터 생성
7. 구현 요약 제시
8. 사용자가 리뷰 단계 승인
9. Independent Reviewer가 구현 검증
10. API Documenter가 OpenAPI 명세 생성
11. 사용자가 최종 승인
12. 완료 요약 제시
```

**예시 2: 복잡한 기능**
```
사용자: /dev "사용자 프로필 조회, 수정, 삭제 API"

프로세스:
1. 기능명 추출: user-profile-api
2-12. 예시 1과 동일한 워크플로우
```

## 중요 사항

### Plan 모드
- Step 2-4에서는 EnterPlanMode를 호출하여 계획 수립
- 요구사항 분석, 기술 설계, 작업 분배를 Plan 모드에서 직접 수행
- ExitPlanMode로 사용자 승인 요청
- 모든 문서 작성은 한국어로 진행

### 서브에이전트 호출
- Task 도구를 적절한 subagent_type과 함께 사용
- 각 서브에이전트 완료 대기 후 다음 단계 진행
- 서브에이전트 에러 캡처 및 처리

### 파일 구성
- 기능명이 docs/ 하위 디렉토리 결정
- 일관성을 위해 kebab-case 사용
- 시작 전 docs/[feature]/ 존재 여부 확인

### 사용자 상호작용
- 사용자 승인을 위한 워크플로우 중단: Step 2-4 (설계), Step 8 (리뷰 단계), Step 11 (최종)
- 각 단계마다 명확한 진행 상황 업데이트 제공
- 모든 메시지에 파일 위치 표시
- 모든 커뮤니케이션은 한국어로 진행

### 에러 복구
- 재시도 시 완료된 단계 보존
- 재시도 전 사용자가 요구사항 수정 가능
- 디버깅을 위한 명확한 에러 컨텍스트 제공

### CLAUDE.md 준수
- 예외 처리: AppException 계층 구조
- API Response: camelCase, null 처리, ISO-8601
- 로깅: Domain Probe 패턴
- DB 설계: 테이블/컬럼 주석, FK 제약조건 제거
- JSDoc: 모든 코드에 한국어 주석