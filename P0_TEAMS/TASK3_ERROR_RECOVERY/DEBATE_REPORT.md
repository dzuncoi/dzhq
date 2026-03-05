# 에러 복구 가이드 UI 팀 토론 보고서

**작성일:** 2026-03-05
**과제:** P0-3 에러 복구 가이드 UI
**예상 공수:** 10시간
**참여 전문가:** 아키텍처 전문가, UI/UX 전문가, 개발자, QA 엔지니어, 제품 기획자

---

## 1. 문제 정의

### 1.1 현재 에러 처리 실태

**코드 분석 결과:**

| 파일 | 라인 | 문제점 | 영향도 |
|------|------|--------|--------|
| `main.js` | 286 | `} catch (e) { }` - 빈 catch 블록 | 높음 |
| `main.js` | 601 | `} catch (e) { }` - 빈 catch 블록 | 중간 |
| `main.js` | 638 | `} catch (e) { }` - 빈 catch 블록 | 낮음 |
| `main.js` | 700 | `} catch (e) { }` - 빈 catch 블록 | 높음 |
| `hook.js` | 26 | `} catch (e) { }` - 빈 catch 블록 | 높음 |
| `sessionend_hook.js` | 40, 42 | `} catch (e) { }` - 빈 catch 블록 (중첩) | 높음 |
| `utils.js` | 65-67 | catch에서 null 반환만 수행 | 중간 |
| `utils.js` | 79-81 | catch에서 false 반환만 수행 | 중간 |

**주요 에러 처리 패턴:**

1. **무음 실패 (Silent Failure):** 7개소의 빈 catch 블록
2. **콘솔 전용 로깅:** `debugLog()`, `console.error()`로만 기록
3. **사용자 통보 부재:** UI에 에러 메시지가 표시되지 않음
4. **복구 경로 부재:** 에러 발생 시 사용자가 취할 수 있는 행동 안내 없음

### 1.2 사용자 혼란

**실제 시나리오:**

1. **settings.json 파싱 실패 (main.js:285)**
   - 사용자: 설정이 왜 초기화되었는지 모름
   - 개발자: `.corrupt_backup` 파일 생성됨을 알지만 사용자는 모름
   - 결과: 사용자 설정이 조용히 초기화되어 혼란

2. **아바타 로드 실패 (renderer.js:630)**
   - 사용자: 에이전트 카드가 왜 비어있는지 모름
   - 시스템: `console.warn()`만 기록됨
   - 결과: 빈 카드가 표시되어 버그처럼 보임

3. **에이전트 포커스 실패 (main.js:910)**
   - 사용자: 에이전트 클릭 시 반응 없음
   - 시스템: `debugLog()`만 기록됨
   - 결과: 앱이 멈춘 것처럼 느껴짐

4. **후킹 실패 (main.js:330)**
   - 사용자: Claude CLI 이벤트가 감지되지 않음
   - 시스템: 백그라운드에서만 기록됨
   - 결과: "작동을 안 하네"라는 불만

### 1.3 디버깅 어려움

**현재 로깅 시스템의 한계:**

```javascript
// main.js:9
const debugLog = (msg) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, 'debug.log'), logMsg);
  console.log(msg);
};
```

**문제점:**
- `debug.log` 파일 위치를 일반 사용자가 모름
- 개발자 도구 (DevTools)가 비활성화된 경우가 많음
- 에러 스택 트레이스가 기록되지 않음 (message만 기록)
- 에러 카테고리/심각도 분류 없음

---

## 2. 전문가별 의견

### 2.1 🏗️ 아키텍처 전문가

**현재 상태 평가:**

> "현재 에러 핸들링은 '최소주의(minimalism)'라기보다 '방치(abandonment)'에 가깝습니다. 빈 catch 블록은 예외를 삼키는 블랙홀과 같습니다."

**제안 아키텍처:**

