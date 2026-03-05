# Pixel Agent Desk - 시스템 아키텍처 분석 보고서

**작성일:** 2026-03-05
**분석 범위:** 데이터 구조, 검증 시스템, 파이프라인 아키텍처
**버전:** 2.0.0

---

## 1. 훅 데이터 구조 분석

### 1.1 데이터 흐름 개요

```
Claude CLI → hook.js → HTTP Server → processHookEvent → AgentManager → Renderer
```

### 1.2 Hook.js 데이터 구조

**파일:** `E:\projects\pixel-agent-desk-master\hook.js`

**입력 데이터 (stdin):**
- Claude Code가 JSON 형식으로 훅 이벤트 전달
- 표준 입력에서 데이터 수신 후 JSON 파싱

**데이터 변환:**
```javascript
const data = JSON.parse(Buffer.concat(chunks).toString());
data._pid = process.ppid;           // Claude 프로세스 PID 추가
data._timestamp = Date.now();       // 타임스탬프 추가
```

**JSON 파싱 오류 가능성:**

| 위험 지점 | 현재 상태 | 문제점 | 개선 필요사항 |
|----------|----------|--------|--------------|
| stdin 파싱 | try-catch로 감싸짐 | 파싱 실패 시 silent exit (line 44) | 에러 로깅 강화 필요 |
| 인코딩 처리 | UTF-8 가정 | BOM 처리 없음 | BOM 제거 로직 추가 권장 |
| 데이터 크기 | Chunk 누적 | 대용량 데이터 제한 없음 | 사이즈 제한 검토 |

**오프라인 복구 메커니즘:**
- 위치: `~/.pixel-agent-desk/hooks.jsonl`
- 형식: JSONL (한 줄당 하나의 JSON)
- 목적: 앱 종료 중에도 훅 내역 보존

### 1.3 HTTP 전송 구조

**서버 엔드포인트:** `http://127.0.0.1:47821/hook`

**전송 파라미터:**
```javascript
{
    hostname: '127.0.0.1',
    port: 47821,
    path: '/hook',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': body.length
    }
}
```

**타임아웃 처리:**
- 3초 타임아웃 설정 (line 40)
- 에러 발생 시 silent exit (line 39)
- **개선 필요:** 실패 시 재시도 메커니즘 없음

---

## 2. 메인 프로세스 데이터 구조 분석

### 2.1 HTTP 서버 데이터 수신

**파일:** `E:\projects\pixel-agent-desk-master\main.js` (lines 537-574)

**JSON 파싱 흐름:**
```javascript
// 1. 요청 본문 수집
let body = '';
req.on('data', chunk => { body += chunk; });
req.on('end', () => {
    // 2. JSON 파싱
    const data = JSON.parse(body);

    // 3. 스키마 검증
    const isValid = validateHook(data);
    if (!isValid) {
        errorHandler.capture(new Error('Invalid hook data'), {
            code: 'E010',
            category: 'VALIDATION',
            severity: 'WARNING',
            details: validateHook.errors
        });
        return;
    }

    // 4. 이벤트 처리
    processHookEvent(data);
});
```

### 2.2 JSON 스키마 검증 (Ajv)

**스키마 정의** (lines 494-532):
```javascript
const hookSchema = {
    type: 'object',
    required: ['hook_event_name'],
    properties: {
        hook_event_name: {
            type: 'string',
            enum: [
                'SessionStart', 'SessionEnd', 'UserPromptSubmit',
                'PreToolUse', 'PostToolUse', 'PostToolUseFailure',
                'Stop', 'TaskCompleted', 'PermissionRequest', 'Notification',
                'SubagentStart', 'SubagentStop', 'TeammateIdle',
                'ConfigChange', 'WorktreeCreate', 'WorktreeRemove', 'PreCompact'
            ]
        },
        session_id: { type: 'string' },
        sessionId: { type: 'string' },
        cwd: { type: 'string' },
        state: { type: 'string' },
        tool: { type: 'string' },
        _pid: { type: 'number' },
        _timestamp: { type: 'number' }
    },
    additionalProperties: true  // 유연성을 위해 추가 속성 허용
};
```

