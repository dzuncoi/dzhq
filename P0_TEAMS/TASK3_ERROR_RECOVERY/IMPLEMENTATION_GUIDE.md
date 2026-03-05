# 에러 복구 가이드 UI - 구현 가이드

**버전:** 1.0
**작성일:** 2026-03-05
**참조:** `DEBATE_REPORT.md`

---

## 빠른 시작

이 가이드는 에러 복구 시스템을 10시간 내에 구현하는 실용적인 지침입니다.

---

## 1. 파일 구조

```
pixel-agent-desk-master/
├── errorHandler.js          # 신규: 중앙 에러 핸들러
├── errorMessages.js         # 신규: 사용자 메시지 매핑
├── errorConstants.js        # 신규: 에러 코드 및 카테고리
├── main.js                  # 수정: errorHandler 통합
├── renderer.js              # 수정: 에러 UI 렌더링
├── preload.js               # 수정: IPC 채널 추가
├── styles.css               # 수정: 에러 스타일 추가
├── errorModal.js            # 신규: 상세 보기 모달
├── logViewer.js             # 신규: 로그 뷰어
└── P0_TEAMS/
    └── TASK3_ERROR_RECOVERY/
        ├── DEBATE_REPORT.md      # 토론 보고서
        └── IMPLEMENTATION_GUIDE.md  # 본 문서
```

---

## 2. Phase 1: 기반 구조 (4시간)

### 2.1 에러 상수 정의 (30분)

**파일:** `errorConstants.js`

```javascript
// 에러 카테고리
export const ErrorCategory = {
  FILE_IO: 'FILE_IO',
  NETWORK: 'NETWORK',
  PARSE: 'PARSE',
  PERMISSION: 'PERMISSION',
  AGENT_LIFECYCLE: 'AGENT_LIFECYCLE',
  UI_RENDER: 'UI_RENDER',
  HOOK_SERVER: 'HOOK_SERVER',
  UNKNOWN: 'UNKNOWN'
};

// 에러 심각도
export const ErrorSeverity = {
  FATAL: 'fatal',      // 앱 계속 실행 불가
  ERROR: 'error',      // 기능 작동하지 않음
  WARNING: 'warning',  // 기능 제한적 작동
  INFO: 'info'         // 정보성
};

// 복구 액션 타입
export const RecoveryActionType = {
  RETRY: 'retry',
  SKIP: 'skip',
  RESET: 'reset',
  OPEN_SETTINGS: 'open_settings',
  VIEW_LOGS: 'view_logs',
  COPY_ERROR: 'copy_error',
  OPEN_DOCS: 'open_docs',
  REPORT_BUG: 'report_bug'
};

// 표준 에러 코드
export const ErrorCodes = {
  SETTINGS_NOT_FOUND: 'E001',
  SETTINGS_PARSE_ERROR: 'E002',
  AVATAR_LOAD_FAILED: 'E003',
  PORT_CONFLICT: 'E004',
  FOCUS_FAILED: 'E005',
  HOOK_SERVER_ERROR: 'E006',
  LOG_WRITE_FAILED: 'E007',
  AGENT_NOT_FOUND: 'E008',
  AGENTS_LOAD_FAILED: 'E009'
};
```

### 2.2 사용자 메시지 매핑 (1시간)

**파일:** `errorMessages.js`

```javascript
export const ErrorMessages = {
  // 파일 I/O 에러
  'ENOENT': {
    userMessage: '파일을 찾을 수 없어요',
    explanation: '필요한 파일이 존재하지 않거나 경로가 잘못되었을 수 있어요',
    recovery: ['RESET', 'VIEW_LOGS']
  },
  'EACCES': {
    userMessage: '파일에 접근할 수 없어요',
    explanation: '파일 권한이 없거나 다른 프로그램이 사용 중일 수 있어요',
    recovery: ['VIEW_LOGS', 'OPEN_DOCS']
  },
  'EEXIST': {
    userMessage: '파일이 이미 존재해요',
    explanation: '같은 이름의 파일을 만들 수 없어요',
    recovery: ['SKIP', 'VIEW_LOGS']
  },

  // 파싱 에러
  'SyntaxError': {
    userMessage: '파일 형식이 올바르지 않아요',
    explanation: 'JSON 형식이 잘못되었거나 파일이 손상되었을 수 있어요',
    recovery: ['RESET', 'VIEW_LOGS']
  },
  'UnexpectedToken': {
    userMessage: '파일 내용을 읽을 수 없어요',
    explanation: '파일 인코딩이나 형식이 올바르지 않아요',
    recovery: ['RESET', 'VIEW_LOGS']
  },

  // 네트워크 에러
  'EADDRINUSE': {
    userMessage: '포트가 이미 사용 중이에요',
    explanation: '다른 프로그램이 같은 포트를 사용하고 있어요',
    recovery: ['RETRY', 'VIEW_LOGS']
  },
  'ETIMEDOUT': {
    userMessage: '연결 시간이 초과되었어요',
    explanation: '서버 응답이 너무 늦거나 인터넷 연결을 확인해주세요',
    recovery: ['RETRY', 'OPEN_DOCS']
  },
  'ECONNREFUSED': {
    userMessage: '연결이 거부되었어요',
    explanation: '서버가 실행 중이지 않거나 연결을 거부했어요',
    recovery: ['RETRY', 'VIEW_LOGS']
  },

  // 기본값
  'default': {
    userMessage: '작업을 완료할 수 없어요',
    explanation: '예상치 못한 문제가 발생했어요',
    recovery: ['VIEW_LOGS', 'COPY_ERROR']
  }
};

// 에러 코드별 메시지
export const ErrorCodeMessages = {
  'E001': {
    short: '설정 파일을 찾을 수 없어요',
    detail: 'settings.json 파일이 존재하지 않아요. 새로 만들까요?',
    recovery: [
      { type: 'reset', label: '기본값으로 초기화' },
      { type: 'view_logs', label: '로그 보기' }
    ]
  },
  'E002': {
    short: '설정 파일 형식 오류',
    detail: 'settings.json 형식이 올바르지 않아요. 백업이 있어요',
    recovery: [
      { type: 'reset', label: '백업에서 복구' },
      { type: 'open_settings', label: '설정 폴더 열기' }
    ]
  },
  'E003': {
    short: '아바타를 불러올 수 없어요',
    detail: '아바타 이미지 파일을 찾을 수 없어요',
    recovery: [
      { type: 'retry', label: '다시 시도' },
      { type: 'skip', label: '기본 아이콘 사용' }
    ]
  },
  'E004': {
    short: '포트 충돌',
    detail: '후킹 서버 포트가 이미 사용 중이에요',
    recovery: [
      { type: 'retry', label: '다른 포트로 시도' },
      { type: 'view_logs', label: '로그 보기' }
    ]
  },
  'E005': {
    short: '포커스 실패',
    detail: '에이전트 창을 찾을 수 없어요',
    recovery: [
      { type: 'retry', label: '다시 시도' },
      { type: 'view_logs', label: '로그 보기' }
    ]
  }
};
```

