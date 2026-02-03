# Live View Architecture

## Overview
The Live View provides real-time visibility into what the agent is doing. Users see the browser, the steps being executed, and can take over control at any time.

---

## Frame Production

### Screenshot Streaming
The automation engine captures frames continuously during execution:

```typescript
interface FrameConfig {
  fps: number;           // Target frames per second (default: 2)
  quality: number;       // JPEG quality 0-100 (default: 70)
  maxWidth: number;      // Resize if larger (default: 1280)
  onlyOnChange: boolean; // Skip identical frames (default: true)
}

class LiveViewService {
  private frameInterval: NodeJS.Timer | null = null;
  
  async startStreaming(config: FrameConfig): Promise<void> {
    this.frameInterval = setInterval(async () => {
      const frame = await this.captureFrame();
      
      if (config.onlyOnChange && this.isIdentical(frame)) {
        return; // Skip duplicate
      }
      
      this.emit('BROWSER_FRAME', {
        frameData: frame.toBase64(),
        url: this.browser.url(),
        title: this.browser.title(),
        timestamp: Date.now()
      });
    }, 1000 / config.fps);
  }
  
  stopStreaming(): void {
    if (this.frameInterval) {
      clearInterval(this.frameInterval);
      this.frameInterval = null;
    }
  }
}
```

### Frame Optimization
1. **Delta compression**: Only send changed regions
2. **Quality adaptation**: Reduce quality under load
3. **Skip on idle**: No frames when nothing is happening
4. **Batch metadata**: URL/title changes sent separately

---

## View Modes

### 1. Live Stream Mode (Default)
- Continuous frame updates at 2 FPS
- Low latency (~200ms)
- Shows real browser state

### 2. Step Snapshot Mode
- Single frame per step completion
- Lower bandwidth
- Good for reviewing runs

### 3. Video Recording Mode
- Full 30 FPS capture to disk
- For audit/replay purposes
- Requires explicit opt-in

---

## User Takeover

### What It Means
User takeover transfers control from the agent to the user. The user can:
- Navigate manually
- Log in to services
- Fix issues the agent can't handle
- Then return control to the agent

### Takeover Flow
```
Agent Running ──► Takeover Requested ──► User In Control ──► Control Returned
     │                    │                     │                    │
     ▼                    ▼                     ▼                    ▼
  Executing          Pause + Save         Direct Input         Resume Run
   Steps               State             to Browser
```

### Implementation
```typescript
class TakeoverManager {
  private userInControl = false;
  
  async requestTakeover(reason: string): Promise<void> {
    // 1. Pause execution
    await this.orchestrator.pause();
    
    // 2. Emit event
    this.emit('USER_TAKEOVER_ON', { reason });
    
    // 3. Enable direct input
    this.browser.enableUserInput();
    this.userInControl = true;
    
    // 4. Show UI prompt
    this.ui.showTakeoverBanner(reason);
  }
  
  async returnControl(): Promise<void> {
    // 1. Disable direct input
    this.browser.disableUserInput();
    this.userInControl = false;
    
    // 2. Emit event
    this.emit('USER_TAKEOVER_OFF');
    
    // 3. Capture current state
    const state = await this.browser.captureState();
    
    // 4. Update orchestrator with new state
    await this.orchestrator.updateState(state);
    
    // 5. Resume (if there was a pending run)
    if (this.orchestrator.hasPendingTasks()) {
      await this.orchestrator.resume();
    }
  }
}
```

### Takeover Triggers
| Trigger | Automatic? | User Action |
|---------|------------|-------------|
| Login required | Yes | Agent detects login page |
| CAPTCHA detected | Yes | Agent can't solve |
| Agent confused | Yes | Too many retries |
| User clicks "Take Over" | No | Manual button |
| Hotkey (Ctrl+Shift+T) | No | Keyboard shortcut |

### State Preservation
During takeover:
- Task queue is preserved
- Current step is marked "paused"
- Browser state is tracked
- On return, agent picks up from current page state

---

## Browser Integration

### Electron BrowserView
```typescript
class BrowserController {
  private view: BrowserView;
  private page: Page; // Playwright
  
  async initialize(): Promise<void> {
    // Create BrowserView for embedding
    this.view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    
    // Attach Playwright for automation
    const browser = await chromium.connectOverCDP(this.getCDPEndpoint());
    this.page = browser.contexts()[0].pages()[0];
  }
  
  // Embed in main window
  attachToWindow(mainWindow: BrowserWindow, bounds: Rectangle): void {
    mainWindow.addBrowserView(this.view);
    this.view.setBounds(bounds);
  }
  
  // Automation methods
  async navigate(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'networkidle' });
  }
  
  async click(selector: string): Promise<void> {
    await this.page.click(selector);
  }
  
  async type(selector: string, text: string): Promise<void> {
    await this.page.fill(selector, text);
  }
  
  // Screenshot capture
  async captureFrame(): Promise<Buffer> {
    return this.page.screenshot({ type: 'jpeg', quality: 70 });
  }
}
```

