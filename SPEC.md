# CapyDesktopApp — Product Specification

## Overview
A native Electron desktop app for AI-powered lead outreach automation. Integrates with OpenClaw/ClawDBot for browser control, enabling automated LinkedIn/Twitter messaging while showing real-time execution in-app.

## Core Features

### 1. In-App Live Browser View
- Real-time viewport of the controlled browser session
- User watches the agent navigate, click, type
- Split view: Chat + Live Control

### 2. Agent Control Plane
- Open tabs/sites inside the app
- Navigate, click, type, scroll
- Extract structured info from pages
- Integrates with capyfr for lead discovery

### 3. Chat + Execution Concurrency
- Chat remains responsive during automation
- Can issue new instructions mid-run
- Stop/Pause/Resume is instant
- Two parallel streams: conversation + execution

### 4. Execution Modes
- **Visible Mode** (default): Everything in controlled webview
- **Assist Mode** (optional): External app interaction

### 5. Safety & Compliance
- Human confirmation for send/post/connect actions
- Throttling and rate limits
- Audit logs for all actions
- Schedule windows

---

## UX Layout

### Left Sidebar
- Chat
- Runs (live + history)
- Campaigns
- Browser
- Leads
- Inbox
- Templates
- Logs
- Settings

### Main Workspace (Two Panes)
- **Chat Pane**: Always responsive, can interrupt/instruct
- **Live Control Pane**: Browser viewport + step list + controls

### View Modes
- Chat-only
- Split view (default)
- Control-only

---

## Live Control Pane Components

### Viewport
- Real-time browser view (webview or stream)
- Current URL, page title

### Step List
- "What I'm doing" finite steps
- Progress indicator
- Time elapsed

### Controls
- ⏸️ Pause after step
- ⏹️ Stop now (hard stop)
- 🖱️ Take over (user control)
- ✅ Approve (for gated actions)

### Inspector Panel
- Extracted data (name, company, role, email)
- Draft message preview
- Policy status (caps, windows, risks)

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron 28+ |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS |
| State | Zustand |
| Auth | Supabase Auth |
| Backend | Supabase (shared with capyfr) |
| Browser Control | Electron BrowserView / OpenClaw integration |
| Build | Vite + electron-builder |

---

## Integration Points

### CapyFR
- Lead discovery API (SSE streaming)
- Shared Supabase instance
- ICP/product context

### OpenClaw/ClawDBot
- Browser automation commands
- Action execution (click, type, scroll)
- Screenshot/viewport streaming
- Chat interface

---

## Directory Structure

```
capydesktopapp/
├── electron/
│   ├── main.ts           # Electron main process
│   ├── preload.ts        # Preload script for IPC
│   └── browser-control.ts # Browser automation logic
├── src/
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar/
│   │   ├── Chat/
│   │   ├── LiveControl/
│   │   ├── Campaigns/
│   │   ├── Leads/
│   │   └── Settings/
│   ├── stores/           # Zustand stores
│   ├── hooks/
│   ├── lib/
│   │   ├── supabase.ts
│   │   ├── openclaw.ts
│   │   └── api.ts
│   └── styles/
├── package.json
├── vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
└── tsconfig.json
```

---

## Phase 1 Deliverables
1. ✅ Electron app shell with auth
2. ✅ Sidebar navigation
3. ✅ Chat interface (connected to backend)
4. ✅ Live browser view (BrowserView)
5. ✅ Basic automation controls (start/stop/pause)

## Phase 2 Deliverables
1. Lead discovery integration (capyfr API)
2. Campaign management
3. Message templates
4. LinkedIn automation flow
5. Twitter automation flow

## Phase 3 Deliverables
1. OpenClaw deep integration
2. Step-by-step visibility
3. Human-in-the-loop approvals
4. Audit logging
5. Polish & packaging

---

# Architecture Deep Dive

## Control Model

### Controlled Browser Mode (Default)
- Agent controls a Playwright-controlled Chromium embedded in app
- Most reliable, least permissions, deterministic
- Ship this first

### Desktop Assist Mode (Optional, High-Risk)
- OS-level permissions required
- "Agent has control" indicator
- Deadman switch (Esc x3)
- Default: observe + suggest, not auto-act

---

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      ELECTRON MAIN                               │
│  - Window management                                             │
│  - Secure storage (keychain)                                     │
│  - Permission prompts                                            │
│  - Launches runtimes                                             │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌────────────────┐    ┌────────────────┐
│  RENDERER     │    │ COPILOT        │    │ AUTOMATION     │
│  (React UI)   │◄──►│ RUNTIME        │◄──►│ ENGINE         │
│               │    │ (Node/TS)      │    │ (Playwright)   │
│ - Chat UI     │    │                │    │                │
│ - Live Control│    │ - Orchestrator │    │ - Browser ctrl │
│ - Run timeline│    │ - Sub-agents   │    │ - Screenshots  │
│ - Logs        │    │ - Compliance   │    │ - Actions      │
└───────────────┘    └────────────────┘    └────────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
                    ┌────────────────┐
                    │   EVENT BUS    │
                    │ (IPC/WebSocket)│
                    └────────────────┘
```

---

## Key Components

### A) Orchestrator
- Owns run lifecycle: start/pause/stop/resume
- Delegates to sub-agents
- Maintains run state machine
- **Guarantees stoppability**

### B) Executor
Executes atomic actions:
- `navigate(url)`
- `click(selector)`
- `type(selector, text)`
- `extract(schema)`
- `screenshot()`

Enforces:
- Timeouts
- Retries
- Fallback selector strategies
- Emits events for every step

### C) Live View Service
- Produces realtime view of execution
- Sends frames + metadata
- Supports "user takeover"

### D) Compliance / Safety Gatekeeper
- Approvals required for risky actions (send/post/connect)
- Rate limits + time windows
- "Do not contact" list
- Message linting (prevents spam patterns)

### E) Data Layer (Local-First)
- SQLite for local data
- Encrypted secrets in OS keychain
- Append-only audit log

---

## Realtime Event Contract

### Event Types
```typescript
type EventType =
  | 'RUN_STARTED' | 'RUN_FINISHED' | 'RUN_FAILED'
  | 'STEP_STARTED' | 'STEP_COMPLETED' | 'STEP_FAILED'
  | 'BROWSER_FRAME'
  | 'ACTION' // click/type/scroll with target metadata
  | 'EXTRACTION_RESULT'
  | 'NEEDS_APPROVAL' // blocks until approved
  | 'USER_TAKEOVER_ON' | 'USER_TAKEOVER_OFF'
  | 'STOP_REQUESTED' | 'STOP_ACKNOWLEDGED' | 'STOPPED';
```

### UI Rendering Rules
- Chat pane: renders conversation tokens **immediately**
- Live pane: renders events **immediately**
- Timeline derived from events (never "best guess")
- **Chat NEVER blocks on executor**

---

## Dual-Loop Model

### Planner Loop (Chat/Brain)
- Decides what to do next
- Responds to user questions immediately
- Can interrupt/modify execution

### Executor Loop (Actions)
- Executes steps, reports events
- Communicates via task queue + shared run state

### Interruption Handling
User can type at any time:
- "stop" / "pause"
- "switch to lead X"
- "don't send, just draft"
- "rewrite the message"

Orchestrator must:
1. Cancel queued actions
2. Stop current action safely (or after atomic step)
3. Persist state
4. Continue with new plan

### Concurrent Behavior
- **Foreground answer**: respond to questions immediately
- **Background narration**: execution events in run timeline