### 2.3 에러 핸들러 클래스 (1.5시간)

**파일:** `errorHandler.js`

```javascript
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { ErrorSeverity, ErrorCategory } = require('./errorConstants');
const { ErrorMessages, ErrorCodeMessages } = require('./errorMessages');

class ErrorHandler {
  constructor() {
    this.mainWindow = null;
    this.logPath = path.join(app.getPath('userData'), 'logs');
    this.currentLogFile = null;
    this.errorCount = 0;
    this.deduplicationSet = new Set();
    this.setupLogDirectory();
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  setupLogDirectory() {
    try {
      if (!fs.existsSync(this.logPath)) {
        fs.mkdirSync(this.logPath, { recursive: true });
      }
      this.rotateLogFile();
    } catch (e) {
      console.error('[ErrorHandler] Failed to setup log directory:', e);
    }
  }

  rotateLogFile() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.currentLogFile = path.join(this.logPath, `error-${timestamp}.log`);

    // 오래된 로그 파일 정리 (최대 5개, 10MB 제한)
    try {
      const files = fs.readdirSync(this.logPath)
        .filter(f => f.startsWith('error-') && f.endsWith('.log'))
        .map(f => ({
          name: f,
          path: path.join(this.logPath, f),
          time: fs.statSync(path.join(this.logPath, f)).mtime.getTime()
        }))
        .sort((a, b) => b.time - a.time);

      // 5개 초과 시 삭제
      if (files.length > 5) {
        files.slice(5).forEach(f => {
          try {
            fs.unlinkSync(f.path);
          } catch (e) { /* ignore */ }
        });
      }

      // 현재 파일이 10MB 초과 시 회전
      if (files.length > 0) {
        const newest = files[0];
        const stats = fs.statSync(newest.path);
        if (stats.size > 10 * 1024 * 1024) {
          // 새 파일 생성
          const newTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
          this.currentLogFile = path.join(this.logPath, `error-${newTimestamp}.log`);
        }
      }
    } catch (e) {
      console.error('[ErrorHandler] Failed to rotate logs:', e);
    }
  }

  /**
   * 에러를 캡처하고 처리합니다.
   * @param {Error|object} error - 에러 객체
   * @param {object} context - 추가 컨텍스트
   * @returns {object} 정규화된 에러 컨텍스트
   */
  capture(error, context = {}) {
    try {
      const errorContext = this.normalize(error, context);

      // 중복 제거 (같은 에러 코드 + 메시지 조합)
      const dedupKey = `${errorContext.code}:${errorContext.message}`;
      if (this.deduplicationSet.has(dedupKey)) {
        return errorContext; // 이미 처리된 에러는 건너뜀
      }
      this.deduplicationSet.add(dedupKey);

      // 5초 후 중복 제거 세트에서 제거
      setTimeout(() => {
        this.deduplicationSet.delete(dedupKey);
      }, 5000);

      // 로그 기록
      this.logToFile(errorContext);

      // Renderer로 전송
      this.sendToRenderer(errorContext);

      // 카운터 증가
      this.errorCount++;

      return errorContext;
    } catch (handlerError) {
      // 에러 핸들러 자체의 에러는 콘솔로만
      console.error('[ErrorHandler] Failed to handle error:', handlerError);
      console.error('[ErrorHandler] Original error:', error);
      return null;
    }
  }

  /**
   * 에러를 표준 형식으로 정규화합니다.
   */
  normalize(error, context) {
    const isError = error instanceof Error;

    // 에러 코드 결정
    let code = error.code || context.code || 'UNKNOWN';
    let category = context.category || this.inferCategory(code, error);
    let severity = context.severity || ErrorSeverity.ERROR;

    // 에러 코드 매핑
    if (context.errorCode) {
      code = context.errorCode; // 명시적으로 지정된 에러 코드 사용
    } else if (code === 'ENOENT' && context.path?.includes('settings')) {
      code = 'E001';
    } else if (code === 'SyntaxError' && context.path?.includes('settings')) {
      code = 'E002';
    } else if (context.path?.includes('avatar')) {
      code = 'E003';
    } else if (code === 'EADDRINUSE') {
      code = 'E004';
    } else if (context.action === 'focus') {
      code = 'E005';
    }

    // 사용자 메시지 생성
    const messageInfo = ErrorMessages[code] || ErrorMessages[error.code] || ErrorMessages['default'];
    const userMessage = context.userMessage || messageInfo.userMessage;
    const explanation = context.explanation || messageInfo.explanation;

    // 복구 액션 생성
    const recovery = context.recovery || this.createRecoveryActions(code, category);

    return {
      id: context.id || this.generateId(),
      timestamp: new Date().toISOString(),
      source: context.source || 'main',
      category,
      severity,
      code,
      originalCode: error.code,
      message: isError ? error.message : String(error),
      stack: isError ? error.stack : undefined,
      userMessage,
      explanation,
      recovery,
      agentId: context.agentId,
      context: {
        path: context.path,
        ...context.details
      }
    };
  }

  inferCategory(code, error) {
    if (['ENOENT', 'EACCES', 'EEXIST'].includes(code)) return ErrorCategory.FILE_IO;
    if (['EADDRINUSE', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code)) return ErrorCategory.NETWORK;
    if (code === 'SyntaxError' || error instanceof SyntaxError) return ErrorCategory.PARSE;
    return ErrorCategory.UNKNOWN;
  }

  createRecoveryActions(code, category) {
    const codeInfo = ErrorCodeMessages[code];
    if (codeInfo && codeInfo.recovery) {
      return codeInfo.recovery;
    }

    // 카테고리별 기본 복구
    const defaults = {
      [ErrorCategory.FILE_IO]: [
        { type: 'retry', label: '다시 시도' },
        { type: 'view_logs', label: '로그 보기' }
      ],
      [ErrorCategory.PARSE]: [
        { type: 'reset', label: '기본값으로 초기화' },
        { type: 'open_settings', label: '설정 열기' }
      ],
      [ErrorCategory.NETWORK]: [
        { type: 'retry', label: '다시 시도' },
        { type: 'skip', label: '건너뛰기' }
      ]
    };

    return defaults[category] || [
      { type: 'view_logs', label: '로그 보기' },
      { type: 'copy_error', label: '에러 복사' }
    ];
  }

  logToFile(errorContext) {
    try {
      if (!this.currentLogFile) return;

      const logEntry = JSON.stringify(errorContext) + '\n';
      fs.appendFileSync(this.currentLogFile, logEntry, 'utf8');

      // 파일 크기 체크 및 회전
      const stats = fs.statSync(this.currentLogFile);
      if (stats.size > 10 * 1024 * 1024) {
        this.rotateLogFile();
      }
    } catch (e) {
      console.error('[ErrorHandler] Failed to write log:', e);
    }
  }

  sendToRenderer(errorContext) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      try {
        this.mainWindow.webContents.send('error-occurred', errorContext);
      } catch (e) {
        console.error('[ErrorHandler] Failed to send to renderer:', e);
      }
    }
  }

  generateId() {
    return `ERR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  getErrorStats() {
    return {
      totalErrors: this.errorCount,
      logFile: this.currentLogFile,
      logDirectory: this.logPath
    };
  }
}

