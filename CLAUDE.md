# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

gaegulzip-server는 Kotlin + Spring Boot 3.5 기반의 서버 애플리케이션입니다.

**기술 스택:**
- Kotlin 1.9.25, Java 21
- Spring Boot 3.5.9 (Web, Data JPA, Security, Actuator)
- Spring Modulith (모듈러 모놀리스 아키텍처)
- Spring AI MCP Server (WebMVC)
- H2 Database (개발/테스트용)

## Build & Run Commands

```bash
# 빌드
./gradlew build

# 테스트 실행
./gradlew test

# 단일 테스트 클래스 실행
./gradlew test --tests "xyz.gaegulzip.SomeTestClass"

# 단일 테스트 메소드 실행
./gradlew test --tests "xyz.gaegulzip.SomeTestClass.testMethodName"

# 애플리케이션 실행
./gradlew bootRun

# 클린 빌드
./gradlew clean build
```

## Architecture

Spring Modulith를 사용하여 모듈러 모놀리스 구조로 설계됩니다.

**패키지 구조:** `xyz.gaegulzip`

**JPA 엔티티 설정:**
- `@Entity`, `@MappedSuperclass`, `@Embeddable` 클래스는 `allOpen` 플러그인으로 자동 open 처리됨

## Feature Planning Rules

- `feature-planner` 스킬 실행 시 단위 테스트(Unit Test)를 기반으로 계획을 작성한다.
- 통합 테스트, E2E 테스트 등 다른 종류의 테스트는 사용자가 명시적으로 언급하지 않으면 계획에 추가하지 않는다.

## Principles

### 개발 원칙 (전체 프로젝트 공통)

#### 1. TDD (Test-Driven Development)
- **Red → Green → Refactor** 사이클 준수
- 실패하는 테스트 먼저 작성 (Red)
- 테스트를 통과하는 최소한의 코드 구현 (Green)
- 테스트 통과 후 리팩토링 (Refactor)
- **테스트 실행 시 작업 중인 테스트만 실행** (`--tests "ClassName.methodName"`)

#### 2. Tidy First (구조 변경 우선)
- **구조적 변경**과 **동작적 변경**을 분리
- 구조적 변경 (리팩토링, 이름 변경, 코드 이동) → 먼저 커밋
- 동작적 변경 (기능 추가, 버그 수정) → 별도 커밋
- 한 커밋에 두 종류의 변경을 섞지 않음

#### 3. 커밋 규칙
- 모든 테스트가 통과할 때만 커밋
- 컴파일러/린터 경고가 모두 해결된 상태에서 커밋
- 작은 단위로 자주 커밋
- 커밋 메시지에 구조적/동작적 변경 여부 명시

#### 4. 코드 품질 기준
- 중복 제거 (DRY 원칙)
- 명확한 네이밍으로 의도 표현
- 의존성 명시적 선언
- 메서드는 단일 책임만 가짐
- 상태와 부수효과 최소화
