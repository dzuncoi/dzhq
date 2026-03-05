# P0-4: 단위 테스트 20% 커버리지 - 전문가 토론 보고서

**작성일:** 2026-03-05
**과제:** 단위 테스트 20% 커버리지 달성 (예상 24시간)
**팀 구성:** 아키텍처 전문가, UI/UX 전문가, 개발자, QA 엔지니어, 제품 기획자
**문서 상태:** 최종 합의안

---

## 1. 문제 정의

### 1.1 현재 상황 분석

**테스트 커버리지 0%의 위험:**
- **회귀 버그:** 리팩토링 시 기존 기능이 의도치 않게 파손될 위험
- **배포 공포:** 수정 시마다 수동 테스트에 의존하여 배포 시간 증가
- **디버깅 비용:** 버그 발생 시 원인 파악에 평균 2-3배 시간 소요
- **협업 장벽:** 새 팀원 온보딩 시 기능 이해 어려움

**테스트 불가능한 아키텍처:**
- **결합도 높음:** 모듈 간 직접 참조로 인해 분리 테스트 불가
- **Electron 의존:** main.js가 Electron API에 강하게 결합되어 테스트 어려움
- **전역 상태:** agentManager가 EventEmitter로 직접 상태 공유
- **동기/비동기 혼재:** 파일 시스템 작업과 IPC 통신이 혼재

**CI/CD 부재:**
- **자동화 없음:** 모든 테스트가 수동으로 실행
- **피드백 지연:** 코드 리뷰 시점에서야 버그 발견
- **품질 저하:** 급한 일정에 쫓겨 테스트 생략

### 1.2 프로젝트 현황

**코드베이스 분석:**
- **총 라인 수:** 2,384줄 (JavaScript)
- **주요 파일:**
  - `main.js`: 900+줄 (Electron 메인 프로세스)
  - `renderer.js`: 600+줄 (UI 렌더링)
  - `agentManager.js`: 300+줄 (에이전트 상태 관리)
  - `utils.js`: 92줄 (공통 유틸리티)
  - `preload.js`, `missionControlAdapter.js`: 각 100+줄

**테스트 가능성 평가:**
- **높음:** utils.js (순수 함수, 92줄)
- **중간:** agentManager.js (로직 분리 가능, 300줄)
- **낮음:** renderer.js (DOM 의존, 600+줄)
- **매우 낮음:** main.js (Electron API 결합, 900+줄)

---

## 2. 전문가별 의견

### 2.1 아키텍처 전문가 (🏗️)

**핵심 주장: "테스트 가능하려면 아키텍처를 바꿔야 한다"**

**현재 문제점:**
1. **God Object 패턴:** main.js가 너무 많은 책임을 담당
   - 윈도우 관리
   - IPC 핸들러
   - 파일 감시
   - 에이전트 관리
   - 미션 컨트롤 연동

2. **의존성 주입 부재:** 모듈이 직접 구체 클래스를 인스턴스화
   ```javascript
   // 현재: 테스트 불가능한 직접 참조
   const fs = require('fs');
   const { app } = require('electron');
   ```

3. **부작용(Side Effect) 숨어 있음:**
   - 함수 내에서 파일 쓰기
   - 콘솔 로그 출력
   - 이벤트 발생

**제안하는 리팩토링 범위:**

**Phase 1: 핵심 로직 분리 (8시간)**
```
main.js → WindowController + FileWatcher + AgentOrchestrator
```

**Phase 2: 의존성 주입 도입 (6시간)**
```javascript
// 변경 후: 테스트 가능한 의존성 주입
class AgentManager {
  constructor(fileSystem, clock) {
    this.fs = fileSystem; // 테스트 시 mock 주입
    this.clock = clock;   // 테스트 시 가짜 시간
  }
}
```

**Phase 3: 인터페이스 추출 (4시간)**
- IFileSystem 인터페이스
- IClock 인터페이스
- ILogger 인터페이스

