# Browser Automation for CapyDesktopApp

## Overview

This document describes the browser automation system integrated into CapyDesktopApp, enabling LinkedIn and Twitter automation with live view streaming.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React Frontend                           │
│  ┌───────────────────┐  ┌───────────────────┐                  │
│  │ useBrowserAutomation │  │ useChatAssistant  │                │
│  │                   │◄─┤                   │                   │
│  │ - Natural language│  │ - Command detect  │                   │
│  │ - Execute commands│  │ - Local processing│                   │
│  │ - Live frame state│  │ - Panel navigation│                   │
│  └─────────┬─────────┘  └───────────────────┘                   │
│            │                                                     │
│  ┌─────────▼─────────┐  ┌───────────────────┐                   │
│  │ BrowserLiveView   │  │ LinkedInPanel     │                   │
│  │ - Frame display   │  │ TwitterPanel      │                   │
│  │ - Step progress   │  │ - Platform-specific│                  │
│  │ - Approval dialog │  │ - Login management│                   │
│  └───────────────────┘  └───────────────────┘                   │
└──────────────────────────────┬──────────────────────────────────┘
                               │ IPC (contextBridge)
┌──────────────────────────────▼──────────────────────────────────┐
│                       Electron Main                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   playwright-ipc.ts                        │  │
│  │                                                            │  │
│  │  - Profile management (per-platform persistent state)      │  │
│  │  - Live view streaming (2fps JPEG to renderer)            │  │
│  │  - LinkedIn automation (connect, message)                  │  │
│  │  - Twitter automation (follow, DM)                        │  │
│  │  - Human-in-the-loop approval system                      │  │
│  │  - Step-by-step run management                            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                               │                                  │
│                      ┌────────▼────────┐                        │
│                      │  playwright-core │                       │
│                      │   (Chromium)     │                       │
│                      └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

## Files Modified/Created

### Backend (Electron)

| File | Status | Description |
|------|--------|-------------|
| `electron-extras/playwright-ipc.ts` | **Enhanced** | Full implementation with profile management, streaming, LinkedIn/Twitter automation |
| `electron/preload.ts` | **Enhanced** | Exposed `window.playwright` API with all automation methods |
| `electron/main.ts` | Unchanged | Already registers IPC handlers |

### Frontend (React)

| File | Status | Description |
|------|--------|-------------|
| `src/hooks/useBrowserAutomation.ts` | **Enhanced** | Added `isLoggedIn` state, `selectProfile`, `openLoginPage` methods |
| `src/hooks/useChatAssistant.ts` | **Enhanced** | Wired browser commands to automation, added `processBrowserCommand` |
| `src/hooks/useChatBrowserIntegration.ts` | **New** | Helper hook for chat-browser integration |
| `src/components/browser/BrowserLiveView.tsx` | Unchanged | Already complete |
| `src/components/browser/LiveView.tsx` | Unchanged | Already complete |
| `src/components/panels/LinkedInPanel.tsx` | Unchanged | Already complete |
| `src/components/panels/TwitterPanel.tsx` | Unchanged | Already complete |

## Features

### 1. Natural Language Command Detection

Users can type commands in the chat interface:

```
"Connect with John on LinkedIn"       → LinkedIn connection request
"Message John on LinkedIn saying Hi"  → LinkedIn message
"Follow @elonmusk"                    → Twitter follow
"DM @elonmusk saying Hello"           → Twitter DM
"Go to linkedin.com/in/johndoe"       → Navigate to URL
```

### 2. Live View Streaming

- Real-time JPEG frame capture at 2 fps
- Shows URL bar with current page
- Displays browser title
- Green indicator for active streaming

### 3. LinkedIn Automation

| Action | Description |
|--------|-------------|
| `checkLinkedInLogin` | Verify user is logged in |
| `linkedInConnect` | Send connection request with optional note |
| `linkedInMessage` | Send message to a connection |

**Steps for Connection Request:**
1. Navigate to profile
2. Extract profile info (name, headline)
3. Click Connect button
4. Add note (optional)
5. **Wait for approval** ← Human-in-the-loop
6. Send request

### 4. Twitter Automation

| Action | Description |
|--------|-------------|
| `checkTwitterLogin` | Verify user is logged in |
| `twitterFollow` | Follow a user |
| `twitterDM` | Send direct message |

