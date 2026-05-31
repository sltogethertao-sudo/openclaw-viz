# 🌀 OpenClaw Viz — Multi-Agent Work Visualization

> Industrial-grade dashboard for observing and controlling OpenClaw multi-agent systems.

<p>
  <a href="https://github.com/openclaw/openclaw"><img src="https://img.shields.io/badge/OpenClaw-2026.5.7-6C47FF" alt="OpenClaw"></a>
  <img src="https://img.shields.io/badge/v1.0-stable-6464ff" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License">
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D22-blue" alt="Node"></a>
</p>

---

## Features

### 🤖 Agent Topology Graph
- Force-directed graph (D3.js) showing real-time agent relationships
- Node types: Agent · Session · Cron Job · Module
- Status indicators: active, idle, stale, error
- Drag, zoom, pan · Click-to-inspect

### 📊 Session Monitoring
- Real-time session list with status, token usage, cost
- Session history viewer with role-colored messages
- Module attribution · Fuzzy search & multi-filter · 4 sort modes
- JSON / Markdown export

### ⚡ Human Intervention Console
- Send messages to any active session
- Steer sub-agents with directional instructions
- Terminate runaway agents

### 🗂️ Project Intelligence
- Module dependency graph (11 workspace projects, 6 relationship types)
- Project timeline / Gantt with milestone markers
- Activity heatmap from daily memory files · Milestone tracker
- Task flow pipeline (Input → Processing → Completed)

### 🔔 Smart Alerts Engine
- Error spike detection · Stale session monitoring
- Token usage warnings · Model provider failure alerts
- Configurable alert thresholds

### 👥 Multi-User & RBAC
- User registration with viewer / operator / admin roles
- 10 fine-grained permissions across 3 roles
- Immutable audit trail with SHA-based hash chains
- SSO / JWT authentication (Google OIDC, GitHub, Microsoft stubs)

### 🎞️ Session Replay & A/B Testing
- Playback engine with 378-frame support
- 5 speed settings (0.5x–10x) · Timeline scrubber
- This week vs. last week metrics comparison

### 🛡️ Enterprise
- Multi-cluster monitoring with DNS-SD auto-discovery
- Prometheus / Grafana integration (7-panel dashboard export)
- API rate limiting (per-role) · Session-level audit export (JSON/CSV/JSONL)
- Intervention policy engine with 5 built-in rules

### ⚙️ Processing Pipeline (LogicFolding Q1)
- **9-step logic chain**: S₁→S₂→HBE→S₃→Fusion→Engine→Trace→Analyzer→Efficiency
- **Real-time execution stream**: per-step live log driven by `.md` file writes from the engine
- **State machine**: file-existence-based progress detection (no hardcoded timers)
- **Dual-channel updates**: WebSocket push + 5s polling fallback
- **Step metrics on cards**: confidence %, facts checked, verdict preserved across transitions
- **Stream filtering**: only current step's entries shown in execution panel
- **Multi-problem mode** (design complete): sub-problem badge bar, collapsible SubProblemCards, CrossFusion with 4 output files

---

## Prerequisites

- **Node.js** ≥ 22 (recommended 24)
- **OpenClaw** 2026.5.x running locally with a Gateway
- **journalctl** (optional, for live log viewer)

---

## Quick Start

```bash
# Install dependencies
npm run install:all

# Development (hot reload)
npm run dev

# Production build
npm run build
npm start
```

> ⚠️ **OpenClaw Gateway must be running** on the same machine for Viz to connect. The dashboard reads session data from `~/.openclaw/agents/` and `~/.openclaw/cron/`.

The dashboard will be available at **http://localhost:3000**.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Browser (React)                    │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Topology  │  │  Session  │  │  Intervention    │ │
│  │  Graph    │  │  Monitor  │  │  Console         │ │
│  │  (D3.js)  │  │           │  │                  │ │
│  └─────┬─────┘  └─────┬─────┘  └───────┬──────────┘ │
│        │               │                │            │
│  ┌─────┴───────────────┴────────────────┴──────────┐ │
│  │              Zustand Store + WebSocket            │ │
│  └─────────────────────┬───────────────────────────┘ │
└────────────────────────┼────────────────────────────┘
                         │ WebSocket + REST
┌────────────────────────┼────────────────────────────┐
│                   Express Server                      │
│  ┌─────────────────────┴───────────────────────────┐ │
│  │              Data Collection Layer                │ │
│  │  sessions.json │ JSONL logs │ cron │ processes   │ │
│  └─────────────────────┬───────────────────────────┘ │
│                         │                             │
│  ┌─────────────────────┴───────────────────────────┐ │
│  │              OpenClaw Gateway                     │ │
│  │  ~/.openclaw/agents/ │ ~/.openclaw/cron/         │ │
│  └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite 6, TailwindCSS 3 |
| Visualization | D3.js 7 (force-directed graph) |
| State | Zustand 5 |
| Backend | Express 4, WebSocket (ws) |
| Real-time | chokidar (file watching) + WS push |
| Deployment | Docker, Node.js 24 |

---

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `PORT` | 3000 | Server port |
| `OPENCLAW_HOME` | ~/.openclaw | OpenClaw data directory |

---

## Development

```bash
# Run only server
npm run server

# Run only client
npm run client

# Full stack dev
npm run dev

# Build for production
npm run build
```

---

## Version Evolution

| Version | Highlights |
|---------|-----------|
| **V4.1** | OIDC SSO (Google), API rate limiting, cluster auto-discovery, Grafana JSON export, session-level audit export |
| **V4.0** | RBAC permission matrix, immutable audit trail, multi-cluster monitoring, Prometheus/Grafana integration, SSO/JWT auth |
| **V3.0** | Multi-user system, intervention policy engine, session replay, A/B test comparison |
| **V2.0** | Project dependency graph, timeline/Gantt, activity heatmap, milestone tracker, task flow pipeline, smart alerts |
| **V1.1** | Session search & filter, cron management, performance metrics dashboard, session export |
| **V1.0** | Agent topology graph, session monitoring, intervention console, WebSocket real-time updates, gateway log viewer, system metrics |

**Planned:** SAML SSO, webhook alerting (Slack/PagerDuty), policy chaining, replay bookmarks, PDF export.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## License

[MIT](LICENSE)