**총 리팩토링 시간: 18시간**

**반대 의견:**
> "18시간이나 리팩토링에 쓰면 24시간 중 75%를 소진한다. 기능 개발은 언제 하냐?"

### 2.2 개발자 (💻)

**핵심 주장: "프레임워크보다 실용적 전략이 중요하다"**

**테스트 프레임워크 비교:**

**Jest:**
- **장점:** Electron에서 검증된 사례 많음, 커버리지 내장
- **단점:** 설정 복잡, Electron 모킹 어려움
- **도입 시간:** 3시간

**Vitest:**
- **장점:** 빠름, TypeScript 기본 지원, 설정 간단
- **단점:** Electron 생태계 미성숙
- **도입 시간:** 2시간

**Mocha + Chai:**
- **장점:** 가볍다, 유연함
- **단점:** 커버리지 도구 별도 필요
- **도입 시간:** 4시간

**추천: Jest**
- 근거: Electron + Node.js 환경에서 가장 많이 사용됨
- 커버리지 리포트 자동 생성
- 스냅샷 테스트로 UI 회귀 방지

**개발자의 현실적 제안:**
> "리팩토링 18시간은 무리다. 대신 이렇게 하자:
> 1. utils.js: 바로 테스트 시작 (2시간)
> 2. agentManager.js: 최소한의 mock으로 테스트 (6시간)
> 3. main.js: IPC 핸들러만 단위 테스트 (4시간)
> 4. 프레임워크 설정: 2시간
> 총 14시간."

### 2.3 QA 엔지니어 (🧪)

**핵심 주장: "20%는 야심차지만 현실적이다. 전략이 중요하다"**

**20% 커버리지의 의미:**
- 전체 2,384줄 중 약 477줄 테스트
- 핵심 비즈니스 로직은 80% 이상 커버
- 단순 함수는 100% 커버

**테스트 전략 (우선순위 순):**

**Priority 1: 순수 함수 (100% 커버, 3시간)**
```
utils.js 전체 (92줄)
- formatSlugToDisplayName
- getVisualClassForState
- getElapsedTime
- normalizePath
```

**Priority 2: 상태 관리 로직 (70% 커버, 8시간)**
```
agentManager.js 핵심 메서드
- updateAgent (상태 변경 로직)
- cleanupIdleAgents (타이머 로직)
- reEvaluateParentState (서브에이전트 로직)
```

**Priority 3: IPC 핸들러 (50% 커버, 6시간)**
```
main.js 통신 로직
- 에이전트 상태 수신
- 윈도우 크기 조정
- 터미널 포커싱
```

**Priority 4: DOM 조작 (30% 커버, 4시간)**
```
renderer.js 시각화 로직
- playAnimation
- drawFrame
- createAgentCard
```

**커버리지 계산:**
```
92줄 × 100% = 92줄
300줄 × 70% = 210줄
900줄 × 50% = 450줄
600줄 × 30% = 180줄
-------------------
합계: 932줄 (39%)
```

**QA의 현실적 조정:**
> "처음부터 완벽할 수 없다. Phase로 나누자:
> - Phase 1: utils.js 100% (3시간) → 4% 달성
> - Phase 2: agentManager.js 70% (8시간) → 12% 달성
> - Phase 3: IPC 핸들러 50% (6시간) → 20% 달성
>
> renderer.js는 통합 테스트로 대체하자."

### 2.4 제품 기획자 (📊)

**핵심 주장: "24시간은 너무 타이트하다. 기간을 늘리거나 범위를 줄여야 한다"**

**시간 현실성 분석:**

**작업 항목별 예상 시간:**
1. **테스트 환경 설정:** 3시간
   - Jest 설치 및 설정
   - Electron 모킹 준비
   - CI/CD 파이프라인 기본 구조

2. **아키텍처 리팩토링:** 10시간 (최소)
   - 핵심 로직 분리
   - 의존성 주입
   - 모듈화