**검증 현황:**
- ✅ Ajv 라이브러리 사용 (v8.18.0)
- ✅ 필수 필드 검증 (`hook_event_name`)
- ✅ 이벤트 타입 enum 검증
- ⚠️ 세부 필드 검증이 느슨함 (`additionalProperties: true`)

### 2.3 검증이 누락된 지점

| 지점 | 파일 | 라인 | 문제점 | 영향 |
|-----|------|------|--------|------|
| state.json 복구 | main.js | 613 | 스키마 없이 JSON 파싱 | 손상된 파일로 인한 크래시 위험 |
| hooks.jsonl 리플레이 | main.js | 672 | 개별 라인 검증 없음 | 잘못된 데이터가 AgentManager로 전달 |
| settings.json | main.js | 276 | 파싱 실패 시 백업하지만 스키마 없음 | 구성 오류 가능성 |

### 2.4 Claude Code 훅 레퍼런스 호환성

**공식 문서:** `E:\projects\pixel-agent-desk-master\claude-code-hooks-reference.md`

**지원 이벤트 (17개):**
- ✅ SessionStart, SessionEnd
- ✅ UserPromptSubmit, Stop
- ✅ PreToolUse, PostToolUse, PostToolUseFailure
- ✅ TaskCompleted, PermissionRequest, Notification
- ✅ SubagentStart, SubagentStop
- ✅ TeammateIdle
- ✅ ConfigChange, WorktreeCreate, WorktreeRemove, PreCompact

**호환성 검증:**
- ✅ 모든 공식 이벤트 타입 지원
- ✅ enum 값이 공식 문서와 일치
- ⚠️ 일부 이벤트는 debug log만 출력하고 무시 (ConfigChange 등)

---

## 3. 에이전트 상태 관리 구조 분석

### 3.1 AgentManager 데이터 모델

**파일:** `E:\projects\pixel-agent-desk-master\agentManager.js`

**에이전트 데이터 구조:**
```javascript
{
    id: string,                    // 고유 ID (sessionId/agentId/uuid)
    sessionId: string,             // Claude 세션 ID
    agentId: string,               // 에이전트 ID
    slug: string,                  // 표시용 슬러그
    displayName: string,           // 표시 이름 (포맷됨)
    projectPath: string,           // 프로젝트 경로
    jsonlPath: string,             // JSONL 로그 파일 경로
    isSubagent: boolean,           // 서브에이전트 여부
    isTeammate: boolean,           // 팀메이트 여부
    parentId: string | null,       // 부모 에이전트 ID
    state: string,                 // 상태 (Working/Thinking/Done/Waiting/Help/Error)
    activeStartTime: number,       // 활동 시작 시간
    lastDuration: number,          // 마지막 작업 소요 시간
    lastActivity: number,          // 마지막 활동 시간
    source: string,                // 데이터 출처
    timestamp: number,             // 데이터 타임스탬프
    firstSeen: number,             // 최초 발견 시간
    updateCount: number            // 업데이트 횟수
}
```

### 3.2 상태 전이 머신

**상태 값:**
- `Working`: 활성 작업 중
- `Thinking`: 툴 실행 대기 중
- `Done`: 작업 완료
- `Waiting`: 팀메이트 대기 중
- `Help`: 도움 필요 (사용자 개입 필요)
- `Error`: 오류 발생

**상태 변화 로직:**
```javascript
// 활성 상태 진입 조건
const isPassive = (s) => s === 'Done' || s === 'Help' || s === 'Error' || s === 'Waiting';
const isActive = (s) => s === 'Working' || s === 'Thinking';

if (isActive(newState) && (isPassive(prevState) || !existingAgent)) {
    activeStartTime = now;  // 활성 시간 초기화
}

// Done 상태 복귀 시 소요 시간 저장
if (newState === 'Done' && existingAgent && isActive(prevState)) {
    lastDuration = now - activeStartTime;
}
```

### 3.3 계층적 상태 관리

