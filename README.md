# DzHQ — Pixel Agent Desk

[![CI](https://github.com/Mgpixelart/pixel-agent-desk/actions/workflows/test.yml/badge.svg)](https://github.com/Mgpixelart/pixel-agent-desk/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-32+-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Version](https://img.shields.io/badge/version-2.0.0-cyan)](package.json)

> Real-time pixel avatar visualization for Claude Code CLI multi-agent sessions.

DzHQ is a standalone Electron app that listens to [Claude Code](https://docs.anthropic.com/en/docs/claude-code) hook events and renders each agent session as an animated pixel character — complete with a virtual office, activity heatmaps, and token usage analytics.

![Demo](docs/demo.gif)

| | | |
|---|---|---|
| ![](docs/screenshot-1.png) | ![](docs/screenshot-2.png) | ![](docs/screenshot-4.png) |
| ![](docs/screenshot-5.png) | | |

---

## Features

### Pixel Avatars & Virtual Office

- **Pixel Avatars** — Each agent session gets a unique sprite character (48×64px) with state-driven animations
- **Virtual Office** — 2D top-down office where characters walk between desks and interact visually
- **Agent Types** — Visual distinction between main agents, subagents (80% scale, purple dashed border), and teammates
- **Context Menus** — Right-click any avatar for quick actions

### Analytics Dashboard

Accessible at `http://localhost:3000` or via **Ctrl/Cmd+D**:

- **Overview** — Live office floorplan with character positions and popover agent info
- **Mesh** — GitHub-style year-long activity heatmap (365-day session frequency grid)
- **Tokens** — Token volume charts, cost impact, model breakdowns, and KPI cards

### Monitoring & Analytics

- **Activity Heatmap** — Daily agent session frequency across 12 months
- **Token Analytics** — Per-session input/output tokens, cost estimates, model breakdowns
- **KPI Strip** — Live: total agents, working/thinking counts, tokens, cost, session duration
- **Real-time Updates** — WebSocket push from app to dashboard, auto-reconnects on disconnect

### Desktop Integration

- **Terminal Focus** — Click any avatar or press Enter to bring its terminal to the foreground
- **PiP Mode** — Always-on-top floating window so your pixel office stays visible while you work
- **Auto Recovery** — Running sessions are automatically restored on app restart
- **Sub-agents & Teams** — Full support for Claude Code sub-agents and team mode
- **Error Toasts** — Severity-leveled notifications (fatal / error / warning / info)

---

## Design System

DzHQ uses a **cyberpunk glitch** aesthetic built on two custom fonts and a near-black dark palette.

### Color Palette

| Role | Color | Hex |
|------|-------|-----|
| Background | Near-black | `#030408` |
| Surface 1 | Dark navy | `#060c14` |
| Surface 2 | Navy | `#0a1220` |
| Surface 3 | Navy mid | `#0d1a2a` |
| Accent / Idle | Cyan | `#00ffff` |
| Working | Orange | `#f97316` |
| Thinking | Violet | `#8b5cf6` |
| Waiting | Slate | `#94a3b8` |
| Complete | Green | `#22c55e` |
| Error | Red | `#ef4444` |
| Offline | Slate-600 | `#475569` |

### Typography

| Role | Font | Weights |
|------|------|---------|
| Display / Headings | Orbitron | 700, 900 |
| Body / Mono / UI | JetBrains Mono | 400, 500, 600, 700 |

Base font size: 14px.

### Visual Language

- **Scanline texture** — subtle horizontal-line overlay on backgrounds
- **Glowing borders** — `box-shadow` neon glow on status bubbles and panels
- **Speech bubbles** — terminal-style callouts with tail pointers
- **Smooth enter animations** — agents slide in (0.3s), subagents (0.25s)
- **Pixel-art rendering** — `image-rendering: pixelated` on all sprites

### Layout

| Scenario | Behavior |
|----------|----------|
| Single agent | Large centered card with expanded speech bubble |
| Multi-agent | Auto-fill grid, max 80px cards, ~10 per row |
| Project groups | Visual margin separation between groups |

---

## Architecture

```
Claude Code CLI
      │  POST /hook (port 47821)
      ▼
┌─────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│  HookServer → HookProcessor → AgentManager              │
│  SessionScanner (60s) → token/cost tracking             │
│  HeatmapScanner (300s) → activity grid                  │
│  SessionPersistence → recovery on restart               │
│  LivenessChecker → zombie session detection             │
│  WindowManager → main window + dashboard window         │
│  IPC: agent-added / agent-updated / agent-removed       │
└───────────────┬──────────────────────┬──────────────────┘
                │ IPC                  │ HTTP/WS
                ▼                      ▼
     ┌──────────────────┐   ┌────────────────────────┐
     │ Renderer (Overlay)│   │ Dashboard Server :3000  │
     │ index.html        │   │ dashboard.html          │
     │ Pixel avatar grid │   │ /api/agents, /api/stats │
     │ Keyboard nav      │   │ /api/heatmap, /api/sess │
     │ Context menus     │   │ /ws WebSocket           │
     └──────────────────┘   └────────────────────────┘
```

### Key Source Files

```
src/
├── main.js                  # Electron entry point
├── main/
│   ├── hookServer.js        # HTTP server :47821
│   ├── hookRegistration.js  # Writes ~/.claude/settings.json
│   ├── hookProcessor.js     # Maps hook events → agent lifecycle
│   ├── livenessChecker.js   # PID-based zombie detection
│   ├── sessionPersistence.js# State recovery on restart
│   ├── ipcHandlers.js       # Main ↔ Renderer IPC bridge
│   └── windowManager.js     # BrowserWindow management
├── renderer/
│   ├── init.js              # Bootstrap, IPC listeners
│   ├── agentGrid.js         # Grid layout, card management
│   ├── agentCard.js         # DOM card creation
│   ├── animationManager.js  # Sprite frame animation loop
│   ├── config.js            # Avatar sprites, states, constants
│   ├── uiComponents.js      # Dashboard button, context menu
│   └── errorUI.js           # Toast notifications
├── office/                  # 2D office canvas engine
│   ├── office-init.js
│   ├── office-renderer.js
│   ├── office-character.js
│   ├── office-pathfinder.js
│   └── ...
├── agentManager.js          # Agent CRUD + EventEmitter
├── sessionScanner.js        # Transcript polling, token tracking
├── heatmapScanner.js        # Activity frequency aggregation
├── dashboard-server.js      # REST + WebSocket server
└── install.js               # Post-install hook registration
```

---

## Claude Code Hook Integration

`npm install` automatically registers hooks in `~/.claude/settings.json`. The app listens on **port 47821** for POST requests from Claude Code.

### Registered Hook Events

| Category | Events |
|----------|--------|
| Session | `SessionStart`, `SessionEnd`, `Stop` |
| Tools | `PreToolUse`, `PostToolUse`, `PostToolUseFailure` |
| User | `UserPromptSubmit`, `PermissionRequest`, `Notification` |
| Multi-agent | `SubagentStart`, `SubagentStop`, `TeammateIdle` |
| System | `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`, `PreCompact`, `TaskCompleted`, `InstructionsLoaded` |

Each hook payload includes: `hook_event_name`, `session_id`, `_pid`, `_timestamp`, `transcript_path`, `cwd`, `model`, `agent_type`, and event-specific fields.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + D` | Open web dashboard |
| `Tab` | Next agent |
| `Shift + Tab` | Previous agent |
| `↑ / ↓` | Jump 10 agents |
| `← / →` | Navigate agents |
| `Enter` | Focus terminal of active agent |
| `Escape` | Close overlay / context menu |
| Right-click | Context menu on agent avatar |

---

## Requirements

- **Node.js** 20 or later
- **Claude Code CLI** installed and configured
- **OS:** macOS, Windows, or Linux

---

## Quick Start

```bash
git clone https://github.com/Mgpixelart/pixel-agent-desk.git
cd pixel-agent-desk
npm install    # also auto-registers Claude Code hooks
npm start
```

Then open [http://localhost:3000](http://localhost:3000) for the full dashboard.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Launch the Electron app |
| `npm run dev` | Development mode (DevTools enabled) |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run lint` | Lint source files |
| `npm run format` | Format source files with Prettier |
| `npm run dist:mac` | Build macOS DMG |
| `npm run dist:win` | Build Windows installer + portable |
| `npm run dist:linux` | Build Linux AppImage + deb |

---

## Distribution

Built with [electron-builder](https://www.electron.build/). Output goes to `./release/`.

| Platform | Format | Arch |
|----------|--------|------|
| macOS | DMG | x64, arm64 |
| Windows | NSIS installer + portable | x64 |
| Linux | AppImage + .deb | x64 |

---

## Troubleshooting

**Avatars don't appear**
- Check that hooks are registered in `~/.claude/settings.json`
- Verify the hook server is up: `curl http://localhost:47821/hook` should return 404

**Ghost avatars persist**
- Usually a PID detection issue on Windows — clears within 30 seconds automatically
- Restarting the app clears all state

**Dashboard won't load**
- Make sure port 3000 is free

**Hooks not firing**
- Re-run `npm install` to re-register hooks, or manually add entries to `~/.claude/settings.json`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

- **Source code:** [MIT License](LICENSE)
- **Art assets** (`public/characters/`, `public/office/`): [Custom restrictive license](LICENSE-ASSETS) — not for redistribution or modification
