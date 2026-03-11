# DzHQ — Cyberpunk Glitch Redesign

**Date:** 2026-03-11
**Status:** Approved
**Scope:** Full redesign — colors, typography, all UI components, dashboard layout restructure

---

## Overview

Redesign the entire DzHQ app (formerly Pixel Agent Desk) using a **Cyberpunk Glitch** visual theme. The redesign covers three UI surfaces: the desktop overlay (floating pixel characters), the web dashboard, and the office/canvas view. The app name is also updated from "Pixel Agent Desk" to **DzHQ**.

### Design Decisions Summary

| Decision | Choice | Rationale |
|---|---|---|
| Theme | Cyberpunk Glitch (refined) | Glitch effects on hero elements only; data panels stay readable |
| Overlay background | Transparent (unchanged) | Characters continue to float over the user's desktop |
| Pixel aesthetic | Characters only | Sprites stay pixel art; UI is smooth cyberpunk — no pixel fonts in dashboard |
| Dashboard layout | HUD Command Center (top nav) | Maximum stage space; mission control feel; fits DzHQ identity |
| Scope | Full redesign | New color system, component designs, and dashboard layout restructure |

---

## App Name

- **New name:** DzHQ
- **Logo treatment:** `DZ` in cyan (`#00ffff`) + `HQ` in magenta (`#ff00ff`), both with neon glow
- **Animation:** Periodic RGB glitch on the logo (CSS keyframe, fires every ~6s, subtle)
- **Font:** Orbitron 900

---

## Color System

### Backgrounds & Surfaces

| Token | Hex | Usage |
|---|---|---|
| `--bg-base` | `#030408` | App background, window base |
| `--bg-surface-1` | `#060c14` | Panels, cards, menus |
| `--bg-surface-2` | `#0a1220` | Elevated panels, modal backgrounds |
| `--bg-surface-3` | `#0d1a2a` | Hover states on panels |
| `--bg-topbar` | `#030c18` | Top navigation bar |
| `--bg-kpi` | `#020c14` | KPI strip |

### Neon Accents

| Token | Hex | Usage |
|---|---|---|
| `--neon-cyan` | `#00ffff` | Primary accent — borders, active nav, KPI numbers, glow |
| `--neon-cyan-dim` | `#00cccc` | Dimmed cyan for secondary elements |
| `--neon-magenta` | `#ff00ff` | Glitch accent — logo "HQ", cost numbers, error emphasis |
| `--neon-magenta-dim` | `#cc00cc` | Dimmed magenta |
| `--neon-green` | `#00ff41` | Alternative accent (matrix green), used sparingly |

### Borders

| Token | Hex | Usage |
|---|---|---|
| `--border-subtle` | `#00ffff18` | Panel borders, card borders |
| `--border-strong` | `#00ffff44` | Active states, focused elements |
| `--border-glow` | `#00ffff66` | Corner bracket decorations |

### Text

| Token | Hex | Usage |
|---|---|---|
| `--text-primary` | `#e0f0ff` | Main body text, headings |
| `--text-muted` | `#8b9ec7` | Secondary text, labels, placeholders |
| `--text-disabled` | `#4a5a7a` | Disabled states, timestamps |
| `--text-accent` | `#00ffff` | Active labels, links, highlighted values |

### Agent State Colors (unchanged)

These are preserved exactly from the current codebase — users have existing color associations.

| State | Hex | Usage |
|---|---|---|
| `working` | `#f97316` | Orange — active execution |
| `thinking` | `#8b5cf6` | Violet — LLM reasoning (pulsing animation) |
| `waiting` | `#94a3b8` | Slate — idle/waiting |
| `reporting` / `done` | `#22c55e` | Green — completed |
| `help` / `error` | `#ef4444` | Red — needs attention |
| `offline` | `#475569` | Dark slate — disconnected |

---

## Typography

| Role | Font | Weight | Size | Case | Usage |
|---|---|---|---|---|---|
| Logo | Orbitron | 900 | 15px | mixed | DzHQ logo in topbar |
| Section heading | Orbitron | 700 | 8–10px | ALL CAPS | Panel headers, section labels |
| Nav items | JetBrains Mono | 700 | 9px | ALL CAPS | Top nav buttons |
| KPI values | JetBrains Mono | 700 | 14–15px | — | Numeric stats in KPI strip |
| Body / UI | JetBrains Mono | 600 | 10–11px | — | Speech bubbles, panel rows |
| Secondary | JetBrains Mono | 400 | 8–9px | — | Descriptions, timestamps |
| Labels | JetBrains Mono | 400 | 7–8px | ALL CAPS | Table headers, small tags |

**Font loading:** Orbitron is added for display use only. JetBrains Mono is already loaded in `styles.css` — no additional load for UI text.