**부모-자식 관계:**
```javascript
// 자식 상태에 따른 부모 상태 재평가
getAgentWithEffectiveState(agentId) {
    // 1. Help/Error 상태 우선
    if (agent.state === 'Help' || agent.state === 'Error') return agent;

    // 2. 자식 중 Help/Error 있으면 부모도 Help
    const someChildNeedsHelp = children.some(c => c.state === 'Help' || c.state === 'Error');
    if (someChildNeedsHelp) {
        return { ...agent, state: 'Help', isAggregated: true };
    }

    // 3. 자식 중 Working/Thinking 있으면 부모도 Working
    const someChildWorking = children.some(c => c.state === 'Working' || c.state === 'Thinking');
    if (someChildWorking) {
        return { ...agent, state: 'Working', isAggregated: true };
    }

    return agent;
}
```

**데이터 검증 누락:**
- ⚠️ `updateAgent()` 진입 시 매개변수 검증 없음
- ⚠️ 상태값 enum 검증 없음 (임의 문자열 가능)
- ⚠️ ID 형식 검증 없음

---

## 4. 데이터 파이프라인 분석

### 4.1 전체 파이프라인

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Claude CLI                                                  │
│    - 훅 이벤트 발생                                             │
│    - JSON을 stdin으로 전달                                     │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. hook.js (Universal Hook Script)                            │
│    - stdin 수신 → JSON.parse                                   │
│    - _pid, _timestamp 추가                                     │
│    - 오프라인 로그 기록 (~/.pixel-agent-desk/hooks.jsonl)      │
│    - HTTP POST (127.0.0.1:47821/hook)                         │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. HTTP Server (main.js)                                       │
│    - 요청 본문 수집                                            │
│    - JSON.parse                                                │
│    - Ajv 스키마 검증                                           │
│    - 에러 핸들러에 오류 보고                                   │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. processHookEvent (Event Processor)                         │
│    - 이벤트 타입 분기                                         │
│    - SessionStart/Stop/TaskCompleted 등 처리                  │
│    - PID 매핑 관리                                            │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. AgentManager (상태 관리자)                                  │
│    - 에이전트 생성/업데이트/삭제                              │
│    - 상태 전이 관리                                           │
│    - 부모-자식 관계 관리                                      │
│    - 유휴 에이전트 정리                                       │
└──────────────────┬──────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. Renderer (UI)                                              │
│    - IPC 통해 에이전트 데이터 수신                            │
│    - 픽셀 아바타 렌더링                                       │
│    - 상태별 시각화                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 데이터 검증 계층

| 계층 | 위치 | 검증 방법 | 검증 항목 | 누락 |
|-----|------|----------|----------|------|
| L1 | hook.js | try-catch | JSON 파싱 가능성 | ⚠️ 에러 silent |
| L2 | HTTP Server | Ajv 스키마 | hook_event_name, 필수 필드 | ⚠️ 상세 검증 부족 |
| L3 | AgentManager | 없음 | 매개변수 유효성 | ❌ 전무 |
| L4 | Renderer | 없음 | 렌더링 데이터 | ⚠️ 예외 처리 의존 |

### 4.3 에러 처리 플로우

```javascript
// 1. JSON 파싱 실패
catch (e) {
    errorHandler.capture(e, {
        code: 'E002',
        category: 'PARSE',
        severity: 'WARNING'
    });
}

// 2. 스키마 검증 실패
if (!isValid) {
    errorHandler.capture(new Error('Invalid hook data'), {
        code: 'E010',
        category: 'VALIDATION',
        severity: 'WARNING',
        details: validateHook.errors
    });
}
```

**에러 핸들러 구조:**
- 중앙 집중식 에러 관리 (`errorHandler.js`)
- 에러 코드 기반 분류 (`errorConstants.js`)
- 사용자 친화적 메시지 (`errorMessages.js`)
- 파일 로깅 + Renderer 전송

---

## 5. 확장성을 위한 개선 필요사항

### 5.1 JSON 파싱 오류 방지

