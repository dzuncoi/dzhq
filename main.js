const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const LogMonitor = require('./logMonitor');
const AgentManager = require('./agentManager');

// Debug logging to file
const debugLog = (msg) => {
  const timestamp = new Date().toISOString();
  const logMsg = `[${timestamp}] ${msg}\n`;
  fs.appendFileSync(path.join(__dirname, 'debug.log'), logMsg);
  console.log(msg);
};

let mainWindow;
let logMonitor = null;
let agentManager = null;

// =====================================================
// 에이전트 수에 따른 동적 윈도우 크기 (P1-6)
// =====================================================
function getWindowSizeForAgents(count) {
  if (count <= 1) return { width: 220, height: 200 };

  // 멀티 에이전트: 카드 90px × N + 갭 + 외부 패딩
  const CARD_W = 90;
  const GAP = 10;
  const OUTER = 20;
  const HEIGHT = 195;

  const width = Math.max(220, count * CARD_W + (count - 1) * GAP + OUTER);
  return { width, height: HEIGHT };
}

function resizeWindowForAgents(count) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const { width, height } = getWindowSizeForAgents(count);
  mainWindow.setSize(width, height);
  console.log(`[Main] Window → ${width}×${height} (${count} agents)`);
}

// =====================================================
// 윈도우 생성
// =====================================================
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const winSize = getWindowSizeForAgents(0);

  mainWindow = new BrowserWindow({
    width: winSize.width,
    height: winSize.height,
    x: Math.round((width - winSize.width) / 2),
    y: Math.round((height - winSize.height) / 2),
    transparent: true,
    frame: false,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  // 작업표시줄 복구 폴링 (250ms)
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 250);
}

// =====================================================
// 앱 설정
// ============================================================
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-logging');
app.commandLine.appendSwitch('log-level', '3');
process.env.ELECTRON_DISABLE_LOGGING = '1';
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');

// =====================================================
// Claude CLI 훅 자동 등록 & 프로세스 PID 모니터링
// =====================================================
function setupClaudeHooks() {
  try {
    const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) {
      const rawContent = fs.readFileSync(settingsPath, 'utf8').replace(/^\uFEFF/, '');
      settings = JSON.parse(rawContent);
    }
    if (!settings.hooks) settings.hooks = {};

    const startScript = path.join(__dirname, 'sessionstart_hook.js').replace(/\\/g, '/');
    const endScript = path.join(__dirname, 'sessionend_hook.js').replace(/\\/g, '/');

    const startCmd = `node "${startScript}"`;
    const endCmd = `node "${endScript}"`;

    const upsertHook = (eventName, cmd) => {
      let eventHooks = settings.hooks[eventName] || [];
      eventHooks = eventHooks.filter(container => {
        if (!container.hooks) return true;
        return !container.hooks.some(h => h.type === 'command' && h.command && h.command.includes(path.basename(cmd)));
      });
      eventHooks.push({ matcher: "*", hooks: [{ type: "command", command: cmd }] });
      settings.hooks[eventName] = eventHooks;
    };

    upsertHook('SessionStart', startCmd);
    upsertHook('SessionEnd', endCmd);

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
    debugLog('[Main] Registered SessionStart & SessionEnd hooks to settings.json');
  } catch (e) {
    debugLog(`[Main] Failed to setup hooks: ${e.message}`);
  }
}

function startPidMonitoring() {
  const pidFile = path.join(os.homedir(), '.claude', 'agent_pids.json');
  setInterval(() => {
    if (!agentManager || !fs.existsSync(pidFile)) return;

    try {
      const pidsInfo = JSON.parse(fs.readFileSync(pidFile, 'utf8'));
      const agents = agentManager.getAllAgents();

      agents.forEach(agent => {
        const info = pidsInfo[agent.id];
        if (info && info.pid) {
          try {
            process.kill(info.pid, 0); // 살아있으면 아무 일 없고, 죽었으면 에러 발생
          } catch (e) {
            // 프로세스가 없거나 죽음
            debugLog(`[Main] Process PID ${info.pid} for agent ${agent.id.slice(0, 8)} is DEAD. Removing...`);

            // logMonitor가 이 로그를 읽고 다시 살려내는 것(좀비 현상)을 막기 위해 JSONL 끝에 SessionEnd를 기록
            if (agent.jsonlPath && fs.existsSync(agent.jsonlPath)) {
              try {
                fs.appendFileSync(agent.jsonlPath, JSON.stringify({
                  type: "system", subtype: "SessionEnd", sessionId: agent.id, timestamp: new Date().toISOString()
                }) + '\n');
              } catch (e) { }
            }

            agentManager.removeAgent(agent.id);
            // 목록에서도 삭제
            delete pidsInfo[agent.id];
            fs.writeFileSync(pidFile, JSON.stringify(pidsInfo, null, 2));
          }
        }
      });
    } catch (e) {
      // JSON 파싱 에러(쓰기 도중) 무시
    }
  }, 1000); // 1초 주기로 체크 (단순 OS 프로세스 확인이라 부하 거의 없음)
}