// 싱글톤 인스턴스
const errorHandler = new ErrorHandler();

module.exports = errorHandler;
```

### 2.4 IPC 채널 설정 (30분)

**파일:** `preload.js` (기존 파일에 추가)

```javascript
const { contextBridge, ipcRenderer } = require('electron');

// 기존 safeOn 함수...
function safeOn(channel, callback) {
  ipcRenderer.removeAllListeners(channel);
  ipcRenderer.on(channel, (event, data) => callback(data));
}

contextBridge.exposeInMainWorld('electronAPI', {
  // ... 기존 메서드들 ...

  // 에러 관련 IPC 추가
  onError: (cb) => safeOn('error-occurred', cb),

  executeRecovery: (errorId, action) => {
    return ipcRenderer.invoke('execute-recovery', { errorId, action });
  },

  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),

  copyErrorToClipboard: (errorContext) => {
    return ipcRenderer.invoke('copy-error-to-clipboard', errorContext);
  },

  getErrorStats: () => {
    return ipcRenderer.invoke('get-error-stats');
  }
});
```

**파일:** `main.js` (IPC 핸들러 추가)

```javascript
const errorHandler = require('./errorHandler');

// 앱 시작 시 핸들러에 윈도우 설정
app.whenReady().then(() => {
  // ... 기존 코드 ...
  errorHandler.setMainWindow(mainWindow);

  // 복구 액션 핸들러
  ipcMain.handle('execute-recovery', async (event, { errorId, action }) => {
    return executeRecoveryAction(errorId, action);
  });

  // 로그 폴더 열기
  ipcMain.handle('open-log-folder', async () => {
    const { shell } = require('electron');
    const logPath = path.join(app.getPath('userData'), 'logs');
    await shell.openPath(logPath);
    return { success: true };
  });

  // 에러 복사
  ipcMain.handle('copy-error-to-clipboard', async (event, errorContext) => {
    const { clipboard } = require('electron');
    const text = formatErrorForClipboard(errorContext);
    clipboard.writeText(text);
    return { success: true };
  });

  // 에러 통계
  ipcMain.handle('get-error-stats', async () => {
    return errorHandler.getErrorStats();
  });
});