**현재 문제점:**
1. **hook.js silent exit** (line 44): 파싱 실패 시 에러 로그 없이 종료
2. **BOM 처리 없음**: UTF-8 BOM이 있으면 파싱 실패
3. **사이즈 제한 없음**: 대용량 페이로드로 인한 메모리 문제 가능

**개선 권장사항:**
```javascript
// 1. BOM 제거
const raw = Buffer.concat(chunks).toString().replace(/^\uFEFF/, '');

// 2. 사이즈 제한
const MAX_SIZE = 10 * 1024 * 1024; // 10MB
if (Buffer.concat(chunks).length > MAX_SIZE) {
    fs.appendFileSync(path.join(os.homedir(), '.pixel-agent-desk', 'error.log'),
        `Payload too large: ${size}\n`);
    process.exit(1);
}

// 3. 에러 로깅 강화
catch (e) {
    fs.appendFileSync(path.join(os.homedir(), '.pixel-agent-desk', 'error.log'),
        `Parse error: ${e.message}\n`);
    process.exit(1);
}
```

### 5.2 데이터 검증 강화

**현재 문제점:**
1. **느슨한 스키마**: `additionalProperties: true`로 인해 잘못된 데이터 통과 가능
2. **상태값 검증 없음**: 에이전트 상태 enum 검증 없음
3. **복구 데이터 검증 없음**: state.json, hooks.jsonl 리플레이 시 검증 없음

**개선 권장사항:**
```javascript
// 1. 상태값 enum 추가
const agentSchema = {
    type: 'object',
    required: ['id', 'state'],
    properties: {
        id: { type: 'string', format: 'uuid' },
        state: {
            type: 'string',
            enum: ['Working', 'Thinking', 'Done', 'Waiting', 'Help', 'Error']
        },
        // ... 다른 필드
    },
    additionalProperties: false  // 엄격 모드
};

// 2. 복구 데이터 검증
function validateRecoveredAgent(agent) {
    const validate = ajv.compile(agentSchema);
    return validate(agent);
}

// 3. hooks.jsonl 라인별 검증
for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const data = JSON.parse(line);
        if (validateHook(data)) {
            processHookEvent(data);
        } else {
            debugLog(`[Recover] Invalid hook: ${validateHook.errors}`);
        }
    } catch (e) {
        debugLog(`[Recover] Parse error: ${e.message}`);
    }
}
```

### 5.3 타입 안전성 강화

**현재 문제점:**
- JavaScript 동적 타이핑으로 인한 런타임 오류 가능성
- 인터페이스/타입 정의 없음
- JSDoc 주석이 부족함

**개선 권장사항:**
```javascript
// 1. JSDoc 타입 정의
/**
 * @typedef {Object} AgentData
 * @property {string} id - 고유 ID
 * @property {string} sessionId - Claude 세션 ID
 * @property {AgentState} state - 에이전트 상태
 * @property {boolean} isSubagent - 서브에이전트 여부
 */

/**
 * @typedef {'Working'|'Thinking'|'Done'|'Waiting'|'Help'|'Error'} AgentState
 */

// 2. 런타임 타입 검증 유틸리티
function validateAgentData(data) {
    if (!data || typeof data !== 'object') return false;
    if (typeof data.id !== 'string') return false;
    if (!['Working', 'Thinking', 'Done', 'Waiting', 'Help', 'Error'].includes(data.state)) {
        return false;
    }
    return true;
}
```

### 5.4 Claude Code 훅 호환성 유지

**현재 상태:**
- ✅ 모든 공식 이벤트 지원
- ✅ enum 값 호환
- ⚠️ 일부 이벤트 미구현 (ConfigChange 등은 로그만)

**향후 고려사항:**
1. **새로운 이벤트 타입 대응**: 스키마를 쉽게 확장 가능한 구조
2. **버전 관리**: 훅 데이터 포맷 버전 필드 추가
3. **하위 호환성**: 이전 버전 Claude Code와의 호환성 유지

---

## 6. Mission Control 데이터 변환

### 6.1 어댑터 패턴

