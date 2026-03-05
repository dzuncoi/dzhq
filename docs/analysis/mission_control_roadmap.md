# Mission Control Dashboard 로드맵
## 제품 기획 기반 개선 계획

**작성일:** 2026-03-05
**버전:** 1.0.0
**상태:** 기획 단계

---

## 1. 현재 구현 현황 분석

### 1.1 Mission Control 구현 아키텍처

#### 핵심 파일 구조
- **E:\projects\pixel-agent-desk-master\mission-control-server.js**
  - HTTP 서버 (포트 3000)
  - REST API 엔드포인트 구현
  - WebSocket 서버 (수동 구현)
  - 에이전트 데이터 브로드캐스팅

- **E:\projects\pixel-agent-desk-master\missionControlAdapter.js**
  - Pixel Agent Desk ↔ Mission Control 데이터 변환
  - 상태 매핑 (Working → working, Done → completed)
  - 프로젝트명 추출 및 에이전트 타입 결정
  - 데이터 검증 및 보안 정제

- **E:\projects\pixel-agent-desk-master\missionControlPreload.js**
  - IPC 브리지 (contextBridge)
  - 이벤트 리스너 등록 (agent-added, agent-updated, agent-removed)
  - 메인 프로세스와의 안전한 통신

- **E:\projects\pixel-agent-desk-master\mission-control.html**
  - 단일 페이지 대시보드 UI
  - 실시간 에이전트 상태 표시
  - 프로젝트별 그룹화
  - 통계 패널 (전체, 활성, 완료, 평균 시간)

### 1.2 REST API 엔드포인트 현황

| 엔드포인트 | 메서드 | 기능 | 상태 |
|-----------|--------|------|------|
| `/api/agents` | GET | 전체 에이전트 목록 조회 | ✅ 구현됨 |
| `/api/agents/:id` | GET | 특정 에이전트 상세 조회 | ✅ 구현됨 |
| `/api/stats` | GET | 통계 데이터 조회 | ✅ 구현됨 |
| `/api/health` | GET | 서버 상태 확인 | ✅ 구현됨 |

**현재 제한사항:**
- POST/PUT/DELETE 메서드 미지원 (읽기 전용)
- 페이지네이션 없음
- 필터링/정렬 기능 없음
- 인증/권한 부재

### 1.3 WebSocket 실시간 업데이트 구조

#### 연결 방식
```
클라이언트 → ws://localhost:3000/ws
           ↓
WebSocket 핸드셰이크 (Sec-WebSocket-Accept)
           ↓
초기 데이터 전송 (type: 'initial')
           ↓
실시간 업데이트 (broadcastUpdate)
```

#### 이벤트 타입
- `initial`: 초기 에이전트 목록
- `agent-added`: 에이전트 생성
- `agent-updated`: 에이전트 상태 변경
- `agent-removed`: 에이전트 삭제

#### 현재 제한사항
- 수동 WebSocket 구현 (라이브러리 미사용)
- 재연결 로직 부재
- 하트비트 메커니즘 없음
- 바이너리 데이터 미지원

### 1.4 대시보드 UI/UX 현황

#### 강점
- 반응형 디자인 (Grid + Flexbox)
- 실시간 상태 표시 (Working, Thinking, Done, Error, Help)
- 프로젝트별 자동 그룹화
- 부드러운 애니메이션 (fadeIn, slideIn)
- 색상 기반 상태 구분

#### 개선 필요 사항
- 단일 HTML 파일 (모듈화 필요)
- 하드코딩된 스타일 (CSS-in-JS 또는 별도 파일 권장)
- 필터링/검색 기능 부재
- 에이전트 상세 뷰 없음
- 실시간 차트/그래프 부재
- 모바일 최적화 미흡

---

## 2. Claude Code 훅 레퍼런스 기반 활용방안

### 2.1 현재 활용 중인 훅
- ✅ **SubagentStart**: 서브에이전트 생성 시 자동 등록
- ✅ **SubagentStop**: 서브에이전트 완료 시 상태 업데이트
- ✅ **SessionStart**: 초기 에이전트 데이터 로드

### 2.2 활용 가능한 새로운 훅

