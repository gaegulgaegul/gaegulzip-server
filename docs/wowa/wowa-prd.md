# WOWA (오와) – 크로스핏 WOD 알리미 MVP PRD (합의 기반 모델)

## 1. 제품 개요 (Overview)

**제품명**: WOWA (오와)

**한 줄 설명**:
박스 구성원 누구나 WOD를 등록·수정할 수 있고, 시스템은 판단하지 않으며 **합의된 WOD를 기준으로 기록과 선택을 돕는** 크로스핏 WOD 알리미

---

## 2. 문제 정의 (Problem)

* WOD는 보통 코치가 정하지만, 실제 현장에서는:

    * 화이트보드 오타
    * 코치 간 전달 오류
    * 스케일/구성 해석 차이
    * SNS·메신저·구두 전달 등 정보 파편화
* "누가 맞는 WOD인가"를 시스템이 판단하려 하면:

    * 코치 인증
    * 권한 관리
    * 운영 비용
      → MVP 단계에서 과도한 복잡성 발생

**WOWA의 선택**:

> 역할(코치/회원)을 구분하지 않고,
> **먼저 등록된 WOD + 합의 과정**을 통해 기준을 만든다.

---

## 3. 핵심 설계 원칙 (Design Principles)

1. **권한이 아닌 사실 기반**

    * 누가 코치인지 판단하지 않는다
2. **시스템 중립성**

    * WOWA는 WOD의 옳고 그름을 판단하지 않는다
3. **개인 선택 존중**

    * 모든 사용자는 자신이 기록할 WOD를 직접 선택한다
4. **기록 불변성**

    * 한 번 선택된 WOD 기록은 이후 변경되지 않는다

---

## 4. 핵심 개념 정의 (Core Concepts)

### 4.1 Box + Date 단위 WOD

* WOD는 반드시 **박스 + 날짜** 단위로 관리된다

### 4.2 Base WOD (기준 WOD)

* 해당 날짜, 해당 박스에서 **가장 먼저 등록된 WOD**
* 기본적으로 모든 사용자에게 노출되는 WOD

### 4.3 Personal WOD (개인 WOD)

* Base WOD와 다르다고 판단하여 개인이 업로드한 WOD
* Base에는 영향을 주지 않음

### 4.4 Proposed Change (변경 제안)

* Personal WOD 중 Base와 구조적으로 다른 경우
* 최초 등록자에게 알림이 전달됨

---

## 5. 핵심 사용자 시나리오 (User Flow)

### 5.1 최초 WOD 등록

1. 사용자가 날짜의 첫 WOD 업로드
2. 해당 WOD는 자동으로 **Base WOD**가 됨
3. 박스 구성원에게 알림

   > "오늘 WOD가 등록되었습니다"

---

### 5.2 개인 WOD 업로드

1. 사용자가 기존 Base WOD와 다른 WOD 업로드
2. 시스템은 자동으로 **Personal WOD**로 분류
3. 최초 등록자에게 알림

   > "오늘 WOD가 다르게 등록된 것 같습니다"

---

### 5.3 변경 승인 / 미승인

* **승인 시**

    * Personal WOD → Base WOD로 승격
    * 기존 Base 선택자에게 알림

* **미승인 또는 무응답**

    * Base WOD 유지
    * Personal WOD는 개인 선택용으로 존속

> ⚠️ 자동 승인 없음 (합의 모델 유지)

---

### 5.4 WOD 선택 및 기록

* 사용자는 다음 중 하나를 선택

    * Base WOD
    * Personal WOD

* 선택 결과는 기록 시점에 고정

* 이후 Base WOD가 변경되어도 기존 기록은 유지

---

## 6. 기능 요구사항 (Functional Requirements)

### 6.1 WOD 등록

* 텍스트 입력
* 이미지 업로드 (화이트보드)
* OCR + AI 분석 (실패 시 수동 편집)

---

### 6.2 WOD 구조화 포맷

```json
{
  "type": "AMRAP",
  "time": 15,
  "movements": [
    {"name": "Pull-up", "reps": 10},
    {"name": "Push-up", "reps": 20},
    {"name": "Air Squat", "reps": 30}
  ]
}
```

---

### 6.3 난이도 표시 (참고 지표)

* 시스템 계산 난이도는 **참고용**
* 기록 선택에 영향 주지 않음

---

### 6.4 알림 규칙 (MVP)

* Base WOD 최초 등록
* Personal WOD가 Base와 다를 때
* Base WOD 변경 승인 시

---

## 7. 데이터 모델 (초안)

### wod

* id
* box_id
* date
* program_data (jsonb)
* is_base
* created_by
* created_at

### wod_selection

* user_id
* wod_id
* date
* created_at

---

## 8. 성공 지표 (Success Metrics)

* 최초 WOD 등록 후 조회율
* Personal WOD 발생 비율
* Base 변경 승인율
* 사용자 선택 완료율

---

## 9. MVP 출시 기준 (Definition of Done)

* 역할 구분 없이 WOD 등록 가능
* Base / Personal WOD 자동 분리
* 변경 제안 및 승인 흐름 존재
* 사용자가 기록할 WOD를 직접 선택 가능

---

## 10. 향후 확장 방향 (Next Step)

* Box 신뢰도 시스템
* 코치 배지 (선택적)
* 변경 히스토리 시각화
* 커뮤니티 합의 지표

---

> WOWA는 **"정답을 정하는 앱"이 아니라
> "현장의 합의를 기록하는 도구"**다.
