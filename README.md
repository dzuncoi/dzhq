# Pixel Agent Desk

[![CI](https://github.com/geunilbae/pixel-agent-desk/actions/workflows/test.yml/badge.svg)](https://github.com/geunilbae/pixel-agent-desk/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)

> Real-time pixel avatar visualization for Claude Code CLI multi-agent sessions.

Pixel Agent Desk is a standalone Electron app that listens to [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook events and renders each agent session as an animated pixel character — complete with a virtual office, activity heatmaps, and token usage analytics.

<!-- Replace with actual screenshot/GIF -->
<!-- ![Pixel Agent Desk Screenshot](docs/screenshot.png) -->

## Highlights

- **Pixel Avatars** — Each agent session gets a unique sprite character with state-driven animations (Waiting, Thinking, Working, Done, Help, Error)
- **Virtual Office** — 2D pixel art office where characters walk between desks using A* pathfinding
- **Agent Desk Dashboard** — Web-based monitoring panel with real-time stats (REST API + SSE, http://localhost:3000)
- **Activity Heatmap** — GitHub-style contribution grid showing daily agent session frequency
- **Token Analytics** — Per-session and aggregate token usage, cost estimates, model breakdowns
- **Terminal Focus** — Click any avatar to bring its terminal window to the foreground
- **Auto Recovery** — Running sessions are automatically restored on app restart
- **Sub-agents & Teams** — Full support for Claude Code sub-agents and team mode with no agent count limit

## Requirements

- **Node.js** 20 or later
- **Claude Code CLI** installed and configured
- **OS:** Windows, macOS, or Linux

## Quick Start

```bash
git clone https://github.com/geunilbae/pixel-agent-desk.git
cd pixel-agent-desk
npm install   # Installs dependencies + auto-registers Claude CLI hooks
npm start     # Launches the Electron app
```

> `npm install` automatically registers HTTP hooks in `~/.claude/settings.json`.
> On app startup, hooks are re-registered if not already present.

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch the Electron app |
| `npm run dev` | Development mode (DevTools enabled) |
| `npm run dashboard` | Run Agent Desk server only (http://localhost:3000) |
| `npm test` | Run tests |
| `npm run test:coverage` | Coverage report |
| `npm run test:watch` | Watch mode |

## How It Works

```
Claude CLI ──HTTP hook──▶ POST(:47821) ──▶ hookProcessor
                                              │
                                    ┌─────────┤
                                    ▼         ▼
                              AgentManager  Agent Desk Server
                                (SSoT)      (:3000, SSE/REST)
                                  │               │
                        ┌─────────┼─────┐    ┌────┼────────────┐
                        ▼         ▼     ▼    ▼    ▼            ▼
                    renderer/*  scanner  │  Office  Agents   Tokens
                   (pixel avatar) (JSONL)│  (Canvas 2D)     (Charts)
                                         ▼
                                    Heatmap
                                  (GitHub-style)
```

1. Claude Code CLI sends hook events (SessionStart, PreToolUse, PostToolUse, etc.) as HTTP POST to port 47821
2. The hook processor maps events to agent states and updates the central AgentManager
3. The pixel renderer draws animated avatars; the dashboard serves a web UI with real-time updates
4. PID-based liveness checking automatically removes stale agents when processes exit

## Agent State Model

| Hook Event | Agent State |
|------------|-------------|
| `SessionStart` | Waiting |
| `UserPromptSubmit` | Thinking |
| `PreToolUse` (2nd+) | Working |
| `PostToolUse` | Thinking (idle 2.5s → Done) |
| `Stop` / `TaskCompleted` | Done |
| `Notification` | Help |
| `SessionEnd` | Removed |

## Project Structure

```
src/
├── main.js                    # App orchestrator
├── main/
│   ├── hookServer.js          # HTTP hook server (:47821)
│   ├── hookProcessor.js       # Event processing logic
│   ├── hookRegistration.js    # Claude CLI hook auto-registration
│   ├── livenessChecker.js     # PID-based liveness checking
│   ├── windowManager.js       # Electron window management
│   ├── ipcHandlers.js         # IPC handlers
│   └── sessionPersistence.js  # State persistence & recovery
├── renderer/                  # Pixel avatar UI (7 modules)
├── office/                    # Virtual office (9 modules, A* pathfinding)
├── agentManager.js            # Agent state management (SSoT)
├── dashboardAdapter.js        # Internal → dashboard state mapping
├── dashboard-server.js        # Agent Desk web server (REST + SSE)
├── sessionScanner.js          # JSONL token/cost analysis
├── heatmapScanner.js          # Daily activity heatmap aggregation
├── pricing.js                 # Per-model token pricing
├── errorHandler.js            # Error capture & deduplication
└── utils.js                   # Shared utilities
public/
├── dashboard.css              # Dashboard styles
├── dashboard.js               # Dashboard client logic
├── characters/                # Pixel avatar sprites (23 characters)
└── office/                    # Office tilemap & object sprites
```

## Hook Registration

Hooks are auto-registered as HTTP type in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:47821/hook" }] }],
    "PreToolUse":   [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:47821/hook" }] }],
    "PostToolUse":  [{ "matcher": "*", "hooks": [{ "type": "http", "url": "http://localhost:47821/hook" }] }]
  }
}
```

If auto-registration fails, add the entries above manually for all supported events:
`SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `Notification`, `SubagentStart`, `SubagentStop`, `TeammateIdle`.

## Troubleshooting

### Avatars don't appear
- Make sure Claude Code CLI is running and hooks are registered: check `~/.claude/settings.json`
- Verify the hook server is listening: `curl http://localhost:47821/hook` should return 404 (GET not allowed)
- Check if another app is using port 47821

### Ghost/zombie avatars persist
- This is usually a PID detection issue on Windows — the avatar will be cleaned up within 30 seconds by the zombie sweep
- Restarting the app clears all state

### Dashboard won't load
- The dashboard runs on port 3000; make sure nothing else is using it
- Try `npm run dashboard` to run the server standalone

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to contribute.

## License

- **Source code:** [MIT License](LICENSE)
- **Art assets** (`public/characters/`, `public/office/`): [Custom restrictive license](LICENSE-ASSETS) — not for redistribution or modification