---

## Effects System

### Neon Glow
Applied to: logo, active nav items, KPI numbers, state-colored borders.
```css
/* Cyan glow — 3 levels */
text-shadow: 0 0 10px #00ffff, 0 0 20px #00ffff88, 0 0 40px #00ffff44;
box-shadow: 0 0 8px #00ffff33, inset 0 0 12px #00ffff08;
```

### RGB Glitch (logo only)
Fires periodically (~every 6s). Brief, subtle. Not used on data.
```css
@keyframes glitch {
  0%, 90%, 100% { transform: translate(0); clip-path: none; }
  91% { transform: translate(-2px, 0); clip-path: polygon(0 25%, 100% 25%, 100% 45%, 0 45%); color: #ff00ff; }
  93% { transform: translate(2px, 0); clip-path: polygon(0 60%, 100% 60%, 100% 75%, 0 75%); color: #00ff41; }
  95% { transform: translate(0); clip-path: none; color: #00ffff; }
}
```

### Scanlines
Applied to: panel backgrounds, speech bubbles. Very subtle (6–10% opacity).
```css
background: repeating-linear-gradient(
  0deg, transparent, transparent 2px,
  rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px
);
```

### Corner Brackets
Applied to: KPI cards, data panels. CSS `::before`/`::after` L-shaped lines.
```css
.panel::before { top: 0; left: 0; border-top: 1px solid #00ffff66; border-left: 1px solid #00ffff66; }
.panel::after  { bottom: 0; right: 0; border-bottom: 1px solid #00ffff66; border-right: 1px solid #00ffff66; }
```

### Background Grid
Applied to: agent stage canvas. Subtle perspective grid.
```css
background-image:
  linear-gradient(#00ffff07 1px, transparent 1px),
  linear-gradient(90deg, #00ffff07 1px, transparent 1px);
background-size: 28px 28px;
```

### State Pulse Animations (existing, rethemed)
- Thinking: violet pulse `rgba(139, 92, 246, 0.5)` — unchanged behavior, new context
- Working: orange pulse `rgba(249, 115, 22, 0.5)` — unchanged behavior, new context

---

## Dashboard Layout — HUD Command Center

Replaces the current sidebar layout with a full-width horizontal structure.

```
┌─────────────────────────────────────────────────────────────┐
│  TOPBAR: DzHQ logo │ nav: OVERVIEW / MESH / TOKENS │ status │  44px
├─────────────────────────────────────────────────────────────┤
│  KPI STRIP: Total │ Working │ Thinking │ Tokens │ Cost │ Time│  38px
├──────────────────────────────────────────────┬──────────────┤
│                                              │ AGENTS panel │
│              AGENT STAGE                    │ TOKEN USAGE  │
│         (grid bg + pixel chars)             │ COST         │  flex
│                                              │ MODEL        │
│                                              │ (200px wide) │
├─────────────────────────────────────────────────────────────┤
│  FOOTER: connection status │ ws URL                version  │  30px
└─────────────────────────────────────────────────────────────┘
```

### Top Bar (44px)
- Background: `#030c18`
- Bottom border: `1px solid #00ffff33` + gradient glow line overlay
- **Logo:** Orbitron 900, `DZ` cyan + `HQ` magenta, neon glow, periodic glitch animation
- **Nav:** JetBrains Mono 700 9px ALL CAPS, active item has `#00ffff44` border + `#00ffff0e` background + text glow
- **Right:** Live agent count (green pulse dot), current time

### KPI Strip (38px)
- Background: `#020c14`
- 6 cells divided by `1px #00ffff08` separators
- Values: 14px JetBrains Mono 700, colored with state/semantic neon glow
- Labels: 7px ALL CAPS muted text below each value
- Stats shown: Total, Working, Thinking, Tokens, Cost, Session time

### Agent Stage (flex center)
- Background: `#030408`
- 28px grid overlay at 7% opacity
- Scanline overlay at 6% opacity
- "AGENT FIELD — LIVE" label top-left, 7px cyan dim
- Corner bracket decorations top-left and bottom-right
- Pixel characters rendered as sprite sheets (unchanged from current implementation)

### Right Data Panel (200px)
- Background: `#060c14`
- `1px #00ffff0d` left border
- 4 sections: Agents, Token Usage, Cost, Model
- Each section has Orbitron 7px ALL CAPS header
- Rows: 8px muted label + 10–11px bold value in state/semantic color
- Corner bracket decoration on each section card

### Footer (30px)
- Background: `#020c14`
- `1px #00ffff0d` top border
- Connection status (green dot + text), WebSocket URL, app version

---

## Overlay Component Redesign

