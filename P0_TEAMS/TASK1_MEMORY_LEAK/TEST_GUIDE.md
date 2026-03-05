# 메모리 누수 수정: 테스트 가이드

**수정 일자:** 2026-03-05
**수정 내용:** P0-1 메모리 누수 수정 (interval 정리, Map 정리)
**예상 시간:** 30분

---

## 1. 빠른 테스트 (5분)

### 1.1 앱 실행 및 기본 기능 확인

```bash
# 1. 앱 시작
npm start

# 2. Chrome DevTools 열기
# F12 또는 Ctrl+Shift+I → Memory 탭

# 3. 기준선 측정
# - 1분 대기
# - Heap Snapshot 찍기 (Take Snapshot)
# - 메모리 사용량 기록 (예: 45MB)
```

### 1.2 에이전트 생성/제거 테스트

```javascript
// 1. 테스트 에이전트 활성화
// main.js Line 726: ENABLE_TEST_AGENTS = true

// 2. 앱 재시작 후 10개 테스트 에이전트가 생성되는지 확인

// 3. 수동으로 모든 에이전트 제거 (카드 우클릭 → Dismiss)

// 4. 위 과정을 5회 반복

// 5. 최종 Heap Snapshot 찍고 비교
```

**성공 기준:**
- [ ] 앱이 5분 동안 멈추지 않음
- [ ] 에이전트 생성/제거가 정상 작동
- [ ] Console에 "Cleaned up agent" 로그 확인
- [ ] 앱 종료 시 프로세스가 즉시 정리됨

---

## 2. 상세 테스트 (30분)

### 2.1 메모리 누수 검증

**준비:**
```
1. npm start
2. Chrome DevTools → Memory → Heap Snapshot
3. 테스트 에이전트 활성화 (ENABLE_TEST_AGENTS = true)
```

**단계 1: 기준선 측정 (5분)**
```
1. 앱 시작 후 1분 대기
2. Heap Snapshot 1 찍기
3. 메모리 사용량 기록: _______ MB
```

**단계 2: 스트레스 테스트 (10분)**
```
1. 앱 재시작 (Refresh 또는 npm start 재실행)
2. 10개 테스트 에이전트가 자동 생성됨
3. 30초 대기
4. 모든 에이전트 수동 제거 (우클릭 → Dismiss)
5. 30초 대기
6. 위 과정을 10회 반복
```

**단계 3: 결과 확인 (5분)**
```
1. 최종 Heap Snapshot 2 찍기
2. Comparison 모드로 비교
3. 메모리 사용량 기록: _______ MB
4. "Detached DOM nodes" 검색
```

**성공 기준:**
- [ ] 메모리 증가율 < 100% (기준선의 2배 이하)
- [ ] Detached DOM nodes = 0개
- [ ] (new)와 (deleted) 객체 수가 균형적

### 2.2 기능 회귀 테스트

**에이전트 관리:**
- [ ] 에이전트가 정상적으로 생성됨
- [ ] 에이전트 상태가 정상적으로 변경됨 (Working → Done)
- [ ] 에이전트가 정상적으로 제거됨
- [ ] Dismiss 버튼이 작동함

**애니메이션:**
- [ ] Working 상태에서 애니메이션이 재생됨
- [ ] Done 상태에서 애니메이션이 멈춤
- [ ] 에이전트 제거 시 애니메이션이 정리됨

**윈도우 관리:**
- [ ] 윈도우가 항상 최상위에 유지됨
- [ ] 윈도우 크기가 에이전트 수에 따라 조절됨
- [ ] 앱 종료 시 윈도우가 정상적으로 닫힘

### 2.3 로그 확인

**Console 로그:**
```
[Main] Keep-alive interval started
[Main] Keep-alive interval stopped (앱 종료 시)
[Cleanup] Resources cleared for xxxxxxxx
[Renderer] Cleaned up agent xxxxxxxx (intervals cleared)
```

**확인할 점:**
- [ ] "Keep-alive interval started" 로그 확인
- [ ] 에이전트 제거 시 "Cleanup" 로그 확인
- [ ] "Renderer" 로그에서 "intervals cleared" 확인
- [ ] 에러 메시지 없음

---

## 3. 장시간 테스트 (선택, 4시간)

### 3.1 자동화된 테스트 스크립트