### Input Modes
```typescript
enum InputMode {
  AGENT_ONLY,    // Agent controls, user watches
  USER_ONLY,     // User controls, agent watches
  SHARED         // Both can input (careful!)
}

class InputController {
  private mode: InputMode = InputMode.AGENT_ONLY;
  
  setMode(mode: InputMode): void {
    this.mode = mode;
    
    switch (mode) {
      case InputMode.AGENT_ONLY:
        this.view.webContents.setIgnoreMenuShortcuts(true);
        this.blockUserInput();
        break;
      case InputMode.USER_ONLY:
        this.view.webContents.setIgnoreMenuShortcuts(false);
        this.allowUserInput();
        break;
      case InputMode.SHARED:
        // Use with caution
        this.allowUserInput();
        break;
    }
  }
}
```

---

## OS Permissions

### macOS
| Permission | Required For | How to Request |
|------------|--------------|----------------|
| Screen Recording | Live view streaming | System Preferences prompt |
| Accessibility | Desktop Assist Mode | System Preferences prompt |
| Automation | App control | First-run prompt |

```typescript
// macOS permission check
import { systemPreferences } from 'electron';

async function checkPermissions(): Promise<PermissionStatus> {
  const screenRecording = systemPreferences.getMediaAccessStatus('screen');
  const accessibility = systemPreferences.isTrustedAccessibilityClient(false);
  
  return {
    screenRecording: screenRecording === 'granted',
    accessibility,
    canProceed: screenRecording === 'granted' // Minimum for live view
  };
}
```

### Windows
| Permission | Required For | How to Request |
|------------|--------------|----------------|
| None for browser view | Basic live view | N/A |
| UI Automation | Desktop Assist Mode | Admin elevation |

### Linux
| Permission | Required For | How to Request |
|------------|--------------|----------------|
| X11/Wayland access | Live view | Depends on display server |
| AT-SPI | Desktop Assist Mode | Package install |

---

## UI Components

### Live Control Pane Layout
```
┌─────────────────────────────────────────────────────────────┐
│  🔴 Recording    https://linkedin.com/in/john-doe    ⟳ 2fps │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    [Browser Viewport]                       │
│                                                             │
│                     (Live frames here)                      │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Step 3/7: Clicking "Message" button                        │
│  ████████████░░░░░░░░  42%                                  │
├─────────────────────────────────────────────────────────────┤
│  ⏸ Pause  │  ⏹ Stop  │  🖱 Take Over  │  ✅ Approve Send   │
└─────────────────────────────────────────────────────────────┘
```

### Step Timeline
```typescript
interface StepDisplay {
  id: string;
  action: string;
  target: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  screenshot?: string;
}

// Example timeline
const steps: StepDisplay[] = [
  { id: '1', action: 'navigate', target: 'linkedin.com/in/john', status: 'completed' },
  { id: '2', action: 'wait', target: 'page load', status: 'completed' },
  { id: '3', action: 'click', target: 'Message button', status: 'running' },
  { id: '4', action: 'type', target: 'message input', status: 'pending' },
  { id: '5', action: 'approve', target: 'send message', status: 'pending' },
  { id: '6', action: 'click', target: 'Send button', status: 'pending' },
  { id: '7', action: 'extract', target: 'confirmation', status: 'pending' }
];
```

### Inspector Panel
```typescript
interface InspectorData {
  // Extracted lead info
  lead: {
    name: string;
    title: string;
    company: string;
    location: string;
    profileUrl: string;
  };
  
  // Draft message
  draft: {
    content: string;
    personalization: string[];
    estimatedResponseRate: number;
  };
  
  // Policy status
  policy: {
    dailyCapUsed: number;
    dailyCapMax: number;
    inQuietHours: boolean;
    riskFlags: string[];
  };
}
```

---

## Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Frame latency | < 200ms | Time from capture to display |
| Takeover latency | < 100ms | Time from click to control |
| Memory per frame | < 500KB | After compression |
| CPU during streaming | < 10% | On M1 Mac |
| Frame drop rate | < 5% | Under normal load |

---

## Security Considerations

### Frame Data
- Frames may contain sensitive info (passwords, messages)
- Never log frame data to disk unless recording enabled
- Clear frame buffer on app minimize/hide

### Session Isolation
- Each browser profile is isolated
- Cookies don't leak between profiles
- Profiles stored in encrypted container

### Input Injection
- Only agent OR user has input control (never both by default)
- All injected inputs are logged
- Rate limiting prevents spam