function executeRecoveryAction(errorId, action) {
  switch (action.type) {
    case 'retry':
      // 재시도 로직 (컨텍스트에 따라 다름)
      return { success: true, message: '재시도했습니다' };

    case 'reset':
      // 설정 초기화
      return { success: true, message: '초기화했습니다' };

    case 'open_settings':
      const { shell } = require('electron');
      shell.openPath(app.getPath('userData'));
      return { success: true };

    case 'view_logs':
      // 로그 뷰어 모달 열기
      mainWindow.webContents.send('open-log-viewer');
      return { success: true };

    default:
      return { success: false, message: '알 수 없는 액션' };
  }
}

function formatErrorForClipboard(error) {
  return `
에러: ${error.userMessage}
코드: ${error.code}
시간: ${error.timestamp}

기술 정보:
${error.message}

스택 트레이스:
${error.stack || '(없음)'}
  `.trim();
}
```

---

## 3. Phase 2: UI 구현 (3시간)

### 3.1 CSS 스타일 (30분)

**파일:** `styles.css` (파일 끝에 추가)

```css
/* ═════════════════════════════════════════
   에러 상태 스타일
   ═════════════════════════════════════════ */

/* 에러 상태 말풍선 */
.agent-bubble.is-error {
  border-color: #d32f2f;
  color: #d32f2f;
  background: #ffebee;
  animation: error-shake 0.5s ease-in-out;
}

.agent-bubble.is-error::after {
  border-top-color: #d32f2f;
}

/* 에러 진동 애니메이션 */
@keyframes error-shake {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

/* 에러 복구 버튼 컨테이너 */
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
  z-index: 1000;
  pointer-events: auto;
}

/* 단일 복구 버튼 */
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
  white-space: nowrap;
}

.error-action-btn:hover {
  background: #b71c1c;
  transform: scale(1.05);
}

.error-action-btn:active {
  transform: scale(0.95);
}

/* 복구 버튼 그룹 (가로 배치) */
.error-actions.horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
}

/* "더 보기" 드롭다운 */
.error-more-btn {
  background: #f5f5f5;
  color: #666;
  border: 1px solid #ddd;
}

.error-more-btn:hover {
  background: #e0e0e0;
}

/* 에러 상세 모달 */
.error-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100000;
  pointer-events: auto;
}

.error-modal-content {
  background: white;
  border-radius: 8px;
  padding: 20px;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.error-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.error-modal-title {
  font-size: 16px;
  font-weight: 700;
  color: #d32f2f;
}

.error-modal-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #666;
}

.error-modal-section {
  margin-bottom: 16px;
}

.error-modal-label {
  font-weight: 600;
  color: #333;
  margin-bottom: 4px;
}

.error-modal-text {
  color: #666;
  font-size: 14px;
  line-height: 1.5;
}

.error-modal-tech-info {
  background: #f5f5f5;
  padding: 12px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 12px;
  color: #333;
  white-space: pre-wrap;
  word-break: break-all;
}