```typescript
// 제안된 에러 처리 아키텍처
interface ErrorContext {
  timestamp: Date;
  source: 'main' | 'renderer' | 'hook' | 'agent';
  category: ErrorCategory;
  severity: 'fatal' | 'error' | 'warning' | 'info';
  code: string;
  message: string;
  stack?: string;
  userMessage: string;      // 사용자용 메시지
  recovery?: RecoveryAction[]; // 복구 옵션
}

enum ErrorCategory {
  FILE_IO = 'FILE_IO',
  NETWORK = 'NETWORK',
  PARSE = 'PARSE',
  PERMISSION = 'PERMISSION',
  AGENT_LIFECYCLE = 'AGENT_LIFECYCLE',
  UI_RENDER = 'UI_RENDER',
  UNKNOWN = 'UNKNOWN'
}

interface RecoveryAction {
  type: 'retry' | 'skip' | 'reset' | 'open_settings' | 'view_logs';
  label: string;        // 버튼 텍스트
  action: () => Promise<void>;
}
```

**기술적 우려사항:**

1. **프로세스 분리:** Main 프로세스와 Renderer 프로세스 간 에러 전송 메커니즘 필요
2. **순환 참조 방지:** 에러 핸들러 자체에서 에러 발생 시 대응 필요
3. **성능 영향:** 모든 에러를 UI까지 전달할 때의 오버헤드
4. **로테이션:** debug.log 무한 증가 방지

### 2.2 🎨 UI/UX 전문가

**현재 UI 상태:**

> "현재 UI는 '긍정적 생각'을 전제로 설계되었습니다. 에러는 없을 것이라고 가정하고 있습니다. 하지만 현실은 다릅니다."

**디자인 원칙 제안:**