The overlay window remains transparent. Only visual treatment of child components changes.

### Speech Bubble
| Property | Old | New |
|---|---|---|
| Background | `rgba(255,255,255,0.97)` | `#060c14` (dark) |
| Border | `2px solid #333` | `1.5px solid <state-color>` + neon glow |
| Text color | `#333` | State color |
| Font | Pretendard/UI sans | JetBrains Mono 600 |
| Texture | None | Subtle scanline overlay |
| Tail | Solid dark | Inherits state border color |

### Name Badge
| Property | Old | New |
|---|---|---|
| Background | `rgba(0,0,0,0.65)` | `rgba(3,4,8,0.9)` |
| Border | `1px solid rgba(255,255,255,0.2)` | `1px solid #00ffff1a` |
| Font | Pretendard/UI sans | JetBrains Mono 700 |

### Type Tag (state badge above bubble)
| Property | Old | New |
|---|---|---|
| Background | Solid state color | `<state-color>22` (10% opacity tint) |
| Border | `1px solid <dark state color>` | `1px solid <state-color>44` |
| Text | White | State color |
| Font | Pretendard | JetBrains Mono 700 |
| Border radius | `3px` | `2px` |

### Terminal Focus Button (`>_`)
| Property | Old | New |
|---|---|---|
| Background | `#1a1a2e` | `#030c18` |
| Border | `2px solid #5a9bcf` | `1.5px solid #00ffff44` |
| Cursor text color | `#5aff5a` | `#00ffff` |
| Title bar color | `#5a9bcf` | `#00ffff1a` |
| Hover border | `#7ec8e3` | `#00ffff` + `box-shadow: 0 0 8px #00ffff44` |

### Satellite Tray (subagent mini-avatars)
- Mini avatar border: state-colored (unchanged) — already correct
- Tray background wrapper: `#9c27b011` → unchanged purple tint (subagent purple kept)

---

## Context Menu Redesign

| Property | Old | New |
|---|---|---|
| Background | `rgba(30,30,30,0.95)` | `#060c14` |
| Border | `1px solid rgba(255,255,255,0.1)` | `1px solid #00ffff22` |
| Border radius | `12px` | `8px` |
| Box shadow | Dark only | Dark + `0 0 0 1px #00ffff08` outer cyan glow |
| Icons | Text/emoji | SVG (Lucide), `#00ffff88` tint |
| Item hover bg | `rgba(255,255,255,0.1)` | `#00ffff08` |
| Item hover color | Unchanged | `#00ffff` |
| Danger row | `#ff6b6b` | `#ef4444` (unchanged value, existing color token) |
| Separator | `rgba(255,255,255,0.1)` | `#00ffff0d` |
| Font | System UI sans | JetBrains Mono 400 12px |

---

## Error Toast Redesign

| Property | Old | New |
|---|---|---|
| Background | `rgba(255,255,255,0.98)` | `#060c14` |
| Left accent | Solid severity color | Same + outer `box-shadow: 0 0 20px <severity>11` glow |
| Error code | Plain text | Orbitron ALL CAPS + severity color |
| Icon | Emoji | Bordered square `[!]` in severity color |
| Title font | System sans | JetBrains Mono 700 11px |
| Body font | System sans | JetBrains Mono 400 9px |
| Primary action | `#2196f3` blue | Severity color (red for errors) |
| Secondary action | Gray | Cyan ghost button |

---

## Icon System

All icons use **Lucide** SVG icons (already available). No emoji used in UI.

- Icon color: `#00ffff88` (muted cyan) by default
- Active/hover: `#00ffff`
- Danger context: `#ef4444`
- Size: `14×14px` standard, `16×16px` for primary actions

---

## Accessibility Notes

- All neon text on dark panels maintains ≥4.5:1 contrast ratio (`#00ffff` on `#030408` = 14.7:1)
- State colors retain their existing WCAG compliance
- `prefers-reduced-motion`: glitch animation and pulse animations must be disabled
- Focus states: `outline: 2px solid #00ffff; outline-offset: 2px` replaces current purple outline
- Keyboard navigation: tab order unchanged

---

## Files to Update

| File | Changes |
|---|---|
| `styles.css` | Full retheme — all CSS custom properties, component styles |
| `index.html` | App title update to "DzHQ" |
| `dashboard.html` | Layout restructure (sidebar → top nav + KPI strip), component retheme |
| `public/dashboard.css` | Full retheme matching new design system |
| `src/office/office-config.js` | `STATE_COLORS` values — kept unchanged |

---

## Out of Scope

- Pixel character sprites (no changes to `.webp` sprite sheets)
- Office view canvas rendering logic (only CSS/color token changes)
- Backend/IPC logic
- Adding new features or views