```javascript
// test-memory.js
const { app, BrowserWindow } = require('electron');

app.on('ready', () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true
    }
  });

  win.loadURL('file://' + __dirname + '/index.html');

  // 30분마다 메모리 기록
  let iteration = 0;
  const interval = setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsed = Math.round(mem.heapUsed / 1024 / 1024);
    const external = Math.round(mem.external / 1024 / 1024);

    console.log(`[${iteration++}] Memory: heap=${heapUsed}MB, external=${external}MB`);

    if (iteration >= 8) { // 4시간 (30분 * 8)
      clearInterval(interval);
      app.quit();
    }
  }, 30 * 60 * 1000);
});
```

### 3.2 수동 장시간 테스트

**절차:**
```
1. 앱 시작
2. 실제 개발 작업 수행 (Claude CLI 사용)
3. 30분마다 Chrome DevTools에서 메모리 기록
4. 4시간 후 메모리 그래프 확인
```

**성공 기준:**
- [ ] 4시간 동안 앱이 멈추지 않음
- [ ] 메모리 증가율 < 10%/시간
- [ ] 응답 속도 저하 없음

---

## 4. 문제 해결 가이드

### 4.1 테스트 실패 시

**메모리가 계속 증가한다면:**
```
1. Chrome DevTools → Memory → Allocation sampling
2. 5분간 녹화 후 중지
3. 가장 많이 할당된 함수 확인
4. 해당 함수에서 interval/Map 누수 확인
```

**Detached DOM nodes가 발견된다면:**
```
1. Heap Snapshot → "Detached DOM nodes" 검색
2. Retainers 확인 (어디서 참조하고 있는지)
3. 해당 참조 제거
4. renderer.js의 removeAgent() 함수 확인
```

### 4.2 일반적인 문제

| 문제 | 원인 | 해결 |
|------|------|------|
| 앱이 시작하지 않음 | 문법 오류 | npm start 로그 확인 |
| 에이전트가 생성되지 않음 | ENABLE_TEST_AGENTS = false | true로 변경 후 재시작 |
| 메모리가 감소하지 않음 | GC가 아직 실행 안 됨 | Force GC: Chrome DevTools → 휴지통 아이콘 클릭 |
| 로그가 안 보임 | debug.log 파일 권한 | 파일 삭제 후 재시작 |

---

## 5. 테스트 결과 보고서

### 5.1 결과 템플릿

```markdown
## 메모리 누수 테스트 결과

**테스트 일자:** 2026-03-05
**테스터:** [이름]
**테스트 환경:** Windows 11, Node.js vXX, Electron vXX

### 1. 빠른 테스트 결과
- [ ] 통과 / [ ] 실패
- 메모리: 기준선 ____ MB → 최종 ____ MB (____% 증가)

### 2. 상세 테스트 결과
- [ ] 통과 / [ ] 실패
- Detached DOM nodes: ____ 개
- 메모리 증가율: ____%

### 3. 기능 회귀 테스트
- 에이전트 관리: [ ] 통과 / [ ] 실패
- 애니메이션: [ ] 통과 / [ ] 실패
- 윈도우 관리: [ ] 통과 / [ ] 실패

### 4. 로그 확인
- [ ] Keep-alive interval started 확인
- [ ] Cleanup 로그 확인
- [ ] Renderer intervals cleared 확인

### 5. 종합 의견
- [ ] 릴리스 권장 / [ ] 추가 수정 필요
- 특이사항:
```

### 5.2 성공 사례

```
테스트 1: 빠른 테스트
- 기준선: 45MB
- 최종: 65MB (44% 증가)
- 결과: ✅ 통과 (100% 이하 증가)

테스트 2: 상세 테스트
- Detached DOM nodes: 0개
- 메모리 증가율: 35%
- 결과: ✅ 통과

테스트 3: 기능 회귀
- 모든 기능 정상 작동
- 결과: ✅ 통과

종합: 릴리스 권장 ✅
```

---

## 6. 다음 단계

### 6.1 테스트 통과 시
1. Git 커밋: "fix: 메모리 누수 수정 (interval/Map 정리)"
2. PR 생성: P0-1 완료 보고
3. Code Review 요청
4. Merge 후 v0.1.1 릴리스

### 6.2 테스트 실패 시
1. 실패 원인 분석 (Allocation sampling 활용)
2. 추가 수정 후 재테스트
3. 보고서에 실패 원인 기록
4. 다음 스프린트로 이관

---

**문의:** P0-1 전문가 팀
**승인:** 개발 리드
**다음 리뷰:** 2026-03-12