#### Priority 1: 실시간 협업 강화
| 훅 | 활용안 | 기대 효과 |
|----|---------|----------|
| **PostToolUse** | 툴 실행 완료 시 작업 타임라인에 기록 | 에이전트 활동 내역 시각화 |
| **PreToolUse** | 툴 실행 전 사용자 알림 (권한 필요 시) | 중요 작업 사전 인지 |
| **UserPromptSubmit** | 사용자 요청 시 Task 카드 생성 | 작업 관리 자동화 |
| **TaskCompleted** | 작업 완료 시 진행률 업데이트 | 프로젝트 진척도 파악 |

#### Priority 2: 이벤트 필터링 및 알림
| 훅 | 활용안 | 기대 효과 |
|----|---------|----------|
| **Notification** | Claude 알림을 대시보드에 표시 | 중요 이벤트 실시간 파악 |
| **PermissionRequest** | 권한 요청 시 승인/거부 UI | 보안 강화 |
| **Stop** | 세션 종료 시 리소스 정리 로깅 | 디버깅 용이성 |

#### Priority 3: 팀 생산성 분석
| 훅 | 활용안 | 기대 효과 |
|----|---------|----------|
| **InstructionsLoaded** | CLAUDE.md 로드 횟수 추적 | 프로젝트 설정 활용도 분석 |
| **ConfigChange** | 설정 변경 이력 기록 | 팀 워크플로우 파악 |
| **TeammateIdle** | 팀메이트 유휴 시간 추적 | 리소스 활용도 최적화 |

### 2.3 구현 예시: PostToolUse 훅 연동

**설정 파일 (`.claude/settings.json`)**
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "type": "command",
        "command": "node hooks/record-tool-usage.js",
        "async": true
      }
    ]
  }
}
```

**훅 핸들러 (`hooks/record-tool-usage.js`)**
```javascript
#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const input = JSON.parse(process.stdin);
const timestamp = new Date().toISOString();
const logPath = path.join(process.env.CLAUDE_PROJECT_DIR, '.claude', 'tool-usage.log');

const logEntry = {
  timestamp,
  toolName: input.tool_name,
  toolInput: input.tool_input,
  duration: input.duration,
  sessionId: input.session_id
};

fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n');
console.log(JSON.stringify({ continue: true }));
```

---

## 3. 우선순위별 기능 로드맵

### Phase 1: 기본 기능 안정화 (1-2주)

#### P0-1: WebSocket 재연결 메커니즘
**목표:** 연결 끊김 시 자동 복구

**구현 항목:**
- [ ] WebSocket 연결 상태 모니터링
- [ ] 지수 백오프 재연결 로직 (1s → 2s → 4s → 8s → 16s → 32s)
- [ ] 연결 복구 시 데이터 재동기화
- [ ] 연결 실패 알림 UI

**성공 기준:**
- 연결 끊김 후 30초 내 자동 복구
- 복구 시 데이터 누락 없음

**예상 소요시간:** 4시간

#### P0-2: API 에러 핸들링 개선
**목표:** 에러 발생 시 사용자 친화적 피드백

**구현 항목:**
- [ ] 표준 HTTP 에러 코드 정의 (400, 404, 500, 503)
- [ ] 에러 메시지 한국어화
- [ ] 재시도 메커니즘 (GET 요청만)
- [ ] 에러 로그 파일 저장

**성공 기준:**
- 모든 에러 상황에서 사용자 피드백 제공
- 에러 로그 100% 기록

**예상 소요시간:** 3시간

#### P0-3: 데이터 검증 및 보안 강화
**목표:** 무결성 데이터 전송

**구현 항목:**
- [ ] JSON 스키마 검증 (ajv 라이브러리)
- [ ] XSS 방지 입력 필터링
- [ ] 민감 정보 마스킹 (PID, jsonlPath)
- [ ] CORS 설정 개선 (특정 도메인만 허용)

**성공 기준:**
- 모든 입력 데이터 검증 통과
- 민정 정보 0% 노출

**예상 소요시간:** 5시간

---

### Phase 2: 실시간 협업 기능 강화 (2-3주)

#### P1-1: PostToolUse 훅 연동
**목표:** 에이전트 활동 타임라인 시각화

**구현 항목:**
- [ ] PostToolUse 훅 핸들러 구현
- [ ] 툴 사용 로그 저장소 구축
- [ ] 타임라인 UI 컴포넌트 개발
- [ ] 실시간 타임라인 업데이트

**UI/UX 설계:**
```
┌─────────────────────────────────────┐
│ Agent Timeline                     │
├─────────────────────────────────────┤
│ ● Agent-1 (Working)               │
│   ├─ Read file.js (2s)            │
│   ├─ Edit function (1.5s)         │
│   └─ Run tests (3s)               │
│ ● Agent-2 (Thinking)              │
│   └─ Analyze code...              │
└─────────────────────────────────────┘
```

**성공 기준:**
- 툴 실행 1초 내 UI 반영
- 최근 100개 툴 사용 기록 표시

**예상 소요시간:** 8시간

#### P1-2: UserPromptSubmit 훅 연동
**목표:** 작업(Task) 관리 자동화

**구현 항목:**
- [ ] Task 자동 생성 시스템
- [ ] Task 상태 추적 (Pending → In Progress → Done)
- [ ] Task 보드 UI (칸반 스타일)
- [ ] Task 완료 시 알림

**UI/UX 설계:**
```
┌─────────────────────────────────────┐
│ Task Board                         │
├─────────────────────────────────────┤
│ 🔵 To Do (3)                       │
│   - Fix login bug                 │
│   - Add unit tests                │
│   - Update docs                   │
│                                    │
│ 🟡 In Progress (2)                │
│   - Refactor auth module          │
│   - Optimize queries              │
│                                    │
│ 🟢 Done (5)                       │
│   - Setup CI/CD                   │
│   - Code review                   │
└─────────────────────────────────────┘
```

**성공 기준:**
- 사용자 프롬프트 100% Task 변환
- Task 완료 5초 내 알림

**예상 소요시간:** 10시간

#### P1-3: 실시간 알림 시스템
**목표:** 중요 이벤트 즉시 파악

**구현 항목:**
- [ ] 알림 생성 이벤트 정의
- [ ] 알림 타입별 UI 디자인 (Info, Warning, Error, Success)
- [ ] 알림 히스토리 저장
- [ ] 알림 필터링 기능

**알림 타입:**
- `agent-added`: 새 에이전트 생성
- `agent-error`: 에이전트 에러 발생
- `task-completed`: 작업 완료
- `tool-failed`: 툴 실행 실패
- `session-end`: 세션 종료

**성공 기준:**
- 이벤트 발생 2초 내 알림 표시
- 알림 100개까지 저장

**예상 소요시간:** 6시간

---

### Phase 3: 대시보드 시각화 고도화 (3-4주)

#### P2-1: 에이전트 상세 뷰
**목표:** 개별 에이전트 심층 분석

**구현 항목:**
- [ ] 에이전트 클릭 시 상세 모달
- [ ] 상태 전이 히스토리
- [ ] 리소스 사용량 차트
- [ ] 툴 사용 통계
- [ ] 관련 서브에이전트 트리

**UI/UX 설계:**
```
┌─────────────────────────────────────┐
│ Agent Detail: Agent-1              │
├─────────────────────────────────────┤
│ State: Working                     │
│ Duration: 5m 23s                   │
│ Project: pixel-agent-desk          │
│                                    │
│ State Transition:                  │
│ Done → Working → Thinking → ...   │
│                                    │
│ Tool Usage:                        │
│ Read: 45% ████████████████         │
│ Edit: 30% █████████                │
│ Bash: 15% ████                     │
│                                    │
│ Subagents: (2)                     │
│ ├─ Agent-2 (Done)                 │
│ └─ Agent-3 (Working)              │
└─────────────────────────────────────┘
```

**성공 기준:**
- 모든 에이전트 데이터 표시
- 모달 로딩 500ms 미만

**예상 소요시간:** 12시간

#### P2-2: 생산성 분석 대시보드
**목표:** 팀/프로젝트 성과 측정

**구현 항목:**
- [ ] 일별/주별/월별 통계
- [ ] 에이전트별 완료율
- [ ] 프로젝트별 진척도
- [ ] 평균 소요 시간 추이
- [ ] 에러율 추이

**차트 종류:**
- Line Chart: 시간대별 에이전트 수
- Bar Chart: 프로젝트별 완료 작업
- Pie Chart: 에이전트 상태 분포
- Heatmap: 시간대별 활동량

**성공 기준:**
- 최근 30일 데이터 조회
- 차트 로딩 1초 미만

**예상 소요시간:** 16시간

#### P2-3: 필터링 및 검색 기능
**목표:** 대량 에이전트 효율적 관리

**구현 항목:**
- [ ] 상태 필터 (Working, Thinking, Done, Error)
- [ ] 프로젝트 필터
- [ ] 에이전트 타입 필터 (Main, Subagent, Teammate)
- [ ] 이름 검색 (실시간)
- [ ] 고급 필터 (기간, 소요 시간)

**UI/UX 설계:**
```
┌─────────────────────────────────────┐
│ 🔍 Search agents...                │
│                                    │
│ Filters:                           │
│ □ Working  □ Thinking  □ Done     │
│ □ Error    □ Help                 │
│                                    │
│ Projects:                          │
│ □ pixel-agent-desk                │
│ □ another-project                 │
│                                    │
│ Types:                             │
│ □ Main  □ Subagent  □ Teammate   │
│                                    │
│ Date Range:                        │
│ [From] ▼  [To] ▼                  │
└─────────────────────────────────────┘
```

**성공 기준:**
- 필터 적용 200ms 미만 반영
- 복합 필터 지원

**예상 소요시간:** 8시간

---

### Phase 4: 팀 협업 기능 (4-5주)

#### P3-1: 멀티 유저 지원
**목표:** 팀원 간 실시간 공유

**구현 항목:**
- [ ] 사용자 인증 시스템 (JWT)
- [ ] 접속 사용자 목록 표시
- [ ] 사용자별 권한 관리 (View, Edit, Admin)
- [ ] 활동 히스토리 공유

**성공 기준:**
- 최대 10명 동시 접속
- 100ms 미만 동기화 지연

**예상 소요시간:** 20시간

#### P3-2: TaskCompleted 훅 연동
**목표:** 작업 완료 자동 보고

**구현 항목:**
- [ ] Task 완료 이벤트 수신
- [ ] 완료 보고서 자동 생성
- [ ] Slack/Email 알림 연동
- [ ] 완료 작업 로그 저장

**보고서 항목:**
- 작업 제목 및 설명
- 소요 시간
- 사용된 툴 목록
- 관련 에이전트
- 완료 시간

**성공 기준:**
- 완료 10초 내 보고서 생성
- 100% 완료 이벤트 캡처

**예상 소요시간:** 10시간

#### P3-3: ConfigChange 훅 연동
**목표:** 설정 변경 히스토리 관리

**구현 항목:**
- [ ] 설정 변경 감지
- [ ] 변경 전후 비교
- [ ] 변경 로그 저장
- [ ] 롤백 기능

**UI/UX 설계:**
```
┌─────────────────────────────────────┐
│ Config History                     │
├─────────────────────────────────────┤
│ 2026-03-05 14:30 - User: john     │
│   Changed: maxAgents 10 → 20       │
│   [Diff] [Revert]                  │
│                                    │
│ 2026-03-05 12:15 - User: jane     │
│   Changed: idleTimeout 10m → 15m   │
│   [Diff] [Revert]                  │
└─────────────────────────────────────┘
```

**성공 기준:**
- 모든 설정 변경 기록
 롤백 1초 내 완료

**예상 소요시간:** 8시간

---

## 4. 기술적 고려사항

### 4.1 성능 최적화

#### 데이터 전송 최적화
- **WebSocket 메시지 압축:** gzip 사용 (70% 크기 감소)
- **증분 업데이트:** 전체 데이터 대신 변경된 필드만 전송
- **요청 허리 제한:** 클라이언트 당 1초 1회 요청 제한

#### 렌더링 최적화
- **가상 스크롤:** 100개 이상 에이전트 시 사용
- **Lazy Loading:** 상세 뷰 데이터는 요청 시 로드
- **Debouncing:** 검색 입력 300ms 디바운스

### 4.2 보안 강화

#### 인증 및 권한
```javascript
// JWT 토큰 검증 미들웨어
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.sendStatus(401);

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}
```

#### 속도 제한 (Rate Limiting)
```javascript
// 요청 속도 제한
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1분
  max: 100, // 최대 100 요청
  message: '너무 많은 요청을 보내셨습니다.'
});