app.whenReady().then(() => {
  debugLog('Pixel Agent Desk started');
  setupClaudeHooks();
  startPidMonitoring();
  createWindow();


  ipcMain.once('renderer-ready', () => {
    debugLog('[Main] renderer-ready event received!');

    agentManager = new AgentManager();
    agentManager.start();
    debugLog('[Main] AgentManager started');

    // 에이전트 이벤트 → renderer IPC 전달 + 동적 리사이징
    agentManager.on('agent-added', (agent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-added', agent);
        resizeWindowForAgents(agentManager.getAgentCount());
      }
    });

    agentManager.on('agent-updated', (agent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-updated', agent);
      }
    });

    agentManager.on('agent-removed', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agent-removed', data);
        resizeWindowForAgents(agentManager.getAgentCount());
      }
    });

    agentManager.on('agents-cleaned', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('agents-cleaned', data);
        resizeWindowForAgents(agentManager.getAgentCount());
      }
    });

    logMonitor = new LogMonitor(agentManager);
    debugLog('[Main] Starting LogMonitor...');
    logMonitor.start();
    debugLog('[Main] LogMonitor started');

    // =====================================================
    // 비활성 에이전트 정리: JSONL mtime 기반 (P3-Active)
    // Claude가 실행 중이면 로그 파일이 계속 갱신됨
    // 30분 이상 로그 변경이 없으면 비활성으로 간주 → 제거
    // =====================================================
    const INACTIVE_MS = 30 * 60 * 1000; // 30분

    function checkInactiveAgents() {
      if (!agentManager || !logMonitor) return;
      const now = Date.now();
      const agents = agentManager.getAllAgents();

      for (const agent of agents) {
        if (!agent.jsonlPath) continue;

        try {
          const stat = require('fs').statSync(agent.jsonlPath);
          const mtime = stat.mtimeMs;
          const age = now - mtime;

          if (age > INACTIVE_MS) {
            debugLog(`[Main] Agent '${agent.displayName}' inactive for ${Math.round(age / 60000)}min, removing...`);
            agentManager.removeAgent(agent.id);
          }
        } catch (e) {
          // 파일이 없어진 경우도 제거
          debugLog(`[Main] Agent '${agent.displayName}' jsonl missing, removing...`);
          agentManager.removeAgent(agent.id);
        }
      }
    }

    // 시작 5분 후 첫 체크 (앱 시작 직후엔 로그가 오래됐을 수 있음)
    setTimeout(() => checkInactiveAgents(), 5 * 60 * 1000);

    // 이후 5분마다 주기적 체크
    setInterval(() => checkInactiveAgents(), 5 * 60 * 1000);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (logMonitor) logMonitor.stop();
  if (agentManager) agentManager.stop();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (logMonitor) logMonitor.stop();
  if (agentManager) agentManager.stop();
});

// =====================================================
// IPC 핸들러
// =====================================================

ipcMain.on('get-work-area', (event) => {
  event.reply('work-area-response', screen.getPrimaryDisplay().workArea);
});

ipcMain.on('constrain-window', (event, bounds) => {
  const wa = screen.getPrimaryDisplay().workArea;
  const { width, height } = mainWindow.getBounds();
  mainWindow.setPosition(
    Math.max(wa.x, Math.min(bounds.x, wa.x + wa.width - width)),
    Math.max(wa.y, Math.min(bounds.y, wa.y + wa.height - height))
  );
});

ipcMain.on('get-all-agents', (event) => event.reply('all-agents-response', agentManager?.getAllAgents() ?? []));
ipcMain.on('get-agent-stats', (event) => event.reply('agent-stats-response', agentManager?.getStats() ?? {}));

// 에이전트 수동 퇴근 IPC 핸들러
ipcMain.on('dismiss-agent', (event, agentId) => {
  if (agentManager) agentManager.dismissAgent(agentId);
});