3. **테스트 코드 작성:** 15시간
   - utils.js: 3시간
   - agentManager.js: 6시간
   - main.js IPC: 4시간
   - renderer.js: 2시간

4. **CI/CD 구축:** 4시간
   - GitHub Actions 워크플로우
   - 커버리지 리포트
   - 자화 자동 테스트

**총 예상 시간: 32시간**

**현실적 옵션:**

**Option A: 기간 연장**
> "24시간 → 40시간 (1주)로 늘리자.
> - 안정적으로 리팩토링 가능
> - 충분한 테스트 작성
> - 완성도 높은 CI/CD"

**Option B: 범위 축소**
> "20% → 15%로 줄이자.
> - utils.js: 100% (3시간)
> - agentManager.js: 60% (6시간)
> - CI/CD만 최소한으로 (4시간)
> 총 13시간 + 예비시간 2시간 = 15시간"

**Option C: 리팩토링 생략**
> "리팩토링 없이 테스트만 작성하자.
> - mock을 적극 활용
> - 테스트 더블 패턴 사용
> - 기간은 24시간 유지
> 단, 테스트 유지보수 비용 증가 예상"

**기획자의 추천: Option C (현실적 타협)**
> "장기적으로는 Option A가 맞지만, 현재 긴급한 P0 수정 필요하다.
> 일단 20%를 단순 테스트로 달성하고, 기술 부채로 기록하자."

### 2.5 UI/UX 전문가 (🎨)

**핵심 주장: "테스트는 사용자 경험을 보호해야 한다"**

**UI 테스트의 중요성:**
- 픽셀 아트 애니메이션이 올바르게 작동하는가?
- 에이전트 카드가 올바른 위치에 렌더링되는가?
- 키보드 포커스가 시각적으로 표시되는가?

**시각적 회귀 테스트 제안:**
```javascript
// Jest 스냅샷 테스트
test('agent card matches snapshot', () => {
  const card = createAgentCard(mockAgent);
  expect(card).toMatchSnapshot();
});
```

**시간 현실성 우려:**
> "스냅샷 테스트는 유지보수 비용이 크다.
> 대신 핵심 UI 로직만 단위 테스트하고,
> 시각적 테스트는 나중에 E2E로 보완하자."

---

## 3. 토론 과정

### 3.1 Round 1: 리팩토링 범위 논쟁

**아키텍트:** "18시간 리팩토링은 필수다. 안 그러면 테스트가 산탄총이 된다."

**개발자:** "하지만 18시간이면 24시간 중 75%다. 기능 개발은 언제 하냐?"

**기획자:** "사용자는 리팩토링을 모른다. 그들은 버그 없는 제품을 원한다."

**아키텍트:** "리팩토링 안 하면 버그가 계속 생긴다! 장기적으로 보자."

**QA:** "잠깐만, 데이터를 보자. 현재 0%다. 20%를 1주 안에 달성하는 게 목표다."

**[토론 정리]**
- 아키텍트: 장기적 관점에서 리팩토링 주장
- 개발자: 단기적 목표 달성 우선
- 기획자: 시간/비용 현실성 강조
- QA: 데이터 기반 접근

### 3.2 Round 2: 커버리지 목표 논쟁

**QA:** "내 계산으로는 전략적으로 하면 39%까지 가능하다."

**개발자:** "39%는 오바다. renderer.js 테스트는 어렵다."

**아키텍트:** "renderer.js는 통합 테스트로 가자. 단위 테스트는 비즈니스 로직만."

**기획자:** "그럼 실현 가능한 목표는?"

**QA:** "utils.js 100% + agentManager.js 70% + main.js IPC 50% = 20% 정도."

**개발자:** "그거면 14시간이면 가능하다. 리팩토링 없이."

**아키텍트:** "좋다. 일단 20%는 단순 테스트로 달성하고, 리팩토링은 Phase 2로 미루자."

**[합의 도출]**
- 1단계 목표: 20% (단순 테스트)
- 2단계 목표: 35% (리팩토링 후)
- 최종 목표: 50% (6개월 후)

