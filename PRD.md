# 📋 PRD: Pixel Agent Desk v2

## 목표
Claude CLI 사용 중인 세션을 픽셀 캐릭터로 시각화

## 핵심 기능
1. **JSONL 파일 감시**: `~/.claude/projects/*/` 폴더의 `.jsonl` 파일 실시간 모니터링
2. **멀티 에이전트**: 여러 Claude CLI 세션 동시 표시
3. **상태 시각화**: Working/Done/Waiting/Error 상태에 따른 애니메이션
4. **터미널 포커스**: 에이전트 클릭 시 해당 터미널로 포커스
5. **서브에이전트**: `subagents/agent-*.jsonl` 파일 감지 → 별도 아바타 (보라색 작은 캐릭터)

## 상태 정의
| 상태 | 조건 | 애니메이션 |
|------|------|-----------|
| Working | `stop_reason` 없음 | 일하는 포즈 (frames 1-4) |
| Done | `stop_reason: "end_turn"` | 춤추는 포즈 (frames 20-27) |
| Waiting | 초기 상태 (에이전트 없을 때) | 앉아 있는 포즈 (frame 32) |
| Error | 에러 발생 | 경고 포즈 (frames 0, 31) |

## 에이전트 생명주기
- **표시 조건**: JSONL 파일이 30분 이내 변경된 경우
- **초기 표시**: 앱 시작 시 `Waiting...` 대기 아바타 표시 (에이전트 없을 때)
- **자동 제거**: JSONL mtime 기준 30분 이상 변화 없으면 제거 (5분마다 체크)
- **즉시 제거**: 로그에 `subtype: "SessionEnd"` 감지 시 (현재 Claude CLI가 실제로 안 씀)

## 아키텍처
```
JSONL 파일 (fs.watch)
    ↓
jsonlParser (상태 파싱)
    ↓
agentManager (에이전트 관리)
    ↓
IPC → renderer (UI 표시)
```

## 파일 구조
- `main.js`: Electron 메인 프로세스
- `logMonitor.js`: JSONL 파일 감시
- `jsonlParser.js`: 로그 파싱
- `agentManager.js`: 에이전트 상태 관리
- `renderer.js`: UI 렌더링
- `preload.js`: IPC 브릿지
- `styles.css`: 스타일

## 구현 현황
- ✅ JSONL 파일 감시 (30분 윈도우)
- ✅ 상태 파싱
- ✅ 멀티 에이전트 UI
- ✅ 애니메이션
- ✅ 서브에이전트 시각 구분 (보라색 점선 + Sub 배지)
- ✅ 에이전트 없을 때 대기 아바타 표시
- ✅ 30분 비활성 에이전트 자동 제거

## 미구현 / 고려 중

### Offline 상태 (흐림 표시)
JSONL mtime가 5~30분 사이이면 아바타를 흑백+반투명으로 표시해
"터미널이 닫혔을 수 있다"는 신호를 줌. 30분 초과 시 제거.
- `state-offline` CSS 클래스 (흑백, 점선, opacity 0.5)
- `agentManager.setOffline(id)` 메서드
- 5분마다 mtime 체크

### 터미널 강제 종료 감지 (프로세스 모니터링)
터미널 창을 X 버튼으로 강제 종료하면 SessionEnd 훅이 발동하지 않는 문제가 있음.
이를 해결하기 위해 PID(프로세스 ID)를 기반으로 1초마다 생존 여부를 모니터링함. 향후 구현/세련화할 2가지 대안:

1. **URL 콜백 방식 (가장 추천하는 현대적 방식 🚀)**
   - 최신 Claude CLI(v2.1.63+)에서는 훅 실행 시 쉘 명령 대신 URL POST 콜백을 보낼 수 있음.
   - **방법**: Pixel Agent Desk 메인 프로세스(앱)에 아주 작은 로컬 HTTP 서버(예: `localhost:3000`)를 띄워둠.
   - **동작**: Claude 시작 시 `http://localhost:3000/start`로 자신의 세션 정보와 PID를 쏨.
   - **장점**: JSON 파일(`agent_pids.json`)을 I/O로 썼다 지웠다 할 필요 없이, 메모리에서 실시간으로 통신하므로 응답 속도가 훨씬 빠르고 구조가 깔끔함. 장애(예외) 처리도 쉬움.

2. **CWD 기반 WMI 모니터링 (대안)**
   - 매 3~5초마다 OS(Windows WMI 등)를 통해 실행 중인 `node.exe` 프로세스의 커맨드라인(CWD)을 검사해 터미널 닫힘을 파악. (현재 적용된 PID 스니핑 방식의 또 다른 우회 방법)

### SessionEnd 훅 → JSONL 직접 기록 방식
HTTP 서버 없이 훅만으로 세션 종료를 즉시 감지하는 방법:

Claude CLI 훅은 실행 시 stdin으로 아래 데이터를 줌:
```json
{
  "session_id": "abc123",
  "transcript_path": "~/.claude/projects/xxx/abc123.jsonl"
}
```

`SessionEnd` 훅 스크립트가 `transcript_path`에 직접 한 줄을 append:
```js
// sessionend_hook.js
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const { transcript_path, session_id } = JSON.parse(Buffer.concat(chunks).toString());
  const fs = require('fs');
  fs.appendFileSync(transcript_path, JSON.stringify({
    type: 'system',
    subtype: 'SessionEnd',
    sessionId: session_id,
    timestamp: new Date().toISOString()
  }) + '\n');
});
```

`logMonitor`의 `fs.watch`가 변경을 즉시 감지 → `SessionEnd` 파싱 → 에이전트 제거.
**HTTP 서버 불필요** — 과거 사용하던 `server.js`도 더 이상 필요 없습니다.

`.claude/settings.json` 훅 등록:
```json
{
  "hooks": {
    "SessionEnd": [{
      "type": "command",
      "command": "node /path/to/sessionend_hook.js"
    }]
  }
}
```

## 실행 방법
```bash
npm install
npm start
```

## 테스트 방법
1. 터미널에서 `claude` 실행
2. 아무 말이나 입력
3. 에이전트 카드 표시 확인
