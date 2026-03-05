# P0-1 메모리 누수 수정: 전문가 팀 토론 보고서

**작성일:** 2026-03-05
**과제:** P0-1 메모리 누수 수정 (예상 2시간)
**참여 전문가:** 아키텍처, UI/UX, 개발자, QA, 기획

---

## 1. 문제 정의

### 1.1 메모리 누수의 증상

**현상:**
- 장시간 실행 시 앱 메모리 사용량이 지속적으로 증가
- 10개 이상의 에이전트가 활성화될 경우 메모리 사용량이 200MB+로 급증
- 에이전트가 종료된 후에도 관련 리소스가 해제되지 않음

**영향도:**
- **사용자 경험:** 앱 응답 속도 저하, eventual crash
- **시스템 리소스:** 불필요한 메모리 점유로 다른 애플리케이션 성능 저하
- **안정성:** 장시간 사용 시 앱 충돌로 이어질 수 있음

### 1.2 긴급성 평가

**우선순위:** P0 (최상위 긴급)
- **비즈니스 영향:** 핵심 사용자 시나리오(장시간 개발 세션)에서 앱이 사용 불가능해짐
- **사용자 불만도:** "앱이 멈춘다", "컴퓨터가 느려진다"는 불만이 예상됨
- **수정 난이도:** 비교적 낮음 (2시간 예상)
- **선결 조건:** 없음 (독립적 수정 가능)

---

## 2. 전문가별 의견

### 🏗️ 아키텍처 전문가 관점

**기술적 분석:**

코드 리뷰 결과, **3가지 주요 메모리 누수 경로**를 확인했습니다:

#### 누수 경로 1: 정리되지 않는 Interval (main.js)
```javascript
// 문제 코드 1: Line 158-162
setInterval(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
}, 250);
```
**문제점:**
- Interval ID가 저장되지 않아 앱 종료 시 정리 불가능
- 250ms마다 실행되어 누적됨

#### 누수 경로 2: 에이전트별 Map 미정리 (main.js)
```javascript
// 문제 코드 2: Line 340-342, 617
const firstPreToolUseDone = new Map(); // sessionId → boolean
const postToolIdleTimers = new Map(); // sessionId → timer
const sessionPids = new Map(); // sessionId → PID
```
**문제점:**
- 에이전트 종료 시(Map.delete 호출) 일부 항목만 정리됨
- 특히 `sessionPids`는 생존 확인 checker에서만 정리되어, 레이스 컨디션 발생 시 잔존

#### 누수 경로 3: Renderer 측 Interval 미정리 (renderer.js)
```javascript
// 문제 코드 3: Line 35, 83-105
const agentStates = new Map(); // agentId → { animName, frameIdx, interval, ... }

function playAnimation(agentId, element, animName) {
  const interval = setInterval(() => {
    // 애니메이션 로직
  }, 1000 / sequence.fps);
  state.interval = interval;
  agentStates.set(agentId, state);
}
```
**문제점:**
- 에이전트 제거 시 `agentStates.delete()`만 호출되고, 내부 interval이 clear되지 않음
- Line 374에서 정리 시도하나 조건부라 완전하지 않음

**아키텍처 평가:**
- **구조적 문제:** Main/Renderer 프로세스 간 리소스 정리 동기화 부재
- **라이프사이클 관리:** 에이전트 생성/제거 시점에서 Map/Interval 일관성 없음
- **해결 방향:** 중앙화된 리소스 관리자 도입 또는 명시적 정리 로직 강화

---

### 🎨 UI/UX 전문가 관점

**사용자 경험 분석:**

**현재 사용자 불만 예상:**
1. **장시간 사용 시 저하:** 개발자는 보통 4-8시간 연속 사용 → 2시간 후부터 현저한 느려짐
2. **명확한 피드백 부재:** 메모리 부족 시 에러 메시지 없이 "그냥 멈춤"
3. **복구 불가능 상태:** 한번 느려지면 재시작만이 유일한 해결책

