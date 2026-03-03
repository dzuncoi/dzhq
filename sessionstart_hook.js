const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const LOG_FILE = path.join('D:/projects/pixel-agent-desk-master', 'hook_debug.log');
const PID_FILE = path.join(os.homedir(), '.claude', 'agent_pids.json');

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
    const raw = Buffer.concat(chunks).toString();
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] (START) RAW: ${raw.slice(0, 300)}\n`, 'utf-8');

    try {
        const data = JSON.parse(raw);
        const sessionId = data.session_id || data.sessionId;
        const cwd = data.cwd;

        // 이 스크립트를 실행한 부모 프로세스의 PID (Claude CLI 또는 그 쉘)
        let parentPid = process.ppid;

        // Windows에서, 우리를 실행시킨 진짜 Claude CLI(node.exe)의 PID를 찾음
        // (cmd.exe 등 래퍼 쉘을 우회하기 위함)
        try {
            if (process.platform === 'win32') {
                const { spawnSync } = require('child_process');
                const psScript = `
                    $id = ${parentPid};
                    for ($i=0; $i -lt 5; $i++) {
                        $p = Get-CimInstance Win32_Process -Filter "ProcessId=$id" -ErrorAction SilentlyContinue
                        if (-not $p) { break }
                        if ($p.CommandLine -match 'claude-code|cli\\.js|claude') {
                            Write-Output $p.ProcessId
                            exit 0
                        }
                        $id = $p.ParentProcessId
                        if (-not $id -or $id -eq 0) { break }
                    }
                    Write-Output 0
                `;
                const res = spawnSync('powershell.exe', ['-NoProfile', '-Command', psScript.replace(/\n/g, ' ')]);
                const outText = res.stdout ? res.stdout.toString().trim() : '';
                const detectedPid = parseInt(outText, 10);
                if (detectedPid > 0) {
                    parentPid = detectedPid;
                }
            }
        } catch (e) { }

        // 기존 PID 목록 읽기
        let pidsInfo = {};
        if (fs.existsSync(PID_FILE)) {
            try { pidsInfo = JSON.parse(fs.readFileSync(PID_FILE, 'utf-8')); } catch (e) { }
        }

        // 현재 세션의 PID와 타임스탬프, CWD 저장
        pidsInfo[sessionId] = {
            pid: parentPid,
            cwd: cwd,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync(PID_FILE, JSON.stringify(pidsInfo, null, 2), 'utf-8');
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] (START) Saved PID ${parentPid} for session ${sessionId}\n`, 'utf-8');

        process.stderr.write(`[sessionstart_hook] OK — Tracked PID ${parentPid}\n`);
    } catch (err) {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] (START) ERROR: ${err.message}\n`, 'utf-8');
        process.stderr.write(`[sessionstart_hook] ERROR: ${err.message}\n`);
    }
    process.exit(0);
});