**Steps for Follow:**
1. Navigate to profile
2. Click Follow button (with approval)

### 5. Human-in-the-Loop Approval

All sensitive actions require user approval:

```typescript
interface ApprovalRequest {
  runId: string;
  action: 'SEND_CONNECTION' | 'SEND_MESSAGE' | 'FOLLOW_USER' | 'SEND_DM';
  preview: {
    target: string;  // Who we're interacting with
    content: string; // What we're sending
  };
}
```

The UI shows an overlay with:
- Action type
- Target (person/username)
- Content preview (message text)
- Approve / Reject buttons

### 6. Profile Management

Persistent browser profiles per platform:
- Cookies/auth stored in `~/Library/Application Support/capydesktopapp/browser-profiles/<profile-id>/`
- State persisted across sessions
- Login status tracked

## Usage Examples

### From Chat Interface

```
User: "Connect with Sarah Miller on LinkedIn"

Capy: 🔗 Starting LinkedIn connection request to Sarah Miller. 
      You'll see the live view and can approve before sending.

[Browser panel opens with live view]
[Steps progress: Navigate → Extract → Click Connect → Add Note → [APPROVAL NEEDED]]
[User clicks "Approve & Send"]

Capy: ✅ Connection request sent to Sarah Miller!
```

### From LinkedIn Panel UI

1. Enter LinkedIn profile URL
2. (Optional) Add connection note
3. Click "Send Connection Request"
4. Watch live view
5. Approve when prompted

### Programmatic Usage

```typescript
import { useBrowserAutomation } from '@/hooks/useBrowserAutomation';

function MyComponent() {
  const { 
    initialize,
    linkedInConnect,
    currentRun,
    pendingApproval,
    approveAction,
    liveFrame,
  } = useBrowserAutomation();

  const handleConnect = async () => {
    await initialize();
    await linkedInConnect(
      'https://www.linkedin.com/in/sarah-miller',
      'Hi Sarah, I saw your talk at TechConf...'
    );
  };

  return (
    <div>
      {liveFrame && <img src={liveFrame} alt="Browser" />}
      {pendingApproval && (
        <button onClick={approveAction}>Approve</button>
      )}
    </div>
  );
}
```

## IPC Channels

| Channel | Direction | Description |
|---------|-----------|-------------|
| `playwright:initialize` | R→M | Start browser |
| `playwright:shutdown` | R→M | Close browser |
| `playwright:get-profiles` | R→M | List profiles |
| `playwright:get-or-create-profile` | R→M | Get or create platform profile |
| `playwright:start-streaming` | R→M | Begin live view |
| `playwright:stop-streaming` | R→M | Stop live view |
| `playwright:linkedin-check-login` | R→M | Check LinkedIn auth |
| `playwright:linkedin-connect` | R→M | Start connection flow |
| `playwright:linkedin-message` | R→M | Start message flow |
| `playwright:twitter-check-login` | R→M | Check Twitter auth |
| `playwright:twitter-follow` | R→M | Start follow flow |
| `playwright:twitter-dm` | R→M | Start DM flow |
| `playwright:approve-action` | R→M | Approve pending action |
| `playwright:reject-action` | R→M | Reject pending action |
| `playwright:stop-run` | R→M | Stop current run |
| `automation:event` | M→R | Push events (frames, updates) |

## Event Types

```typescript
type AutomationEventType = 
  | 'BROWSER_FRAME'    // New frame available
  | 'RUN_UPDATE'       // Run status changed
  | 'NEEDS_APPROVAL'   // Action needs human approval
  | 'RUN_FINISHED'     // Run completed
  | 'STOP_ACKNOWLEDGED' // Stop confirmed
  | 'browser_error';   // Error occurred
```

## Testing

1. Build the Electron app: `npm run electron:build`
2. Launch the app
3. Go to LinkedIn panel
4. Click "Start" to initialize browser
5. Log in to LinkedIn manually
6. Click "Check Again" to verify login
7. Enter a profile URL and click "Send Connection Request"
8. Watch the live view and approve when prompted

## Notes

- Playwright-core requires a Chromium browser to be available
- LinkedIn may detect automation - use human-like delays (already implemented)
- Twitter may require phone verification for DMs
- Session cookies are preserved for persistent login