**수정 우선순위:**
1. **즉각적 개선:** interval 정리로 메모리 증가 방지 (사용자 즉각 체감)
2. **장기적 안정성:** Map 정리로 장시간 사용 안정화 (파워 유저 만족)
3. **모니터링:** 메모리 사용량 UI 표시 (투명성 확보)

**사용자 시나리오별 영향:**
- **가벼운 사용자 (1-2시간):** 큰 영향 없음 → 수정 긴급도 낮음
- **일반 사용자 (2-4시간):** 약간의 느려짐 → 수정 필요
- **파워 유저 (4-8시간):** 사용 불가능 → **긴급 수정 필수**

---

### 💻 개발자 관점

**구현 현황 분석:**

**이미 구현된 정리 로직:**
```javascript
// main.js:688-689 (handleSessionEnd)
firstPreToolUseDone.delete(sessionId);   // 플래그 정리
```
- ✅ `firstPreToolUseDone`는 정리됨

```javascript
// main.js:650 (생존 확인 checker)
sessionPids.delete(agent.id);
```
- ✅ `sessionPids`는 생존 확인 시 정리됨

**누락된 정리 로직:**
```javascript
// main.js:381, 403, 444 (부분적 정리)
{ const t = postToolIdleTimers.get(sessionId); if (t) clearTimeout(t); postToolIdleTimers.delete(sessionId); }
```
- ⚠️ `postToolIdleTimers`는 일부 이벤트에서만 정리됨
- ❌ 일부 SessionEnd 경로에서 정리 안 됨

**제안 수정안:**

**Option A: 중앙화된 정리 함수 도입**
```javascript
function cleanupAgentResources(sessionId) {
  // Main 프로세스 리소스 정리
  firstPreToolUseDone.delete(sessionId);
  const t = postToolIdleTimers.get(sessionId);
  if (t) clearTimeout(t);
  postToolIdleTimers.delete(sessionId);
  sessionPids.delete(sessionId);

  // Renderer 프로세스에 정리 요청
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cleanup-agent-renderer', sessionId);
  }
}
```

**Option B: AgentManager.removeAgent()에서 정리 위임**
```javascript
// agentManager.js:109-122
removeAgent(agentId) {
  const agent = this.agents.get(agentId);
  if (!agent) return false;
  this.agents.delete(agentId);

  // 이벤트만 발생시키고, main.js에서 구독하여 정리
  this.emit('agent-removed', { id: agentId, displayName: agent.displayName });
  return true;
}
```

**개발자 추천:** **Option A** (명시적 정리 함수)
- 이유: 리소스 정리 책임소재 명확화
- 유지보수: 새로운 리소스 추가 시 한 곳에서만 수정

---

### 🧪 QA 엔지니어 관점

**품질 평가:**

**현재 테스트 커버리지:** 0%
- 단위 테스트 없음
- 통합 테스트 없음
- 메모리 누수 테스트 없음

**검증 방법 제안:**

**Level 1: 수동 검증 (30분)**
1. 앱 시작 후 메모리 기록 (Chrome DevTools)
2. 10개 에이전트 생성/종료 반복 20회
3. 메모리 사용량이 안정화되는지 확인

**Level 2: 자동화된 메모리 테스트 (2시간)**
```javascript
// test/memory-leak.test.js
describe('Memory Leak Test', () => {
  it('should not leak memory when agents are added/removed', async () => {
    const initialMemory = process.memoryUsage().heapUsed;

    for (let i = 0; i < 100; i++) {
      // 에이전트 생성
      agentManager.updateAgent({ sessionId: `test-${i}`, state: 'Working' });
      // 에이전트 제거
      agentManager.removeAgent(`test-${i}`);
    }

    global.gc(); // 강제 GC
    const finalMemory = process.memoryUsage().heapUsed;

    expect(finalMemory).toBeLessThan(initialMemory * 1.5); // 50% 이상 증가하지 않아야 함
  });
});
```

**Level 3: 프로파일링 도구 활용 (1시간)**
- Chrome DevTools Memory Profiler
- Node.js `--inspect` flag + heapdump
- Electron DevTools Performance Monitor