1. **비침습적 알림:** 기존 작업 흐름을 방해하지 않는 방식
2. **색상 의미:** 기존 상태 색상 시스템과의 조화
   - 현재: Working (주황), Complete (녹색), Alert (빨강)
   - 제안: Error (진한 빨강 #d32f2f, 기존 Alert와 구분)
3. **위치:** 에이전트 카드 내부 (말풍선 활용)
4. **아이콘:** 현재 스프라이트시트의 alert 프레임 활용

**UI 컴포넌트 제안:**

```
┌─────────────────────────────────────┐
│  [프로젝트]                          │
│  [Main]                              │
│  ┌─────────────────────────────┐    │
│  │ ❌ 설정 파일을 불러올 수 없음  │    │
│  │                              │    │
│  │ 📁 logs 폴더에서 자세히 보기  │    │
│  │ 🔄 다시 시도                  │    │
│  │ ⚙️ 설정 열기                  │    │
│  └─────────────────────────────┘    │
│      ▲                                │
│   [캐릭터]                           │
│   Claude-3.5-Sonnet                  │
└─────────────────────────────────────┘
```

**토론 포인트:**
- 에러 메시지 말풍선의 최대 높이 제한 필요 (현재 2줄 제한 있음)
- 여러 에러 동시 발생 시 우선순위 표시 방법
- 에러 상태 지속 시간 (자동 해제 vs 사용자 닫기)

### 2.3 💻 개발자

**현실적 구현 제안:**

> "이상적인 아키텍처는 좋지만, 우리는 10시간밖에 없습니다. MVP(Minimal Viable Product)부터 시작해야 합니다."

**Phase 1 구현 (필수, 4시간):**

```javascript
// 1. 중앙 에러 핸들러 생성 (errorHandler.js)
class ErrorHandler {
  constructor() {
    this.errors = new Map(); // agentId -> ErrorContext
    this.mainWindow = null;
  }

  // Main 프로세스에서 호출
  capture(error, context = {}) {
    const errorContext = this.normalize(error, context);
    this.logToFile(errorContext);
    this.sendToRenderer(errorContext);
  }

  // 사용자용 메시지 생성
  getUserMessage(error) {
    const messages = {
      'ENOENT': '파일을 찾을 수 없습니다',
      'EACCES': '파일 접근 권한이 없습니다',
      'SyntaxError': '설정 파일 형식이 올바르지 않습니다',
      'default': '작업을 완료할 수 없습니다'
    };
    return messages[error.code] || messages.default;
  }

  // 복구 옵션 생성
  getRecoveryActions(error) {
    const actions = [];
    if (error.category === 'PARSE') {
      actions.push({ type: 'open_settings', label: '⚙️ 설정 열기' });
      actions.push({ type: 'view_logs', label: '📁 로그 보기' });
    }
    if (error.retriable) {
      actions.unshift({ type: 'retry', label: '🔄 다시 시도' });
    }
    return actions;
  }
}
```

**Phase 2 구현 (권장, 4시간):**

```javascript
// 2. preload.js 확장
contextBridge.exposeInMainWorld('electronAPI', {
  // 기존 메서드들...
  onError: (cb) => ipcRenderer.on('error-occurred', (_, error) => cb(error)),
  executeRecovery: (action, errorId) => ipcRenderer.invoke('recovery-action', action, errorId)
});

// 3. renderer.js 에러 상태 처리
function showErrorOnAgent(agentId, errorContext) {
  const card = document.querySelector(`[data-agent-id="${agentId}"]`);
  if (!card) return;

  const bubble = card.querySelector('.agent-bubble');
  if (bubble) {
    bubble.textContent = errorContext.userMessage;
    bubble.classList.add('is-error');
    bubble.style.border = '2px solid #d32f2f';

    // 복구 버튼 추가
    const actions = errorContext.recovery || [];
    if (actions.length > 0) {
      const actionContainer = document.createElement('div');
      actionContainer.className = 'error-actions';
      actions.forEach(action => {
        const btn = document.createElement('button');
        btn.className = 'error-action-btn';
        btn.textContent = action.label;
        btn.onclick = () => executeRecovery(action, errorContext.id);
        actionContainer.appendChild(btn);
      });
      card.appendChild(actionContainer);
    }
  }
}
```

**Phase 3 구현 (선택, 2시간):**

```css
/* styles.css 추가 */
.error-actions {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
  min-width: 120px;
}

.error-action-btn {
  background: #d32f2f;
  color: white;
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 9px;
  font-family: 'Pretendard Variable', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.error-action-btn:hover {
  background: #b71c1c;
  transform: scale(1.05);
}
```

**우려사항:**
- 빈 catch 블록 전체 수정하려면 20+ 파일 수정 필요
- 일부는 무시해도 되는 에러 (예: process.kill 체크)
- 에러 카테고리별 휴리스틱 개발 시간 소요

### 2.4 🧪 QA 엔지니어

**테스트 관점:**

> "현재 시스템에서는 에러가 발생해도 테스트가 통과하는 것처럼 보입니다. 에러 시나리오 테스트가 불가능합니다."

**필요 테스트 시나리오:**

1. **settings.json 파싱 에러**
   - 조건: JSON 형식이 깨진 파일로 교체
   - 예상: 에러 메시지 표시 + 백업 파일 생성 안내
   - 복구: 설정 파일 재생성

2. **아바타 파일 누락**
   - 조건: avatar_00.png 삭제
   - 예상: 플레이스홀더 아이콘 표시 + 에러 알림
   - 복구: 아바타 재로드

3. **후킹 서버 포트 충돌**
   - 조건: 포트 41157 이미 사용 중
   - 예상: "포트 충돌" 메시지 + 대안 포트 시도
   - 복구: 포트 변경

4. **프로세스 종료 감지 실패**
   - 조건: PID가 유효하지 않은 상태에서 체크
   - 예상: 좀비 에이전트 자동 정리 안내
   - 복구: 수동 제거

**테스트 가능성:**
- 현재: 빈 catch 블록으로 인해 에러를 주입해도 반응 없음
- 개선후: 에러 인젝션 테스트 가능

### 2.5 📊 제품 기획자

**사용자 경험 관점:**

> "사용자는 '왜 에러가 났는지'보다 '어떻게 해결하는지'를 알고 싶어 합니다. 그리고 기술 용어는 혐오합니다."

**사용자 페르소나 분석:**

1. **개발자 사용자 (Power User)**
   - 요구: 스택 트레이스, 로그 파일 위치, 원인 분석
   - 선호: "터미널에서 로그 보기" 버튼
   - 거부: "무언가 잘못되었습니다" 메시지

2. **일반 사용자 (Casual User)**
   - 요구: 클릭 한 번으로 해결, 자동 복구
   - 선호: "다시 시도" 버튼, 자동 재시도
   - 거부: "ENOENT: file not found" 같은 기술 용어

**메시지 톤앤매너 가이드:**

| 에러 유형 | 나쁜 예 | 좋은 예 |
|----------|---------|---------|
| 파일 없음 | "ENOENT: /path/to/file" | "설정 파일을 찾을 수 없어요. 새로 만들까요?" |
| 파싱 실패 | "SyntaxError at line 42" | "설정 파일 형식이 올바르지 않아요. 백업에서 복구할까요?" |
| 권한 없음 | "EACCES: permission denied" | "파일에 접근할 수 없어요. 권한을 확인해주세요" |
| 네트워크 | "ETIMEDOUT" | "연결 시간 초과. 인터넷 연결을 확인해주세요" |

**복구 우선순위:**

1. **자동 복구:** 재시도 (1회), 대안 경로 시도
2. **안내형 복구:** 설정 열기, 로그 보기
3. **수동 복구:** 문서 링크, 이슈 트래커

---

## 3. 토론 과정

### 3.1 논쟁 1: 기술적 vs 사용자 친화적 표현

**개발자:** "스택 트레이스를 보여줘야 디버깅이 가능합니다"

**UI/UX:** "일반 사용자는 스택 트레이스를 보면 겁을 먹습니다"

**QA:** "둘 다 필요합니다. 사용자 레벨에 따라 다르게 보여주세요"

**기획자:** "좋은 중재안입니다. 기본은 사용자 친화적 메시지, '상세 정보' 토글로 기술 정보 표시"

**합의안:**
```javascript
{
  userMessage: "설정 파일을 불러올 수 없어요",  // 기본 표시
  technicalDetails: {                            // 상세 보기에서 표시
    code: "ENOENT",
    path: "/Users/.../.claude/settings.json",
    stack: "..."
  }
}
```

### 3.2 논쟁 2: UI 복잡도

**개발자:** "복구 버튼 3개면 너무 복잡합니다. 그냥 '다시 시도' 하나만..."

**UI/UX:** "복구 옵션이 없으면 사용자가 할 수 있는 게 없습니다. 최소한 로그 보기는 필요해요"

**아키텍트:** "에러 타입별로 다른 버튼을 보여줍시다. 파싱 에러는 설정 열기, 네트워크 에러는 재시도"

**기획자:** "좋습니다. 단, 버튼은 최대 2개로 제한하고, 나머지는 '더 보기' 메뉴로"

**합의안:**
- 주요 복구: 1-2개 버튼 직접 노출
- 2차 복구: "⋯ 더 보기" 드롭다운

### 3.3 논쟁 3: 빈 catch 블록 처리

**QA:** "모든 빈 catch를 수정하면 20+ 파일을 건드려야 합니다"

**개발자:** "일부는 의도적인 무시입니다. process.kill 체크 같은..."

**아키텍트:** "그럼 레거시 코드는 최소한의 수정만 하고, 신규 코드는 엄격하게 적용합시다"

**기획자:** "우선순위를 매깁시다. P0는 사용자에게 영향을 주는 것만"

**합의안:**
- P0 (즉시 수정): settings.json, hooks.jsonl, 아바타 로드
- P1 (다음 릴리즈): 나머지 빈 catch 블록
- P2 (무시해도 됨): 프로세스 생존 확인 체크

### 3.4 논쟁 4: 로그 관리

**개발자:** "debug.log가 계속 커지면 디스크를 다 먹습니다"

**아키텍트:** "로그 로테이션이 필요합니다. 10MB 단위로 분할"

**UI/UX:** "사용자가 로그 파일 위치를 알 수 있게 '로그 폴더 열기' 기능도 필요합니다"

**QA:** "로그 뷰어를 내장하면 더 좋습니다. 텍스트 에디터로 열게 하지 말고"

**합의안:**
1. 로그 로테이션: 10MB당 파일 분할, 최대 5개 보관
2. 로그 뷰어: 간단한 텍스트 뷰어 모달
3. 로그 폴더 열기: 시스템 파일 탐색기로 해당 경로 열기

### 3.5 논쟁 5: 에러 상태 지속 시간

**UI/UX:** "에러가 영구히 남으면 UI가 지저분합니다"

**개발자:** "사용자가 못 볼 수도 있습니다. 자동으로 사라지면 안 돼요"

**기획자:** "에러 타입에 따라 다릅니다. 일시적 에러는 자동 해제, 심각한 에러는 사용자 확인까지 유지"

**합의안:**
| 심각도 | 자동 해제 | 사용자 해제 |
|--------|-----------|-------------|
| fatal  | X         | O (필수)    |
| error  | X         | O (권장)    |
| warning| O (30초)  | O (가능)    |
| info   | O (10초)  | O (가능)    |

---

## 4. 최종 합의안

### 4.1 에러 표시 가이드라인

**메시지 3단계 구조:**

```javascript
// 1단계: 사용자 친화적 요약 (최대 20자)
"설정 파일을 불러올 수 없어요"

// 2단계: 원인 설명 (선택, 최대 50자)
"파일 형식이 올바르지 않거나 손상되었을 수 있어요"

// 3단계: 해결 방법 (최대 30자)
"백업에서 복구하거나 새로 만들 수 있어요"
```

**색상 시스템 (기존과 조화):**

| 상태 | 색상 | 용도 | 기존 여부 |
|------|------|------|-----------|
| Error (fatal) | #d32f2f (진한 빨강) | 복구 불가능 | 신규 |
| Error (recoverable) | #f44336 (빨강) | 복구 가능 | 기존 Alert 수정 |
| Warning | #ff9800 (주황) | 주의 필요 | 기존 Working과 유사 |
| Info | #2196f3 (파랑) | 정보 전달 | 기존 Thinking과 유사 |

### 4.2 UI 컴포넌트 디자인

**컴포넌트 구조:**

```
┌─────────────────────────────────────┐
│  [에이전트 카드]                     │
│  ┌─────────────────────────────┐    │
│  │ [Error]                      │    │ ← 상태 말풍선
│  │ 파일을 찾을 수 없어요         │    │
│  └─────────────────────────────┘    │
│  ┌─────────────────────────────┐    │
│  │ [🔄 다시 시도] [📁 로그 보기]│    │ ← 복구 버튼 (최대 2개)
│  │              [⋯ 더 보기 ▼]  │    │ ← 추가 옵션
│  └─────────────────────────────┘    │
│      ▲                               │
│   [캐릭터 - alert 애니메이션]        │
│   Claude-3.5-Sonnet                  │
└─────────────────────────────────────┘
```

**애니메이션:**
- 에이전트: 기존 alert 애니메이션 (프레임 0, 31 번갈아가며)
- 말풍선: 빨간 테두리로 점멸 (1초 간격)
- 진동: 카드 자체를 0.5초간 좌우로 2px 진동

**상세 보기 모달:**

```
┌─────────────────────────────────────┐
│  ❌ 오류 상세 정보           [× 닫기] │
├─────────────────────────────────────┤
│  사용자 메시지:                      │
│  설정 파일을 불러올 수 없어요        │
│                                      │
│  기술 정보:                          │
│  • 에러 코드: ENOENT                 │
│  • 파일 경로: /path/to/settings.json│
│  • 시간: 2026-03-05 14:32:15        │
│                                      │
│  [📋 클립보드에 복사] [📁 로그 폴더 열기]│
│                                      │
│  스택 트레이스:                      │
│  ▼ 보기 (토글)                       │
│  Error: ENOENT: no such file...     │
│    at fs.readFileSync (main.js:282) │
│    ...                               │
└─────────────────────────────────────┘
```

### 4.3 복구 옵션

**표준 복구 액션:**

| 액션 타입 | 아이콘 | 라벨 | 설명 | 사용 시나리오 |
|----------|--------|------|------|---------------|
| retry | 🔄 | 다시 시도 | 실패한 작업 재시도 | 네트워크 오류, 일시적 오류 |
| skip | ⏭️ | 건너뛰기 | 현재 작업 건너뛰기 | 선택적 작업 실패 |
| reset | 🔁 | 초기화 | 기본값으로 재설정 | 파싱 오류, 설정 오류 |
| open_settings | ⚙️ | 설정 열기 | 설정 파일/폴더 열기 | 설정 관련 오류 |
| view_logs | 📁 | 로그 보기 | 로그 뷰어/폴더 열기 | 디버깅 필요 |
| copy_error | 📋 | 복사 | 에러 정보 클립보드 복사 | 이슈 보고 시 |
| open_docs | 📖 | 도움말 | 관련 문서 열기 | 사용자 오류 |
| report_bug | 🐛 | 버그 보고 | 이슈 트래커 열기 | 예상치 못한 오류 |

**컨텍스트별 복구 조합:**

```javascript
const recoveryPresets = {
  // 설정 파일 파싱 오류
  PARSE_ERROR: [
    { type: 'reset', label: '기본값으로 초기화' },
    { type: 'open_settings', label: '설정 폴더 열기' },
    { type: 'copy_error', label: '에러 복사' }
  ],

  // 아바타 로드 실패
  AVATAR_LOAD_FAILED: [
    { type: 'retry', label: '다시 시도' },
    { type: 'skip', label: '기본 아이콘 사용' }
  ],

  // 프로세스 포커스 실패
  FOCUS_FAILED: [
    { type: 'retry', label: '다시 시도' },
    { type: 'view_logs', label: '로그 보기' }
  ],

  // 후킹 서버 포트 충돌
  PORT_CONFLICT: [
    { type: 'retry', label: '다른 포트로 시도' },
    { type: 'open_docs', label: '포트 설정 방법' }
  ]
};
```

### 4.4 로깅 전략

**로그 레벨 정의:**

```javascript
const LogLevel = {
  FATAL: 0,   // 앱이 계속 실행될 수 없음
  ERROR: 1,   // 기능이 작동하지 않음
  WARN: 2,    // 기능이 제한적으로 작동
  INFO: 3,    // 정보성 메시지
  DEBUG: 4    // 디버깅용
};
```

**로그 포맷:**

```javascript
// JSON 구조화 로그
{
  "timestamp": "2026-03-05T14:32:15.123Z",
  "level": "ERROR",
  "source": "main",
  "category": "PARSE",
  "code": "ENOENT",
  "message": "Failed to read settings.json",
  "userMessage": "설정 파일을 찾을 수 없어요",
  "stack": "Error: ENOENT...\n    at ...",
  "context": {
    "path": "/path/to/settings.json",
    "agentId": "abc123..."
  },
  "recovery": [...]
}
```

**파일 정책:**

1. **파일명:** `error-YYYYMMDD-HHMMSS.log`
2. **최대 크기:** 10MB
3. **보관 개수:** 최대 5개 (가장 오래된 것 삭제)
4. **위치:** 사용자 데이터 디렉토리/logs
5. **보관 기간:** 30일

**IPC 통신:**

```javascript
// Main → Renderer 에러 전송
mainWindow.webContents.send('error-occurred', {
  id: generateErrorId(),
  agentId: agent?.id,
  ...errorContext
});

// Renderer → Main 복구 요청
ipcRenderer.invoke('execute-recovery', {
  errorId: 'abc123',
  action: 'retry',
  params: {}
});
```

---

## 5. 실행 계획

### 5.1 구현 단계

**Phase 1: 기반 구조 (4시간)**

| 작업 | 시간 | 담당 | 산출물 |
|------|------|------|--------|
| ErrorHandler 클래스 구현 | 1.5h | 개발자 | `errorHandler.js` |
| 에러 정규화 함수 구현 | 1h | 개발자 | `normalizeError()` |
| 사용자 메시지 매핑 | 0.5h | 기획자 | 메시지 테이블 |
| IPC 채널 구현 | 1h | 아키텍트 | preload.js 확장 |

**Phase 2: UI 구현 (3시간)**

| 작업 | 시간 | 담당 | 산출물 |
|------|------|------|--------|
| 에러 상태 CSS 스타일 | 0.5h | UI/UX | styles.css 추가 |
| showErrorOnAgent 함수 | 1h | 개발자 | renderer.js 수정 |
| 복구 버튼 컴포넌트 | 1h | 개발자 | errorActions.js |
| 상세 보기 모달 | 0.5h | UI/UX | errorModal.js |

**Phase 3: 기존 코드 적용 (2시간)**

| 작업 | 시간 | 담당 | 산출물 |
|------|------|------|--------|
| P0 catch 블록 수정 | 1h | 개발자 | main.js 수정 |
| 아바타 로드 에러 처리 | 0.5h | 개발자 | renderer.js 수정 |
| 포커스 실패 처리 | 0.5h | 개발자 | main.js 수정 |

**Phase 4: 로그 시스템 (1시간)**

| 작업 | 시간 | 담당 | 산출물 |
|------|------|------|--------|
| 로그 뷰어 모달 | 0.5h | 개발자 | logViewer.js |
| 로그 폴더 열기 기능 | 0.5h | 개발자 | shell.openPath() |

### 5.2 테스트 시나리오

**단위 테스트:**

```javascript
describe('ErrorHandler', () => {
  it('should normalize Error objects', () => {
    const error = new Error('Test');
    const context = errorHandler.normalize(error, { source: 'test' });
    expect(context.userMessage).toBeDefined();
    expect(context.severity).toBe('error');
  });

  it('should map error codes to user messages', () => {
    const messages = errorHandler.getUserMessage({ code: 'ENOENT' });
    expect(messages).toContain('파일을 찾을 수 없습니다');
  });
});
```

**통합 테스트:**

```javascript
describe('Error Recovery Flow', () => {
  it('should show error on agent and allow retry', async () => {
    // 1. 에러 발생
    await simulateError('PARSE_ERROR');

    // 2. 에러 UI 확인
    const errorBubble = await findElement('.agent-bubble.is-error');
    expect(errorBubble).toExist();

    // 3. 복구 버튼 클릭
    const retryBtn = await findElement('[data-action="retry"]');
    await retryBtn.click();

    // 4. 복구 확인
    await waitFor(() => !errorBubble.exists());
  });
});
```

**E2E 테스트:**

1. settings.json 깨진 상태로 앱 시작 → 에러 표시 및 복구 확인
2. 아바타 파일 삭제 후 앱 시작 → 플레이스홀더 표시 확인
3. 포트 충돌 상태에서 앱 시작 → 대안 포트 시도 확인

### 5.3 성공 기준

**기능적 기준:**

- [ ] P0 에러(5개)가 모두 UI에 표시됨
- [ ] 각 에러에 최소 1개의 복구 옵션이 제공됨
- [ ] 복구 액션이 정상 동작함
- [ ] 에러 로그가 파일에 기록됨
- [ ] 로그 뷰어가 로그를 표시함

**비기능적 기준:**

- [ ] 에러 UI가 기존 작업 흐름을 방해하지 않음
- [ ] 에러 상태가 자동으로 해제됨 (warning, info)
- [ ] 로그 파일이 10MB를 초과하지 않음
- [ ] 에러 핸들러 자체가 에러를 일으키지 않음

**사용자 경험 기준:**

- [ ] 일반 사용자가 에러를 이해할 수 있음
- [ ] 개발자가 기술 정보를 확인할 수 있음
- [ ] 복구 절차가 직관적임
- [ ] 불필요한 기술 용어가 노출되지 않음

**품질 기준:**

- [ ] 모든 빈 catch 블록에 주석 추가 (의도 설명)
- [ ] P0 catch 블록이 에러를 처리함
- [ ] 에러 코드가 문서화됨
- [ ] 테스트 커버리지 70% 이상

---

## 6. 리스크 및 완화 방안

### 6.1 기술적 리스크

| 리스크 | 영향도 | 확률 | 완화 방안 |
|--------|--------|------|-----------|
| 순환 참조 (에러 핸들러에서 에러) | 높음 | 낮음 | try-catch로 감싸고 콘솔 폴백 |
| IPC 과부하 | 중간 | 낮음 | 에러 전송 디바운싱 (1초) |
| 로그 파일 디스크 과다 사용 | 중간 | 중간 | 로테이션 및 자동 삭제 |
| UI 렌더링 차단 | 낮음 | 낮음 | 비동기 업데이트 |

### 6.2 사용자 경험 리스크

| 리스크 | 영향도 | 확률 | 완화 방안 |
|--------|--------|------|-----------|
| 에러 스팸 (너무 많은 알림) | 높음 | 중간 | 에러 중복 제거, 전역 에러 카운트 |
| 복구 실패 반복 | 높음 | 중간 | 최대 재시도 횟수 제한 |
| 사용자 혼란 (기술 용어) | 중간 | 낮음 | 메시지 검토 프로세스 |
| 가짜 에러 (정상 동작임에도) | 낮음 | 낮음 | 에러 레벨 조정 가이드 |

### 6.3 개발 리스크

| 리스크 | 영향도 | 확률 | 완화 방안 |
|--------|--------|------|-----------|
| 시간 부족 (10시간) | 높음 | 중간 | Phase 1-2 우선, Phase 3-4는 다음 스프린트 |
| 기존 코드 영향 | 중간 | 중간 | 빈 catch는 주석 추가만, 신규는 강제 적용 |
| 테스트 불가 (레거시) | 중간 | 낮음 | 에러 인젝션 유틸리티 개발 |

---

## 7. 결론

### 7.1 핵심 합의사항

1. **3단계 메시지 구조:** 사용자 요약 + 원인 + 해결책
2. **컨텍스트 중심 복구:** 에러 타입별로 다른 복구 옵션 제공
3. **단계적 구현:** P0(필수) → P1(권장) → P2(선택)
4. **이중 타겟:** 일반 사용자(친화적) + 개발자(기술적)
5. **자동화:** 로테이션, 재시도, 정리

### 7.2 다음 단계

1. **기획 승인:** 기획팀에서 메시지 가이드라인 승인
2. **디자인 리뷰:** UI/UX팀에서 에러 컴포넌트 디자인 확정
3. **개발 착수:** Phase 1부터 순차적 개발
4. **QA 동반:** 각 Phase 완료 시 테스트 수행
5. **문서화:** 에러 코드북 작성

### 7.3 장기 로드맵

- **v1.0 (현재):** 기본 에러 표시 및 복구
- **v1.5:** 에러 통계 및 대시보드
- **v2.0:** 예측적 에러 방지
- **v2.5:** 사용자 피드백 기반 학습
- **v3.0:** AI 기반 자가 복구

---

**부록 A: 에러 코드 매핑표**

| 에러 코드 | 사용자 메시지 | 기술 원인 | 복구 |
|----------|---------------|-----------|------|
| E001 | 설정 파일을 찾을 수 없어요 | ENOENT | 초기화, 로그 보기 |
| E002 | 설정 파일 형식이 올바르지 않아요 | SyntaxError | 백업 복구, 초기화 |
| E003 | 아바타를 불러올 수 없어요 | ENOENT | 다시 시도, 기본값 |
| E004 | 포트가 이미 사용 중이에요 | EADDRINUSE | 다른 포트, 종료 |
| E005 | 창을 포커스할 수 없어요 | Process not found | 다시 시도, 로그 |
| E006 | 후킹이 작동하지 않아요 | Server error | 재시작, 로그 |
| E007 | 로그를 쓸 수 없어요 | EACCES | 권한 확인, 로그 |
| E008 | 에이전트를 찾을 수 없어요 | Invalid PID | 새로고침, 로그 |
| E009 | 메모리가 부족해요 | Heap limit | 재시작, 로그 |
| E010 | 네트워크 연결 실패 | ETIMEDOUT | 다시 시도, 설정 |

---

**보고서 작성:** 전문가 팀 합동
**승인:** 대표 개발자
**버전:** 1.0
**다음 리뷰:** 2026-03-12