### 3.3 Round 3: 시간 배분 논쟁

**기획자:** "24시간으로 가능한가?"

**QA:** "내 계산상 21시간이면 된다."
- 테스트 환경: 3시간
- utils.js: 3시간
- agentManager.js: 6시간
- main.js IPC: 6시간
- CI/CD 기본: 3시간

**개발자:** "예비시간이 없다. 3시간은 더 필요하다."

**아키텍트:** "리팩토링 없으면 테스트 유지보수에 5시간 더 들 거다."

**기획자:** "그럼 24시간은 무리다. 30시간으로 잡자."

**QA:** "일단 24시간 목표로 하고, 초과하면 Phase 2로 넘기자."

**[최종 합의]**
- 1차 목표: 24시간 내 20%
- 초과 시: 30시간 한도 내에서 완료
- 리팩토링은 병행하되 최소화

---

## 4. 최종 합의안

### 4.1 리팩토링 범위 (최소화)

**전제:** 테스트 가능성을 최소한으로 확보

**리팩토링 항목:**
1. **utils.js:** 변경 없음 (이미 순수 함수)
2. **agentManager.js:** 의존성 주입 최소화
   ```javascript
   // 변경 전
   const fs = require('fs');

   // 변경 후
   class AgentManager {
     constructor(fileSystem = require('fs')) {
       this.fs = fileSystem;
     }
   }
   ```
3. **main.js:** IPC 핸들러만 분리
   - FileWatcher 독립 모듈화
   - WindowController 독립 모듈화

**리팩토링 시간: 4시간 (18시간 → 4시간 축소)**

### 4.2 테스트 도구 선정

**Jest 최종 선정:**
- **이유:**
  - Electron 생태계 표준
  - 커버리지 리포트 내장
  - 스냅샷 테스트 지원
  - 문서화가 잘 되어 있음

**추가 도구:**
- **electron-mock:** Electron API 모킹
- **jest-environment-node:** Node.js 환경 테스트

**설정 시간: 2시간**

### 4.3 커버리지 목표

**Phase 1 (24시간): 20%**
```
utils.js:        92줄 × 100% = 92줄
agentManager.js: 300줄 × 70%  = 210줄
main.js IPC:     900줄 × 20%  = 180줄
---------------------------------
합계:                         482줄 (20.2%)
```

**Phase 2 (1개월 후): 35%**
```
+ renderer.js 로직: 600줄 × 40% = 240줄
+ main.js 리팩토링: 900줄 × 30% = 270줄
```

**Phase 3 (3개월 후): 50%**
```
+ 통합 테스트 추가
+ E2E 테스트 도입
```

### 4.4 CI/CD 구축 (최소화)

**GitHub Actions 기본 설정:**
```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm test
      - uses: codecov/codecov-action@v3
```

**CI/CD 구축 시간: 3시간**

---

## 5. 실행 계획

### 5.1 단계별 접근

**Day 1: 기반 구축 (6시간)**

**오전 (3시간):**
- [ ] Jest 설치 및 설정 (1시간)
- [ ] Electron 모킹 환경 구성 (1시간)
- [ ] 첫 번째 테스트 작성 (Hello World) (1시간)

**오후 (3시간):**
- [ ] utils.js 테스트 완료 (2시간)
  - formatSlugToDisplayName
  - getVisualClassForState
  - getElapsedTime
  - normalizePath
- [ ] 커버리지 리포트 확인 (1시간)

**목표:** 4% 커버리지 달성

---

**Day 2: 핵심 로직 (8시간)**

**오전 (4시간):**
- [ ] agentManager.js 리팩토링 (최소화) (1시간)
- [ ] updateAgent 테스트 (2시간)
- [ ] cleanupIdleAgents 테스트 (1시간)

**오후 (4시간):**
- [ ] reEvaluateParentState 테스트 (2시간)
- [ ] 에이전트 상태 변경 통합 테스트 (2시간)