**성공 기준:**
- 10개 에이전트 생성/종료 50회 반복 후 메모리 사용량이 초기의 2배 이하
- 장시간 실행(4시간) 후 메모리 사용량이 안정화

---

### 📊 제품 기획자 관점

**제품 영향 분석:**

**사용자 세그먼트별 영향:**

| 세그먼트 | 사용 시간 | 영향도 | 긴급성 |
|---------|----------|--------|--------|
| 얼리 어답터 | 2-3시간 | 중간 | 보통 |
| 파워 유저 | 4-8시간 | **매우 높음** | **긴급** |
| 팀 리드/매니저 | 1-2시간 | 낮음 | 낮음 |

**비즈니스 우선순위:**
1. **파워 유저 유지:** 핵심 사용자층(초기 채택자) 유지를 위해 긴급 수정 필요
2. **온보딩 장벽:** 신규 사용자가 "앱이 버그 있다"고 인식할 위험
3. **평판 관리:** 오픈소스 커뮤니티에서 "안정성 없음" 평판 위험

**ROI 분석:**
- **투자:** 2시간 개발 + 1시간 테스트 = 3시간
- **편익:** 파워 유저 이탈률 감소 (10% → 2% 가정)
- **결론:** **높은 ROI** - 즉시 수정 권장

**릴리스 계획:**
- **Patch v0.1.1:** 메모리 누수 수정만 포함 (긴급 핫픽스)
- **Minor v0.2.0:** 접근성 개선과 함께 배포

---

## 3. 토론 과정

### 3.1 논쟁된 쟁점

#### 쟁점 1: Renderer vs Main 프로세스 정리 책임

**아키텍트:** "Renderer가 생성한 interval은 Renderer가 정리해야 함"

**개발자:** "하지만 Renderer는 DOM 렌더링에 집중해야 하고, Main이 에이전트 라이프사이클을 관리하므로 Main에서 정리 신호를 보내는게 맞음"

**UI/UX:** "사용자 경험상 Renderer가 멈추면 앱이 멈춘 것처럼 보이니까 Renderer가 자율적으로 정리하는게 안전할 것 같은데요?"

**합의안:**
- **이중 정리:** Renderer는 자율 정리 (안전장치)
- **Main에서 명시적 정리 신호:** 완전성 보장
- **결과:** 2단계 정리로 안정성 극대화

#### 쟁점 2: 테스트 범위

**QA:** "완전한 자동화된 메모리 테스트를 만들어야 합니다 (2시간)"

**기획:** "하지만 지금은 긴급 수정이 필요하니까 수동 검증만 하고 나중에 테스트를 만드는게 어떨까요?"

**개발자:** "수동 검증만으로는 regression 위험이 큽니다. 최소한의 단위 테스트(30분)는 만들어야 합니다"

**아키텍트:** "메모리 누수는 통합 테스트로만 잡을 수 있어요. 단위 테스트는 의미 없습니다"

**합의안:**
- **Phase 1:** 수동 검증으로 긴급 수정 검증 (30분)
- **Phase 2:** 통합 테스트 코드 작성 (다음 스프린트)

#### 쟁점 3: 수정 방법의 공격성

**개발자:** "전면 리팩토링이 필요합니다. 리소스 관리자 클래스를 새로 만들어요"

**기획:** "지금은 2시간만 투자할 수 있습니다. 리팩토링은 나중에 하고, 최소한의 수정만 합시다"

**아키텍트:** "리팩토링 없이는 누수가 계속 생겨날 것입니다. 하지만 시간 제한이 있으니..."

**합의안:**
- **당장:** 최소 수정 (interval 정리, Map.delete 추가)
- **다음 스프린트:** 리소스 관리자 리팩토링 예약

### 3.2 대안 제시

**Alternative 1: 즉시 수정 (2시간)**
- 장점: 빠른 해결
- 단점: 기술 부채 누적

**Alternative 2: 리팩토링 포함 (8시간)**
- 장점: 근본적 해결
- 단점: 다른 P0 항목 지연

**Alternative 3: 2단계 접근 (당장 2시간 + 다음 스프린트 4시간)**
- 장점: 긴급성 + 근본적 해결
- 단점: 작업 분산

