const fs = require('fs');
const path = require('path');
const os = require('os');

const LOG_FILE = path.join('D:/projects/pixel-agent-desk-master', 'hook_debug.log');

const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
    const raw = Buffer.concat(chunks).toString();
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] RAW: ${raw.slice(0, 300)}\n`, 'utf-8');

    try {
        const data = JSON.parse(raw);

        const sessionId = data.session_id || data.sessionId;
        const transcriptPath = data.transcript_path || data.transcriptPath;

        if (!transcriptPath) {
            fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ERROR: no transcript_path\n`, 'utf-8');
            process.exit(0);
        }

        // ~ 처리 (Windows에서는 백슬래시 그대로 유지)
        const resolvedPath = transcriptPath.replace(/^~/, os.homedir());

        // JSONL 파일의 마지막 유효 줄에서 실제 sessionId 읽기
        // (Claude CLI의 session_id가 파일 내부 sessionId와 다를 수 있음)
        let realSessionId = sessionId;
        try {
            const content = fs.readFileSync(resolvedPath, 'utf-8');
            const lines = content.split('\n').filter(l => l.trim());
            for (let i = lines.length - 1; i >= 0; i--) {
                try {
                    const parsed = JSON.parse(lines[i]);
                    if (parsed.sessionId) {
                        realSessionId = parsed.sessionId;
                        break;
                    }
                } catch (e) { }
            }
        } catch (e) { }

        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] hook_session=${sessionId?.slice(0, 8)}, real_session=${realSessionId?.slice(0, 8)}, file=${path.basename(resolvedPath)}\n`, 'utf-8');

        const line = JSON.stringify({
            type: 'system',
            subtype: 'SessionEnd',
            sessionId: realSessionId,   // 실제 JSONL 내부 sessionId 사용
            timestamp: new Date().toISOString()
        }) + '\n';

        fs.appendFileSync(resolvedPath, line, 'utf-8');
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] OK → ${path.basename(resolvedPath)}\n`, 'utf-8');

        process.stderr.write(`[sessionend_hook] OK — ${realSessionId?.slice(0, 8)}\n`);
    } catch (err) {
        fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ERROR: ${err.message}\n`, 'utf-8');
        process.stderr.write(`[sessionend_hook] ERROR: ${err.message}\n`);
    }
    process.exit(0);
});
