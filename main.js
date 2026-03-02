const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const server = require('./server');

let mainWindow;
let httpServer;

// 윈도우 생성
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 220,
    height: 200,
    x: Math.round((width - 220) / 2),
    y: Math.round((height - 200) / 2),
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  // 서버 모듈에 메인 윈도우 전달
  server.setMainWindow(mainWindow);

  // 태스크바 위로 올리기 (최상단 레벨 - screen-saver)
  mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);

  // 주기적으로 최상단 유지
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver', 1);
    }
  }, 1000);
}

// Claude CLI 훅 자동 등록 (기존 훅을 보존하는 "예의 바른" 방식)
function registerHooks() {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  const serverUrl = `http://localhost:${server.getServerPort()}/agent/status`;

  try {
    if (!fs.existsSync(settingsPath)) return;

    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const hookEvents = [
      'SessionStart',
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'Stop',
      'Notification',
      'SessionEnd',
      'TaskCompleted',
      'PermissionRequest',
      'SubagentStart',
      'SubagentStop'
    ];

    if (!settings.hooks) settings.hooks = {};

    let updated = false;

    // 이전 방식의 무효한 훅 제거
    ['Start', 'Error'].forEach(h => {
      if (settings.hooks[h]) { delete settings.hooks[h]; updated = true; }
    });

    // 각 이벤트별로 우리 앱의 주소가 있는지 확인하고 없으면 추가
    hookEvents.forEach(name => {
      if (!settings.hooks[name]) {
        settings.hooks[name] = [];
      }

      // 해당 이벤트의 훅 리스트에서 우리 서버 URL이 포함된 항목이 있는지 확인
      const hasOurHook = settings.hooks[name].some(item =>
        item.hooks && item.hooks.some(h => h.url === serverUrl)
      );

      if (!hasOurHook) {
        // 우리 앱의 훅 정보 구성
        const newHookEntry = {
          matcher: "*",
          hooks: [{
            type: "http",
            url: serverUrl
          }]
        };

        // 기존 리스트에 추가 (덮어쓰지 않음)
        settings.hooks[name].push(newHookEntry);
        updated = true;
      }
    });

    if (updated) {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('Claude CLI 훅 설정 완료 (기존 설정 보존)');
    }
  } catch (error) {
    console.error('훅 등록 실패:', error);
  }
}

// 앱 시작
app.disableHardwareAcceleration(); // GPU 가속 비활성화

// DPI 설정 고정 (프레임 어긋남 방지)
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

app.whenReady().then(async () => {
  httpServer = await server.createHttpServer();
  console.log(`Pixel Agent Desk started - HTTP Server on port ${server.getServerPort()}`);

  createWindow();
  registerHooks();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 앱 종료
app.on('window-all-closed', () => {
  if (httpServer) {
    httpServer.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (httpServer) {
    httpServer.close();
  }
});

// 상태 조회 공통 함수
function getAgentStates() {
  return Array.from(agentStates.entries()).map(([sessionId, data]) => ({
    sessionId,
    ...data
  }));
}

// IPC 핸들러
ipcMain.on('get-work-area', (event) => {
  const workArea = screen.getPrimaryDisplay().workArea;
  event.reply('work-area-response', workArea);
});

ipcMain.on('constrain-window', (event, bounds) => {
  const workArea = screen.getPrimaryDisplay().workArea;
  const { width, height } = mainWindow.getBounds();

  let newX = bounds.x;
  let newY = bounds.y;

  // 화면 경계 체크 (스냅)
  if (newX < workArea.x) newX = workArea.x;
  if (newX + width > workArea.x + workArea.width) newX = workArea.x + workArea.width - width;
  if (newY < workArea.y) newY = workArea.y;
  if (newY + height > workArea.y + workArea.height) newY = workArea.y + workArea.height - height;

  mainWindow.setPosition(newX, newY);
});

ipcMain.on('get-state', (event) => {
  const state = server.getAgentStates();
  event.reply('state-response', state);
});

// 터미널 포커스 요청 (현재는 콘솔 로그만 출력)
ipcMain.on('focus-terminal', (event) => {
  console.log('터미널 포커스 요청');
  // TODO: 실제 터미널 창 포커스 기능 구현 (Windows API 필요)
});