**파일:** `E:\projects\pixel-agent-desk-master\missionControlAdapter.js`

**상태 매핑:**
```javascript
const STATE_MAP = {
    'Working': 'working',
    'Thinking': 'thinking',
    'Done': 'completed',
    'Waiting': 'waiting',
    'Help': 'help',
    'Error': 'error'
};
```

**데이터 검증:**
```javascript
function validateAgentData(agent) {
    if (!agent) return false;
    if (!agent.id && !agent.sessionId) return false;
    return true;
}
```

**데이터 정제:**
```javascript
function sanitizeAgentData(agent) {
    const sanitized = { ...agent };
    delete sanitized.jsonlPath;  // 민감 정보 제거
    delete sanitized.pid;
    return sanitized;
}
```

### 6.2 개선 필요사항

1. **더 엄격한 검증**: 필수 필드 전체 검증
2. **타입 변환 안전성**: 예외 처리 강화
3. **매핑 테이블 관리**: 상태 매핑 중앙화

---

## 7. 종합 평가 및 권장사항

### 7.1 현재 아키텍처 장점

✅ **견고한 에러 처리:** 중앙 집중식 에러 핸들러
✅ **오프라인 복구:** hooks.jsonl로 데이터 보존
✅ **계층적 상태 관리:** 부모-자식 관계 지원
✅ **스키마 검증:** Ajv를 사용한 기본 검증
✅ **호환성:** Claude Code 공식 훅과 호환

### 7.2 주요 취약점

❌ **검증 불균형:** 일부 경로에는 검증이 전무
❌ **Silent Failure:** hook.js에서 에러가 조용히 사라짐
❌ **타입 안전성 부족:** 런타임 타입 오류 가능성
❌ **느슨한 스키마:** 추가 속성 무시로 잘못된 데이터 통과
❌ **복구 데이터 미검증:** 저장된 데이터를 믿고 사용

### 7.3 우선순위별 개선 권장사항

#### P0 (긴급)
1. **hook.js 에러 로깅 강화**: silent exit 제거
2. **복구 데이터 검증**: state.json, hooks.jsonl 파싱 시 스키마 검증
3. **상태값 enum 검증**: AgentManager 진입 시 상태값 검증

#### P1 (중요)
1. **스키마 엄격화**: `additionalProperties: false` 적용 검토
2. **타입 정의 추가**: JSDoc 또는 TypeScript 도입
3. **BOM 처리**: UTF-8 BOM 제거 로직

#### P2 (개선)
1. **페이로드 사이즈 제한**: 메모리 보호
2. **버전 관리**: 훅 데이터 포맷 버전 필드
3. **통합 테스트:** 데이터 파이프라인 엔드투엔드 테스트

### 7.4 확장성 고려사항

**50개 에이전트 지원을 위한 준비:**
1. **데이터 구조 최적화**: 불필요한 필드 제거
2. **검증 성능**: Ajv 컴파일 캐싱 (현재 미사용)
3. **메모리 관리**: AgentManager Map 크기 모니터링

**새로운 훅 이벤트 대응:**
1. **확장 가능한 스키마**: 이벤트 타입 enum을 설정에서 관리
2. **플러그인 아키텍처**: 이벤트 핸들러 모듈화

---

## 8. 결론

Pixel Agent Desk의 데이터 파이프라인은 전반적으로 잘 설계되어 있으나, **데이터 검증의 일관성 부족**이 주요 취약점입니다. 특히 복구 경로와 AgentManager 진입 지점의 검증 강화가 시급합니다.

Claude Code 훅 레퍼런스와의 호환성은 양호하나, 향후 Claude Code 업데이트에 유연하게 대응하기 위해 버전 관리와 확장 가능한 스키마 설계가 권장됩니다.

**전체 평가:** 7/10
- 데이터 구조: 8/10
- 검증 시스템: 6/10
- 확장성: 7/10
- 호환성: 9/10

---

**문서 버전:** 1.0
**분석자:** Claude (Sonnet 4.6)
**분석 기준일:** 2026-03-05