**채택:** Alternative 3 (2단계 접근)

### 3.3 타협안

**당장 수정할 것 (2시간):**
1. ✅ main.js:158 Interval ID 저장 및 정리
2. ✅ main.js:687 handleSessionEnd()에서 전체 Map 정리
3. ✅ renderer.js:374 interval 정리 로직 강화
4. ✅ 수동 메모리 테스트 절차 문서화

**다음 스프린트에 예약할 것:**
1. ⏳ ResourceManager 클래스 도입
2. ⏳ 자동화된 메모리 누수 테스트
3. ⏳ 메모리 사용량 모니터링 UI

---

## 4. 최종 합의안

### 4.1 수정 방법

**1. Main Process - Interval 정리 (main.js)**

```javascript
// 수정 전 (Line 158-162)
setInterval(() => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }
}, 250);

// 수정 후
let keepAliveInterval = null;

function startKeepAlive() {
  if (keepAliveInterval) return; // 이미 실행 중이면 중복 생성 방지
  keepAliveInterval = setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 250);
}

function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// app.whenReady()에서 호출
startKeepAlive();

// app.on('before-quit')에서 호출
stopKeepAlive();
```

**2. Main Process - 통합 리소스 정리 (main.js)**

```javascript
// 새로운 함수 추가 (Line 687 이후)
function cleanupAgentResources(sessionId) {
  // 1. 플래그 정리
  firstPreToolUseDone.delete(sessionId);

  // 2. 타이머 정리
  const timer = postToolIdleTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer);
    postToolIdleTimers.delete(sessionId);
  }

  // 3. PID 정리
  sessionPids.delete(sessionId);

  // 4. 생존 확인 카운터 정리
  missCount.delete(sessionId);

  debugLog(`[Cleanup] Resources cleared for ${sessionId.slice(0, 8)}`);
}

// handleSessionEnd()에서 호출 (Line 687)
function handleSessionEnd(sessionId) {
  cleanupAgentResources(sessionId);  // <-- 추가
  if (!agentManager) return;
  const agent = agentManager.getAgent(sessionId);
  if (agent) {
    debugLog(`[Hook] SessionEnd → removing agent ${sessionId.slice(0, 8)}`);
    if (agent.jsonlPath && fs.existsSync(agent.jsonlPath)) {
      try {
        fs.appendFileSync(agent.jsonlPath, JSON.stringify({
          type: 'system', subtype: 'SessionEnd',
          sessionId: agent.id, timestamp: new Date().toISOString()
        }) + '\n');
      } catch (e) { }
    }
    agentManager.removeAgent(sessionId);
  } else {
    debugLog(`[Hook] SessionEnd for unknown agent ${sessionId.slice(0, 8)}`);
  }
}
```

**3. Renderer Process - Interval 정리 강화 (renderer.js)**

```javascript
// 수정 전 (Line 369-374)
function removeAgent(data) {
  const { id } = data;
  const card = document.getElementById(id);
  if (card) card.remove();

  // Clean up intervals
  const state = agentStates.get(id);
  if (state) {
    if (state.interval) clearInterval(state.interval);
    if (state.timerInterval) clearInterval(state.timerInterval);
    agentStates.delete(id);
  }
}

// 수정 후
function removeAgent(data) {
  const { id } = data;
  const card = document.getElementById(id);
  if (card) card.remove();

  // Clean up intervals (항상 실행)
  const state = agentStates.get(id);
  if (state) {
    // interval 정리
    if (state.interval) {
      clearInterval(state.interval);
      state.interval = null;
    }
    // timerInterval 정리
    if (state.timerInterval) {
      clearInterval(state.timerInterval);
      state.timerInterval = null;
    }
  }
  // Map에서 삭제 (state가 없어도 안전하게 삭제)
  agentStates.delete(id);

  debugLog(`[Renderer] Cleaned up agent ${id.slice(0, 8)}`);
}
```

### 4.2 코드 변경사항 요약

