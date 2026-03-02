# Pixel Agent Desk 👾

Claude CLI와 실시간으로 동기화되어 에이전트의 상태를 귀여운 픽셀 아트로 보여주는 데스크톱 애플리케이션입니다.

![Pixel Agent Demo](avatar_00.png) <!-- 임시 이미지 경로 -->

## 🌟 주요 기능

- **실시간 상태 동기화**: Claude Code의 Hook 시스템을 이용해 에이전트가 생각 중인지, 일하는 중인지, 사용자 답변을 기다리는지 즉시 반영합니다.
- **5가지 핵심 상태 라벨**:
  - `Waiting...`: 새로운 세션 시작 전이나 대화 종료 후 대기 상태
  - `Working...`: 프롬프트 처리, 도구 사용, 서브 에이전트 가동 중
  - `Done!`: 모든 작업이 성공적으로 완료됨
  - `Error!`: API 오류(429 등)나 도구 실행 실패 발생
  - `Help!`: 권한 승인 대기 또는 알림 확인 필요
- **정밀한 에러 감지**: 단순 텍스트 검색이 아닌 JSON 데이터 구조 분석을 통해 실제 시스템 에러만 정확히 추출합니다.
- **최상단 유지 (Always on Top)**: 터미널 작업 중에도 언제나 캐릭터를 볼 수 있도록 화면 최상단에 고정됩니다.

## 🚀 시작하기

### 1. 설치
```bash
npm install
```

### 2. 실행
```bash
npm run dev
```

### 3. Claude Code 설정
앱을 실행하면 자동으로 `~/.claude/settings.json`에 필요한 HTTP 훅이 등록됩니다. 별도의 수동 설정 없이도 Claude CLI를 실행하면 에이전트가 반응합니다.

## 🛠 기술 스택
- **Framework**: Electron
- **Runtime**: Node.js
- **Frontend**: Vanilla JS, CSS (Glassmorphism & Pixel Art Rendering)
- **Integration**: Claude Code Hook API (HTTP)

## 📄 라이선스
MIT License