app.use('/api/', limiter);
```

### 4.3 테스트 전략

#### 단위 테스트 (Jest)
- [ ] Adapter 함수 테스트
- [ ] Stats 계산 로직 테스트
- [ ] WebSocket 메시지 파싱 테스트

#### 통합 테스트
- [ ] API 엔드포인트 테스트
- [ ] WebSocket 연결 테스트
- [ ] Hook 핸들러 테스트

#### E2E 테스트 (Playwright)
- [ ] 대시보드 로딩 테스트
- [ ] 필터링 기능 테스트
- [ ] 실시간 업데이트 테스트

---

## 5. 성공 지표

### 정량적 지표

| 지표 | 현재 | 목표 (3개월) | 측정 방법 |
|------|------|--------------|-----------|
| 대시보드 로딩 시간 | 2s | 500ms | Lighthouse Performance |
| WebSocket 연결 안정성 | 70% | 99% | 연결 실패율 |
| 에이전트 표시 지연 | 1s | 100ms | 이벤트 수신 → UI 렌더링 |
| 동시 접속 지원 | 1명 | 10명 | 부하 테스트 |
| API 응답 시간 | 200ms | 50ms | Postman 벤치마크 |
| 알림 도달률 | 0% | 95% | 이벤트 → 알림 표시 |

### 정성적 지표

| 지표 | 현재 | 목표 (3개월) | 측정 방법 |
|------|------|--------------|-----------|
| UI/UX 만족도 | 3/5 | 4.5/5 | 사용자 설문 |
| 에이전트 가시성 | 60% | 90% | 상태 추적 정확도 |
| 협업 효율 | N/A | 30% 향상 | 작업 완료 시간 단축 |
| 디버깅 용이성 | 2/5 | 4/5 | 문제 해결 시간 단축 |

---

## 6. 리스크 관리

### 기술적 리스크

| 리스크 | 확률 | 영향 | 완화 방안 |
|--------|------|------|-----------|
| WebSocket 연결 불안정 | 중 | 높 | 자동 재연결 + 하트비트 |
| 대량 에이전트 렌더링 지연 | 높 | 중 | 가상 스크롤 + 페이지네이션 |
| 메모리 누수 | 중 | 높 | 정기적 리소스 정리 + 모니터링 |
| API 보안 취약점 | 저 | 높 | 인증 + 속도 제한 + 입력 검증 |

### 운영적 리스크

| 리스크 | 확률 | 영향 | 완화 방안 |
|--------|------|------|-----------|
| 사용자 낮은 도입률 | 중 | 중 | 사용자 가이드 + 튜토리얼 |
| 호환성 문제 | 중 | 중 | 브라우저 테스트 + 폴리필 |
| 요구사항 변경 빈번 | 높 | 중 | 애자일 방법론 + 기능 플래그 |

---

## 7. 다음 단계

### 즉시 실행 (주초)
1. **P0-1 WebSocket 재연결** 구현 시작
2. **P0-2 API 에러 핸들링** 개선
3. **PostToolUse 훅 프로토타입** 개발

### 주말까지 완료
1. **P1-1 타임라인 UI** 프로토타입
2. **P1-2 Task 보드** 기본 기능
3. **사용자 테스트** (내부 팀)

### 월말까지 완료
1. **Phase 1 전체** 완료
2. **Phase 2 절반** 진행
3. **베타 릴리스** 준비

---

## 부록: 참고 자료

### 문서
- [Claude Code Hooks 공식 문서](https://code.claude.com/docs/en/hooks)
- [WebSocket API MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [REST API 베스트 프랙티스](https://restfulapi.net/)

### 도구
- **ws:** WebSocket 라이브러리 (수동 구현 대체)
- **ajv:** JSON 스키마 검증
- **jsonwebtoken:** JWT 인증
- **express-rate-limit:** 속도 제한
- **Chart.js:** 차트 라이브러리

---

**문서 버전:** 1.0.0
**마지막 수정:** 2026-03-05
**다음 리뷰:** 2026-03-12