.error-modal-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.error-modal-btn {
  flex: 1;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.error-modal-btn.primary {
  background: #2196f3;
  color: white;
}

.error-modal-btn.primary:hover {
  background: #1976d2;
}

.error-modal-btn.secondary {
  background: #f5f5f5;
  color: #333;
}

.error-modal-btn.secondary:hover {
  background: #e0e0e0;
}

/* 로그 뷰어 모달 */
.log-viewer-content {
  max-width: 800px;
}

.log-viewer-textarea {
  width: 100%;
  height: 400px;
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
}
```

### 3.2 Renderer 에러 처리 (1.5시간)

**파일:** `renderer.js` (파일 끝에 추가)

```javascript
// --- 에러 핸들링 ---

const activeErrors = new Map(); // agentId -> ErrorContext

// 에러 리스너 등록
if (window.electronAPI && window.electronAPI.onError) {
  window.electronAPI.onError((errorContext) => {
    handleErrorFromMain(errorContext);
  });
}

function handleErrorFromMain(errorContext) {
  console.error('[Renderer] Error received from main:', errorContext);

  // 에이전트 관련 에러인지 확인
  if (errorContext.agentId) {
    showErrorOnAgent(errorContext.agentId, errorContext);
  } else {
    // 전역 에러 (전역 알림 표시)
    showGlobalError(errorContext);
  }

  // 에러 저장
  activeErrors.set(errorContext.id, errorContext);

  // 자동 해제 타이머 (warning, info만)
  if (errorContext.severity === 'warning' || errorContext.severity === 'info') {
    setTimeout(() => {
      clearError(errorContext.id);
    }, 10000); // 10초 후 자동 해제
  }
}

function showErrorOnAgent(agentId, errorContext) {
  const card = document.querySelector(`[data-agent-id="${agentId}"]`);
  if (!card) {
    console.warn('[Renderer] Agent card not found for error:', agentId);
    return;
  }

  // 기존 에러 제거
  const existingError = card.querySelector('.error-actions');
  if (existingError) {
    existingError.remove();
  }

  // 말풍선 업데이트
  const bubble = card.querySelector('.agent-bubble');
  if (bubble) {
    bubble.textContent = errorContext.userMessage;
    bubble.classList.add('is-error');

    // 상태 데이터 속성 설정
    card.dataset.errorState = 'error';
  }

  // 복구 버튼 생성
  if (errorContext.recovery && errorContext.recovery.length > 0) {
    const actionContainer = document.createElement('div');
    actionContainer.className = 'error-actions horizontal';

    errorContext.recovery.forEach(action => {
      const btn = document.createElement('button');
      btn.className = 'error-action-btn';
      btn.textContent = action.label;
      btn.onclick = () => executeRecovery(action, errorContext);
      actionContainer.appendChild(btn);
    });

    // 상세 보기 버튼
    const detailBtn = document.createElement('button');
    detailBtn.className = 'error-action-btn error-more-btn';
    detailBtn.textContent = '⋯';
    detailBtn.onclick = () => showErrorDetail(errorContext);
    actionContainer.appendChild(detailBtn);

    card.appendChild(actionContainer);
  }

  // 애니메이션 효과
  if (bubble) {
    bubble.style.animation = 'none';
    setTimeout(() => {
      bubble.style.animation = 'error-shake 0.5s ease-in-out';
    }, 10);
  }
}

function showGlobalError(errorContext) {
  // 전역 에러 알림 (간단한 토스트)
  const toast = document.createElement('div');
  toast.className = 'global-error-toast';
  toast.textContent = `❌ ${errorContext.userMessage}`;
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #d32f2f;
    color: white;
    padding: 12px 20px;
    border-radius: 4px;
    font-family: 'Pretendard Variable', sans-serif;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 100000;
    animation: slide-in 0.3s ease-out;
    cursor: pointer;
  `;

  toast.onclick = () => showErrorDetail(errorContext);

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slide-out 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

async function executeRecovery(action, errorContext) {
  try {
    const result = await window.electronAPI.executeRecovery(errorContext.id, action);

    if (result.success) {
      // 성공 시 에러 상태 제거
      clearError(errorContext.id);

      // 성공 메시지 표시
      if (result.message) {
        showToast(result.message, 'success');
      }
    } else {
      // 실패 시 에러 메시지
      showToast(result.message || '복구에 실패했어요', 'error');
    }
  } catch (e) {
    console.error('[Renderer] Recovery failed:', e);
    showToast('복구 중 오류가 발생했어요', 'error');
  }
}

function clearError(errorId) {
  const errorContext = activeErrors.get(errorId);
  if (!errorContext) return;

  if (errorContext.agentId) {
    const card = document.querySelector(`[data-agent-id="${errorContext.agentId}"]`);
    if (card) {
      const actionContainer = card.querySelector('.error-actions');
      if (actionContainer) {
        actionContainer.remove();
      }

      const bubble = card.querySelector('.agent-bubble');
      if (bubble) {
        bubble.classList.remove('is-error');
        delete card.dataset.errorState;

        // 원래 상태 메시지 복원
        const originalState = card.dataset.state;
        if (originalState && stateConfig[originalState]) {
          bubble.textContent = stateConfig[originalState].label;
        }
      }
    }
  }

  activeErrors.delete(errorId);
}

function showToast(message, type = 'info') {
  const colors = {
    success: '#4caf50',
    error: '#d32f2f',
    info: '#2196f3',
    warning: '#ff9800'
  };

  const toast = document.createElement('div');
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: ${colors[type]};
    color: white;
    padding: 12px 24px;
    border-radius: 20px;
    font-family: 'Pretendard Variable', sans-serif;
    font-size: 12px;
    font-weight: 600;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    z-index: 100000;
    animation: fade-in 0.3s ease-out;
  `;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fade-out 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}
```

### 3.3 에러 상세 모달 (1시간)

**파일:** `errorModal.js`

```javascript
/**
 * 에러 상세 보기 모달
 */

function showErrorDetail(errorContext) {
  // 기존 모달 제거
  const existingModal = document.querySelector('.error-modal');
  if (existingModal) {
    existingModal.remove();
  }

  const modal = document.createElement('div');
  modal.className = 'error-modal';
  modal.innerHTML = `
    <div class="error-modal-content">
      <div class="error-modal-header">
        <h2 class="error-modal-title">❌ 오류 상세 정보</h2>
        <button class="error-modal-close" onclick="this.closest('.error-modal').remove()">×</button>
      </div>

      <div class="error-modal-section">
        <div class="error-modal-label">사용자 메시지</div>
        <div class="error-modal-text">${escapeHtml(errorContext.userMessage)}</div>
      </div>

      ${errorContext.explanation ? `
      <div class="error-modal-section">
        <div class="error-modal-label">설명</div>
        <div class="error-modal-text">${escapeHtml(errorContext.explanation)}</div>
      </div>
      ` : ''}

      <div class="error-modal-section">
        <div class="error-modal-label">기술 정보</div>
        <div class="error-modal-tech-info">
에러 코드: ${errorContext.code}
심각도: ${errorContext.severity}
카테고리: ${errorContext.category}
시간: ${errorContext.timestamp}

${errorContext.originalCode ? `원본 코드: ${errorContext.originalCode}` : ''}

메시지: ${errorContext.message}
        </div>
      </div>

      ${errorContext.stack ? `
      <div class="error-modal-section">
        <div class="error-modal-label">
          <button onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'" style="background:none;border:none;cursor:pointer;font-weight:600;">
            ▼ 스택 트레이스 보기
          </button>
        </div>
        <div class="error-modal-tech-info" style="display:none;max-height:200px;overflow-y:auto;">
${escapeHtml(errorContext.stack)}
        </div>
      </div>
      ` : ''}

      <div class="error-modal-actions">
        <button class="error-modal-btn primary" onclick="copyErrorToClipboard('${errorContext.id}')">
          📋 클립보드에 복사
        </button>
        <button class="error-modal-btn secondary" onclick="openLogFolder()">
          📁 로그 폴더 열기
        </button>
        ${errorContext.recovery && errorContext.recovery.length > 0 ? `
          <button class="error-modal-btn secondary" onclick="executeRecoveryFromModal('${errorContext.id}', '${errorContext.recovery[0].type}')">
            ${errorContext.recovery[0].label}
          </button>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // 배경 클릭 시 닫기
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function copyErrorToClipboard(errorId) {
  const errorContext = activeErrors.get(errorId);
  if (!errorContext) return;

  try {
    await window.electronAPI.copyErrorToClipboard(errorContext);
    showToast('클립보드에 복사했어요', 'success');
  } catch (e) {
    showToast('복사에 실패했어요', 'error');
  }
}

async function openLogFolder() {
  try {
    await window.electronAPI.openLogFolder();
  } catch (e) {
    showToast('로그 폴더를 열 수 없어요', 'error');
  }
}

async function executeRecoveryFromModal(errorId, actionType) {
  const errorContext = activeErrors.get(errorId);
  if (!errorContext) return;

  const action = errorContext.recovery.find(r => r.type === actionType);
  if (!action) return;

  await executeRecovery(action, errorContext);

  // 모달 닫기
  const modal = document.querySelector('.error-modal');
  if (modal) {
    modal.remove();
  }
}

// 전역 함수 등록
window.showErrorDetail = showErrorDetail;
window.copyErrorToClipboard = copyErrorToClipboard;
window.openLogFolder = openLogFolder;
window.executeRecoveryFromModal = executeRecoveryFromModal;
```

---

## 4. Phase 3: 기존 코드 적용 (2시간)

### 4.1 main.js 주요 수정 사항

**수정 1: settings.json 파싱 에러**

```javascript
// 기존 코드 (라인 280-288)
if (fs.existsSync(settingsPath)) {
  try {
    const rawContent = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
    settings = JSON.parse(rawContent);
  } catch (parseErr) {
    debugLog(`[Main] settings.json parse error: ${parseErr.message}. Backing up.`);
    try { fs.copyFileSync(settingsPath, settingsPath + '.corrupt_backup'); } catch (e) { }
    settings = {};
  }
}

// 수정 후 코드
if (fs.existsSync(settingsPath)) {
  try {
    const rawContent = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
    settings = JSON.parse(rawContent);
  } catch (parseErr) {
    errorHandler.capture(parseErr, {
      source: 'main',
      category: ErrorCategory.PARSE,
      errorCode: parseErr.code === 'ENOENT' ? 'E001' : 'E002',
      path: settingsPath,
      userMessage: parseErr.code === 'ENOENT'
        ? '설정 파일을 찾을 수 없어요'
        : '설정 파일 형식이 올바르지 않아요',
      recovery: [
        { type: 'reset', label: '기본값으로 초기화' },
        { type: 'open_settings', label: '설정 폴더 열기' }
      ]
    });

    try {
      fs.copyFileSync(settingsPath, settingsPath + '.corrupt_backup');
    } catch (backupErr) {
      errorHandler.capture(backupErr, {
        source: 'main',
        category: ErrorCategory.FILE_IO,
        userMessage: '백업 파일을 만들 수 없어요'
      });
    }
    settings = {};
  }
}
```

**수정 2: 아바타 로드 에러**

```javascript
// main.js get-avatars 핸들러 수정
ipcMain.on('get-avatars', async (event) => {
  try {
    // ... 기존 코드 ...
  } catch (e) {
    errorHandler.capture(e, {
      source: 'main',
      category: ErrorCategory.FILE_IO,
      errorCode: 'E003',
      userMessage: '아바타를 불러올 수 없어요',
      recovery: [
        { type: 'retry', label: '다로 시도' },
        { type: 'skip', label: '기본 아이콘 사용' }
      ]
    });
    event.reply('avatars-response', []);
  }
});
```

**수정 3: 포커스 실패**

```javascript
// main.js focus-terminal 핸들러 수정
ipcMain.on('focus-terminal', (event, agentId) => {
  // ... 기존 코드 ...
  if (err) {
    errorHandler.capture(err, {
      source: 'main',
      category: ErrorCategory.AGENT_LIFECYCLE,
      errorCode: 'E005',
      agentId: agentId,
      userMessage: '에이전트 창을 찾을 수 없어요',
      recovery: [
        { type: 'retry', label: '다로 시도' },
        { type: 'view_logs', label: '로그 보기' }
      ]
    });
  }
});
```

### 4.2 renderer.js 주요 수정 사항

**수정 1: 아바타 로드 실패**

```javascript
// renderer.js init() 함수 수정
async function init() {
  // ... 기존 코드 ...

  // 아바타 리스트 로드
  if (window.electronAPI.getAvatars) {
    try {
      availableAvatars = await window.electronAPI.getAvatars();
    } catch (e) {
      console.error('[Renderer] Failed to load avatars:', e);

      // 에러 표시
      if (window.electronAPI.copyErrorToClipboard) {
        showToast('아바타를 불러올 수 없어요. 기본 아이콘을 사용해요', 'warning');
      }

      availableAvatars = ['avatar_0.png']; // 기본값
    }
  }
}
```

**수정 2: 대시보드 열기 실패**

```javascript
// renderer.js createDashboardBtn 함수 수정
button.onclick = async () => {
  // ... 기존 코드 ...
  if (result.success) {
    // ...
  } else {
    console.error('[Renderer] Failed to open dashboard:', result.error);

    // 에러 표시
    button.innerHTML = '✗ Error';

    if (window.showErrorDetail) {
      window.showErrorDetail({
        id: `dashboard-${Date.now()}`,
        userMessage: '대시보드를 열 수 없어요',
        explanation: result.error || '알 수 없는 오류가 발생했어요',
        recovery: [
          { type: 'retry', label: '다시 시도' },
          { type: 'view_logs', label: '로그 보기' }
        ]
      });
    }

    setTimeout(() => {
      button.innerHTML = originalHTML;
      button.disabled = false;
    }, 2000);
  }
};
```

---

## 5. Phase 4: 로그 시스템 (1시간)

### 5.1 로그 뷰어

**파일:** `logViewer.js`

```javascript
/**
 * 로그 뷰어 모달
 */

async function showLogViewer() {
  try {
    const stats = await window.electronAPI.getErrorStats();
    const logFile = stats.logFile;
    const logDir = stats.logDirectory;

    // 기존 모달 제거
    const existingModal = document.querySelector('.log-viewer-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.className = 'error-modal log-viewer-modal';
    modal.innerHTML = `
      <div class="error-modal-content log-viewer-content">
        <div class="error-modal-header">
          <h2 class="error-modal-title">📁 에러 로그</h2>
          <button class="error-modal-close" onclick="this.closest('.log-viewer-modal').remove()">×</button>
        </div>

        <div class="error-modal-section">
          <div class="error-modal-label">로그 파일</div>
          <div class="error-modal-text">
            ${logFile || '로그 파일이 없어요'}
          </div>
        </div>

        <div class="error-modal-section">
          <div class="error-modal-label">총 에러 수: ${stats.totalErrors}</div>
        </div>

        <div class="error-modal-section">
          <div class="error-modal-label">로그 내용</div>
          <textarea class="log-viewer-textarea" readonly placeholder="로그를 불러오는 중..."></textarea>
        </div>

        <div class="error-modal-actions">
          <button class="error-modal-btn secondary" onclick="refreshLogViewer()">
            🔄 새로고침
          </button>
          <button class="error-modal-btn primary" onclick="openLogFolder()">
            📁 로그 폴더 열기
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // 로그 내용 불러오기
    if (logFile) {
      loadLogContent(logFile, modal.querySelector('.log-viewer-textarea'));
    }

    // 배경 클릭 시 닫기
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
  } catch (e) {
    console.error('[LogViewer] Failed to show:', e);
    showToast('로그 뷰어를 열 수 없어요', 'error');
  }
}

async function loadLogContent(logPath, textarea) {
  try {
    const response = await fetch(`file://${logPath}`);
    const content = await response.text();

    // JSON 라인별로 파싱하여 읽기 쉽게 표시
    const lines = content.split('\n').filter(line => line.trim());
    const formatted = lines.map(line => {
      try {
        const entry = JSON.parse(line);
        return `[${entry.timestamp}] ${entry.severity.toUpperCase()}: ${entry.userMessage || entry.message}`;
      } catch (e) {
        return line;
      }
    }).join('\n');

    textarea.value = formatted;
  } catch (e) {
    textarea.value = `로그를 불러올 수 없어요: ${e.message}`;
  }
}

function refreshLogViewer() {
  const modal = document.querySelector('.log-viewer-modal');
  if (modal) {
    modal.remove();
    showLogViewer();
  }
}

// IPC 리스너: 로그 뷰어 열기 요청
if (window.electronAPI) {
  window.electronAPI.onError?.((errorContext) => {
    if (errorContext.recovery?.some(r => r.type === 'view_logs')) {
      // 로그 보기 버튼이 있을 때만 자동으로 저장
    }
  });
}

// 전역 함수 등록
window.showLogViewer = showLogViewer;
window.refreshLogViewer = refreshLogViewer;
```

### 5.2 main.js 로그 폴더 핸들러

```javascript
ipcMain.handle('open-log-folder', async () => {
  const { shell } = require('electron');
  const logPath = path.join(app.getPath('userData'), 'logs');

  // 폴더가 없으면 생성
  if (!fs.existsSync(logPath)) {
    try {
      fs.mkdirSync(logPath, { recursive: true });
    } catch (e) {
      console.error('[Main] Failed to create log folder:', e);
    }
  }

  await shell.openPath(logPath);
  return { success: true };
});
```

---

## 6. 테스트 방법

### 6.1 수동 테스트

**테스트 1: settings.json 파싱 에러**

```bash
# 1. 설정 파일 백업
cp ~/.claude/settings.json ~/.claude/settings.json.backup

# 2. 잘못된 JSON으로 교체
echo '{ "invalid": json }' > ~/.claude/settings.json

# 3. 앱 재시작
npm start

# 4. 예상 결과: 에어 토스트 + 에이전트 카드에 에러 표시

# 5. 복구
rm ~/.claude/settings.json
mv ~/.claude/settings.json.backup ~/.claude/settings.json
```

**테스트 2: 아바타 로드 실패**

```bash
# 1. 아바타 파일 일시 삭제
mv avatar_00.png avatar_00.png.bak

# 2. 앱 재시작
npm start

# 3. 예상 결과: "아바타를 불러올 수 없어요" 메시지

# 4. 복구
mv avatar_00.png.bak avatar_00.png
```

**테스트 3: 포트 충돌**

```bash
# 1. 포트 점유
node -e "require('net').createServer().listen(41157)"

# 2. 앱 재시작 (다른 터미널)
npm start

# 3. 예상 결과: "포트 충돌" 에러

# 4. 정리
# 첫 번째 터미널에서 Ctrl+C
```

### 6.2 자동 테스트 (선택사항)

```javascript
// tests/errorHandler.test.js
const ErrorHandler = require('../errorHandler');

describe('ErrorHandler', () => {
  let handler;

  beforeEach(() => {
    handler = new ErrorHandler();
  });

  test('should normalize Error objects', () => {
    const error = new Error('Test error');
    const context = handler.normalize(error, { source: 'test' });

    expect(context.userMessage).toBeDefined();
    expect(context.severity).toBe('error');
    expect(context.category).toBe('UNKNOWN');
  });

  test('should map ENOENT to user message', () => {
    const error = new Error('File not found');
    error.code = 'ENOENT';
    const context = handler.normalize(error, {});

    expect(context.userMessage).toContain('파일을 찾을 수 없어요');
  });

  test('should create recovery actions', () => {
    const error = new Error('Parse error');
    error.code = 'SyntaxError';
    const context = handler.normalize(error, {});

    expect(context.recovery).toBeDefined();
    expect(context.recovery.length).toBeGreaterThan(0);
  });
});
```

---

## 7. 배포 체크리스트

### 7.1 코드 검토

- [ ] 모든 P0 catch 블록이 수정되었는가?
- [ ] 에러 핸들러가 모든 진입점에서 초기화되었는가?
- [ ] IPC 채널이 올바르게 설정되었는가?
- [ ] 사용자 메시지가 한국어로 검토되었는가?

### 7.2 기능 테스트

- [ ] settings.json 파싱 에러가 표시되는가?
- [ ] 아바타 로드 실패가 표시되는가?
- [ ] 포커스 실패가 표시되는가?
- [ ] 복구 버튼이 작동하는가?
- [ ] 로그 뷰어가 열리는가?

### 7.3 UI/UX 검토

- [ ] 에러 메시지가 읽기 쉬운가?
- [ ] 복구 버튼이 직관적인가?
- [ ] 애니메이션이 과하지 않은가?
- [ ] 모달이 반응형인가?

### 7.4 성능 확인

- [ ] 에러 발생 시 앱이 멈추지 않는가?
- [ ] 로그 파일이 과도하게 커지지 않는가?
- [ ] IPC 통신이 병목이 아닌가?

---

## 8. 트러블슈팅

### 문제 1: 에러가 표시되지 않음

**원인:** IPC 채널이 올바르게 설정되지 않음

**해결:**
```javascript
// main.js 확인
errorHandler.setMainWindow(mainWindow);

// preload.js 확인
onError: (cb) => safeOn('error-occurred', cb)
```

### 문제 2: 복구 버튼이 작동하지 않음

**원인:** IPC invoke 핸들러가 누락됨

**해결:**
```javascript
// main.js에 핸들러 추가
ipcMain.handle('execute-recovery', async (event, { errorId, action }) => {
  // 복구 로직
});
```

### 문제 3: 로그 파일이 생성되지 않음

**원인:** 로그 디렉토리 권한 문제

**해결:**
```javascript
// errorHandler.js에서 권한 확인
fs.mkdirSync(this.logPath, { recursive: true, mode: 0o755 });
```

---

## 9. 다음 단계

1. **문서화:** 사용자 매뉴얼에 에러 해결 방법 추가
2. **피드백:** 베타 테스터에게 에러 메시지 clarity 피드백 요청
3. **분석:** 로그 데이터에서 자주 발생하는 에러 패턴 분석
4. **개선:** Phase 2 기능 (예측적 방지) 개발

---

**버전: 1.0**
**마지막 업데이트:** 2026-03-05
**다음 리뷰:** 구현 완료 후