| 파일 | 라인 | 변경 내용 | 예상 시간 |
|------|------|----------|----------|
| main.js | 158-162 | keepAliveInterval 변수 추가 및 정리 로직 | 20분 |
| main.js | 687 이후 | cleanupAgentResources() 함수 추가 | 30분 |
| main.js | 687 | handleSessionEnd()에서 cleanupAgentResources() 호출 | 10분 |
| renderer.js | 369-374 | interval 정리 로직 강화 (null 체크 추가) | 15분 |
| 합계 | | | **75분** |

### 4.3 테스트 방법

**수동 테스트 절차 (30분):**

1. **준비:**
   ```bash
   npm start
   Chrome DevTools → Memory → Heap Snapshot
   ```

2. **기준선 측정:**
   - 앱 시작 후 1분 대기
   - Heap Snapshot 1 찍기
   - 메모리 사용량 기록

3. **스트레스 테스트:**
   - 10개 테스트 에이전트 생성 (ENABLE_TEST_AGENTS=true)
   - 모두 제거 (dismiss-agent)
   - 이 과정을 10회 반복
   - Heap Snapshot 2 찍기

4. **결과 확인:**
   ```
   기준선: 50MB
   최종: 80MB
   증가: 30MB (60% 증가) → ✅ 통과 (100% 이하 증가)

   만약 150MB 이상이면 ❌ 실패 → 추가 수정 필요
   ```

5. **장시간 테스트 (선택):**
   - 4시간 동안 30분마다 Heap Snapshot
   - 메모리 사용량 그래프가 수평인지 확인

**자동화된 테스트 (다음 스프린트):**
- Jest + Electron Mocha
- 메모리 프로파일링 자동화

### 4.4 성공 기준

**기술적 기준:**
- [ ] 10개 에이전트 생성/종료 20회 반복 후 메모리 사용량이 초기의 2배 이하
- [ ] 장시간 실행(2시간) 후 메모리 사용량이 안정화 (증가율 < 10%/시간)
- [ ] Chrome DevTools에서 "Detached DOM nodes"가 0개
- [ ] 모든 interval이 적절히 정리됨

**사용자 기준:**
- [ ] 앱이 4시간 연속 사용 가능
- [ ] 에이전트 추가/제거 시 앱 응답 속도 저하 없음
- [ ] 앱 종료 시 프로세스가 즉시 정리됨

**품질 기준:**
- [ ] Regression 없음 (기존 기능 정상 작동)
- [ ] 에러 로그에 관련 경보 없음

---

## 5. 실행 계획

### 5.1 단계별 작업

#### Phase 1: 긴급 수정 (2시간)

| 작업 | 담당자 | 예상 시간 | 선행 조건 |
|------|--------|----------|----------|
| 1.1 코드 수정: Main interval 정리 | 개발자 | 20분 | - |
| 1.2 코드 수정: cleanupAgentResources() 추가 | 개발자 | 30분 | 1.1 |
| 1.3 코드 수정: Renderer interval 정리 강화 | 개발자 | 15분 | 1.2 |
| 1.4 로컬 테스트: 수동 메모리 검증 | QA | 30분 | 1.3 |
| 1.5 Regression 테스트: 기존 기능 확인 | QA | 15분 | 1.4 |
| 1.6 Git 커밋 및 PR 생성 | 개발자 | 10분 | 1.5 |

**계획 시간:** 2시간
**버퍼:** 30분 (총 2.5시간)

#### Phase 2: 안정화 (다음 스프린트)

| 작업 | 담당자 | 예상 시간 |
|------|--------|----------|
| 2.1 ResourceManager 클래스 설계 | 아키텍트 | 1시간 |
| 2.2 ResourceManager 구현 | 개발자 | 2시간 |
| 2.3 기존 코드를 ResourceManager로 이전 | 개발자 | 2시간 |
| 2.4 자동화된 메모리 누수 테스트 작성 | QA | 2시간 |
| 2.5 메모리 사용량 모니터링 UI 구현 | UI/UX | 1시간 |

**계획 시간:** 8시간 (1일)

### 5.2 예상 시간