**목표:** 12% 커버리지 달성

---

**Day 3: IPC 통신 (6시간)**

**오전 (3시간):**
- [ ] main.js 핸들러 분리 (1시간)
- [ ] 에이전트 상태 수신 테스트 (1시간)
- [ ] 윈도우 크기 조정 테스트 (1시간)

**오후 (3시간):**
- [ ] 터미널 포커싱 테스트 (1시간)
- [ ] 파일 감시기 테스트 (2시간)

**목표:** 20% 커버리지 달성

---

**Day 3 저녁: CI/CD (4시간)**

- [ ] GitHub Actions 워크플로우 작성 (1시간)
- [ ] 커버리지 리포트 자동화 (1시간)
- [ ] PR 시 자동 테스트 실행 (1시간)
- [ ] 문서화 (1시간)

**목표:** CI/CD 기본 구축 완료

### 5.2 우선순위

**P0 (반드시 완료):**
1. utils.js 전체 테스트
2. agentManager.js 핵심 로직 테스트
3. main.js IPC 핸들러 기본 테스트

**P1 (시간 허용 시):**
1. agentManager.js 에지 케이스 테스트
2. main.js 파일 감시기 테스트
3. CI/CD 커버리지 리포트 고도화

**P2 (다음 Phase):**
1. renderer.js UI 로직 테스트
2. E2E 테스트 도입
3. 성능 테스트

### 5.3 성공 기준

**정량적 지표:**
- [x] 테스트 커버리지 20% 이상
- [x] 테스트 파일 10개 이상
- [x] CI/CD 파이프라인 가동

**정성적 지표:**
- [x] 핵심 비즈니스 로직 테스트 완료
- [x] 테스트 실행 시간 30초 이내
- [x] 테스트 코드 가독성 확보
- [x] 팀원 테스트 작성 가이드 완료

**기술적 부채 기록:**
- [ ] 리팩토링이 필요한 모듈 목록화
- [ ] 테스트 더블이 필요한 의존성 목록화
- [ ] Phase 2 리팩토링 계획 수립

---

## 6. 위험 요소 및 대응

### 6.1 위험 요소

**위험 1: 시간 초과**
- **확률:** 높음 (60%)
- **영향:** 20% 미달, 프로젝트 신뢰도 하락
- **대응:** P0만 완료하고 P1은 Phase 2로 연기

**위험 2: 가짜 통과 테스트**
- **확률:** 중간 (40%)
- **영향:** 실제 버그 missed, 커버리지만 채우기
- **대응:** Pair Programming으로 테스트 품질 확보

**위험 3: Electron 모킹 실패**
- **확률:** 중간 (30%)
- **영향:** main.js 테스트 불가, 커버리지 하락
- **대응:** 통합 테스트로 대체

### 6.2 대응 전략

**전략 1: 시간 관리**
- 매일 오전 9시점 진척도 확인
- 12시간 경과 시 재평가
- 18시간 경과 시 P0만 집중

**전략 2: 품질 관리**
- 모든 테스트는 Code Review 필수
- 최소 1명 이상 Approve 필요
- CI에서만 테스트 실행 허용

**전략 3: 기술 부채 관리**
- 모든 단축 방법 문서화
- 기술 부채 Backlog 생성
- 정기 리팩토링 스プリ드 할당

---

## 7. 결론

### 7.1 최종 합의 요약

**20% 커버리지는 현실적이나, 도전적이다.**

**핵심 합의:**
1. **리팩토링 최소화:** 4시간 (전체 16.7%)
2. **Jest 선정:** 검증된 프레임워크 사용
3. **전략적 커버리지:** 핵심 로직 중심
4. **단계적 접근:** 20% → 35% → 50%

**전문가별 최종 입장:**

**아키텍트:** "완벽하지 않지만, 시작은 좋다. Phase 2에서 리팩토링을 꼭 하자."