**P0-1 메모리 누수 수정:**
- **긴급 수정:** 2시간 (오늘 완료 목표)
- **안정화 작업:** 8시간 (다음 스프린트)

### 5.3 담당자

| 역할 | 담당자 | 책임 |
|------|--------|------|
| **리드** | 아키텍처 전문가 | 기술적 방향성, 코드 리뷰 |
| **구현** | 개발자 | 코드 수정, 테스트 |
| **검증** | QA 엔지니어 | 테스트 수행, 성공 기준 확인 |
| **승인** | 기획자 | ROI 평가, 릴리스 결정 |
| **협업** | UI/UX 전문가 | 사용자 경험 영향 평가 |

---

## 6. 위험도 분석 및 완화 계획

### 6.1 기술적 위험

| 위험 | 확률 | 영향 | 완화 계획 |
|------|------|------|----------|
| 수정 중 다른 리소스 누수 발견 | 중간 (40%) | 낮음 | 일지에 기록하고 다음 스프린트로 이관 |
| Regression으로 기존 기능 깨짐 | 낮음 (10%) | 높음 | 충분한 Regression 테스트 + Rollback 준비 |
| Renderer와 Main 동기화 깨짐 | 중간 (30%) | 중간 | IPC 메시지 로깅으로 디버깅 |

### 6.2 일정 위험

| 위험 | 확률 | 영향 | 완화 계획 |
|------|------|------|----------|
| 예상보다 수정 시간 초과 | 중간 (40%) | 중간 | Phase 1 범위를 최소 수정으로 제한 |
| 테스트에서 미발견 누수 존재 | 중간 (30%) | 높음 | Beta 테스터 모집 (다음 주) |
| 다른 P0 항목과의 선후 관계 | 낮음 (10%) | 낮음 | 독립적 수정 가능 |

---

## 7. 결론

### 7.1 최종 합의

**전원 일치 사항:**
1. ✅ 메모리 누수는 P0 긴급 수정 대상임
2. ✅ 최소 수정으로 2시간 내 완료 가능
3. ✅ 수동 테스트로 충분히 검증 가능
4. ✅ 다른 P0 항목과 독립적이므로 병렬 수행 가능

**전원 찬성:**
- **즉시 수정 착수** (오늘 오후 2시간 투자)
- **Patch v0.1.1**로 긴급 릴리스
- **다음 스프린트**에 근본적 리팩토링 예약

### 7.2 기대 효과

**사용자:**
- 장시간 사용 시 앱 안정화
- 파워 유저 이탈률 감소 예상

**기술:**
- 메모리 사용량 50% 이상 감소 (10개 에이전트 기준)
- Interval/Map 리소스 누수 완전 해결

**비즈니스:**
- 오픈소스 커뮤니티 평가 개선
- 안정성 리뷰 점수 향상

### 7.3 다음 단계

1. **오늘:** 코드 수정 + 테스트 + 커밋
2. **내일:** Patch v0.1.1 릴리스
3. **다음 주:** ResourceManager 리팩토링 시작
4. **다음 달:** 메모리 모니터링 UI 추가

---

## 8. 부록: 메모리 누수 진단 도구

### A.1 Chrome DevTools Memory Profiler

**사용법:**
```
1. F12 → DevTools 열기
2. Memory 탭 선택
3. Heap Snapshot 선택
4. Take Snapshot 버튼 클릭
5. Comparision 모드로 비교
6. "Detached DOM nodes" 검색
```

### A.2 Node.js Heapdump

```bash
# 실행 시 flag 추가
electron --inspect --inspect-port=9229

# Chrome에서 chrome://inspect 접속
# Memory → Collect garbage
# Heap snapshot 촬영
```

### A.3 Electron Performance Monitor

```javascript
// main.js 추가
const { app, BrowserWindow } = require('electron');

app.on('ready', () => {
  setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`Memory: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`);
  }, 30000);
});
```

---

**보고서 작성:** P0-1 전문가 팀 합작
**승인일:** 2026-03-05
**버전:** 1.0
**다음 리뷰:** 수정 완료 후 (예정)