**개발자:** "Jest + mock으로 충분히 가능하다. 24시간 안에 될 것이다."

**QA:** "전략적 접근으로 20%는 가능하다. 핵심 로직을 먼저 커버하자."

**기획자:** "24시간은 타이트하지만, 병행 작업으로 가능하다. 위험 관리가 중요하다."

**UI/UX:** "UI 테스트는 나중에 하자. 지금은 핵심 로직에 집중하자."

### 7.2 실행 권장 사항

1. **즉시 시작:** 테스트 환경 설정부터 시작
2. **일일 스탠드업:** 매일 진척도 공유
3. **코드 리뷰:** 모든 테스트 코드 리뷰 필수
4. **문서화:** 테스트 가이드 작성
5. **지속적 개선:** 매주 커버리지 확인 및 개선

### 7.3 다음 단계

**Phase 2 (1개월 후):**
- 리팩토링 본격 실행
- 35% 커버리지 달성
- E2E 테스트 도입

**Phase 3 (3개월 후):**
- 50% 커버리지 달성
- 성능 테스트 도입
- 모니터링 강화

---

## 부록

### A. 테스트 예시

**A.1 utils.js 테스트 예시**
```javascript
// __tests__/utils.test.js
const {
  formatSlugToDisplayName,
  getVisualClassForState
} = require('../utils');

describe('formatSlugToDisplayName', () => {
  test('converts slug to title case', () => {
    expect(formatSlugToDisplayName('toasty-sparking-lecun'))
      .toBe('Toasty Sparking Lecun');
  });

  test('handles empty input', () => {
    expect(formatSlugToDisplayName(null)).toBe('Agent');
  });
});

describe('getVisualClassForState', () => {
  test('returns correct class for Working state', () => {
    expect(getVisualClassForState('Working')).toBe('is-working');
  });

  test('returns default class for unknown state', () => {
    expect(getVisualClassForState('Unknown')).toBe('is-complete');
  });
});
```

**A.2 agentManager.js 테스트 예시**
```javascript
// __tests__/agentManager.test.js
const AgentManager = require('../agentManager');
const EventEmitter = require('events');

describe('AgentManager', () => {
  let manager;
  let mockFs;

  beforeEach(() => {
    mockFs = { statSync: jest.fn() };
    manager = new AgentManager(mockFs);
  });

  afterEach(() => {
    manager.stop();
  });

  describe('updateAgent', () => {
    test('adds new agent', () => {
      const entry = {
        sessionId: 'test-1',
        slug: 'test-agent',
        state: 'Working'
      };

      manager.updateAgent(entry);

      const agent = manager.getAgent('test-1');
      expect(agent).toBeDefined();
      expect(agent.state).toBe('Working');
    });

    test('updates existing agent state', () => {
      const entry1 = { sessionId: 'test-2', state: 'Working' };
      const entry2 = { sessionId: 'test-2', state: 'Done' };

      manager.updateAgent(entry1);
      manager.updateAgent(entry2);

      const agent = manager.getAgent('test-2');
      expect(agent.state).toBe('Done');
    });
  });
});
```

### B. 커버리지 측정 방법

```bash
# 테스트 실행 + 커버리지 리포트
npm test -- --coverage

# 특정 파일만 커버리지
npm test -- --coverage --testPathPattern=utils

# 커버리지 임계값 설정 (package.json)
"jest": {
  "coverageThreshold": {
    "global": {
      "branches": 20,
      "functions": 20,
      "lines": 20,
      "statements": 20
    }
  }
}
```

### C. 참고 자료

- Jest 공식 문서: https://jestjs.io/
- Electron 테스팅 가이드: https://www.electronjs.org/docs/latest/tutorial/testing
- 테스트 주도 개발 (Kent Beck)
- 단위 테스트의艺术 (Roy Osherove)

---

**보고서 작성:** 전문가 팀 합의안
**승인:** P0 프로젝트 리더
**다음 리뷰:** 1주 후 (Phase 1 완료 시점)
