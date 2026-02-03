# Copilot Runtime Architecture

## Overview
The Copilot Runtime is the brain of CapyDesktopApp. It orchestrates all automation, manages state, and ensures chat never blocks on execution.

---

## Dual-Loop Model

### Loop 1: Planner (Chat/Brain)
- Receives user messages
- Decides what to do next
- Responds to questions **immediately** (never waits for executor)
- Can interrupt/modify/cancel ongoing execution
- Maintains conversation context separate from execution state

### Loop 2: Executor (Actions)
- Executes atomic steps from the task queue
- Reports events for every action
- Handles retries, timeouts, fallbacks
- Can be paused/stopped at any atomic boundary

### Communication
```
┌──────────────┐     Task Queue      ┌──────────────┐
│   PLANNER    │ ─────────────────► │   EXECUTOR   │
│   (Chat)     │                     │   (Actions)  │
│              │ ◄───────────────── │              │
└──────────────┘   Observations      └──────────────┘
                   (Events)
```

**Shared State:**
- `runState`: IDLE | RUNNING | PAUSED | STOPPED | FAILED
- `taskQueue`: Array of pending tasks
- `currentStep`: Active step being executed
- `observations`: Results from completed steps

---

## Event Contract

### Event Types
```typescript
interface BaseEvent {
  id: string;
  timestamp: number;
  runId: string;
}

// Lifecycle Events
interface RunStartedEvent extends BaseEvent {
  type: 'RUN_STARTED';
  task: string;
  config: RunConfig;
}

interface RunFinishedEvent extends BaseEvent {
  type: 'RUN_FINISHED';
  summary: RunSummary;
}

interface RunFailedEvent extends BaseEvent {
  type: 'RUN_FAILED';
  error: string;
  recoverable: boolean;
}

// Step Events
interface StepStartedEvent extends BaseEvent {
  type: 'STEP_STARTED';
  stepId: string;
  action: ActionType;
  target?: string;
}

interface StepCompletedEvent extends BaseEvent {
  type: 'STEP_COMPLETED';
  stepId: string;
  result: any;
  durationMs: number;
}

interface StepFailedEvent extends BaseEvent {
  type: 'STEP_FAILED';
  stepId: string;
  error: string;
  willRetry: boolean;
}

// Browser Events
interface BrowserFrameEvent extends BaseEvent {
  type: 'BROWSER_FRAME';
  frameData: string; // base64 or URL
  url: string;
  title: string;
}

interface ActionEvent extends BaseEvent {
  type: 'ACTION';
  action: 'click' | 'type' | 'scroll' | 'navigate';
  target: string;
  value?: string;
  coordinates?: { x: number; y: number };
}

interface ExtractionResultEvent extends BaseEvent {
  type: 'EXTRACTION_RESULT';
  schema: string;
  data: Record<string, any>;
  confidence: number;
}

// Control Events
interface NeedsApprovalEvent extends BaseEvent {
  type: 'NEEDS_APPROVAL';
  action: 'send_message' | 'send_connection' | 'post';
  preview: {
    target: string;
    content: string;
  };
  timeout?: number;
}

interface UserTakeoverEvent extends BaseEvent {
  type: 'USER_TAKEOVER_ON' | 'USER_TAKEOVER_OFF';
  reason?: string;
}

interface StopEvent extends BaseEvent {
  type: 'STOP_REQUESTED' | 'STOP_ACKNOWLEDGED' | 'STOPPED';
  source: 'user' | 'system' | 'error';
}
```

### Event Flow Rules
1. **Every action emits STEP_STARTED before execution**
2. **Every action emits STEP_COMPLETED or STEP_FAILED after**
3. **BROWSER_FRAME events stream continuously during execution**
4. **NEEDS_APPROVAL blocks the executor until resolved**
5. **STOP_REQUESTED must be acknowledged within 100ms**

---

## Stoppability Rules

### Guarantees
1. **Stop latency < 500ms** from request to STOPPED event
2. **No action executes after STOP_ACKNOWLEDGED**
3. **State is always consistent after stop**
4. **Resumable if stop was clean (not error)**

### Implementation
```typescript
class Orchestrator {
  private abortController: AbortController;
  
  async stop(): Promise<void> {
    // 1. Signal abort
    this.abortController.abort();
    this.emit('STOP_REQUESTED', { source: 'user' });
    
    // 2. Wait for executor to acknowledge (max 100ms)
    await this.executor.acknowledgeStop();
    this.emit('STOP_ACKNOWLEDGED');
    
    // 3. Clear queue
    this.taskQueue = [];
    
    // 4. Persist state
    await this.persistState();
    
    // 5. Final event
    this.emit('STOPPED', { source: 'user' });
  }
}
```

### Atomic Boundaries
Actions are interruptible at these points:
- Before navigation starts
- After page load, before next action
- After extraction, before next step
- **Never mid-type or mid-click**

---

## Task Queue Management

### Queue Structure
```typescript
interface Task {
  id: string;
  type: 'navigate' | 'click' | 'type' | 'extract' | 'wait' | 'approve';
  params: Record<string, any>;
  priority: number;
  retries: number;
  maxRetries: number;
  timeout: number;
}

interface TaskQueue {
  pending: Task[];
  current: Task | null;
  completed: Task[];
  failed: Task[];
}
```

### Queue Operations
- `enqueue(task)`: Add to pending
- `dequeue()`: Get next task (respects priority)
- `cancel(taskId)`: Remove from pending
- `clear()`: Remove all pending
- `retry(taskId)`: Re-add failed task

---

## Interruption Handling

### User Commands
| Command | Action |
|---------|--------|
| "stop" | Immediate stop, clear queue |
| "pause" | Stop after current step, preserve queue |
| "resume" | Continue from pause |
| "skip" | Skip current step, continue |
| "switch to X" | Clear queue, start new task |

### Implementation
```typescript
class Planner {
  async handleMessage(message: string): Promise<string> {
    // Interrupt detection runs FIRST, before any other processing
    const interrupt = this.detectInterrupt(message);
    
    if (interrupt) {
      await this.orchestrator.handleInterrupt(interrupt);
      return this.generateInterruptResponse(interrupt);
    }
    
    // Normal message handling (runs in parallel with executor)
    return this.chat.respond(message);
  }
  
  detectInterrupt(message: string): Interrupt | null {
    const lower = message.toLowerCase();
    if (lower.includes('stop')) return { type: 'STOP' };
    if (lower.includes('pause')) return { type: 'PAUSE' };
    if (lower.includes('resume')) return { type: 'RESUME' };
    if (lower.includes('skip')) return { type: 'SKIP' };
    // ... pattern matching for other interrupts
    return null;
  }
}
```

---

## Concurrency Model

### Parallel Execution
```
User Message ──► Planner ──► Response (immediate)
                    │
                    ▼
              Task Queue ──► Executor ──► Events ──► UI
```

- Planner and Executor run in separate async contexts
- Planner never awaits Executor (except for interrupts)
- Events stream to UI independently

### Thread Safety
- Task queue operations are atomic (mutex)
- State updates use immutable patterns
- Event emission is fire-and-forget

---

## Error Recovery

### Recoverable Errors
- Network timeout → retry with backoff
- Element not found → try fallback selectors
- Rate limit → pause and schedule resume

### Non-Recoverable Errors
- Login required → request takeover
- Account suspended → stop and alert
- Crash → persist state, mark "needs review"

### Recovery Flow
```typescript
async function executeWithRecovery(task: Task): Promise<Result> {
  for (let attempt = 0; attempt <= task.maxRetries; attempt++) {
    try {
      return await this.execute(task);
    } catch (error) {
      if (!isRecoverable(error)) throw error;
      if (attempt === task.maxRetries) throw error;
      
      await this.emit('STEP_FAILED', { 
        willRetry: true, 
        attempt, 
        error: error.message 
      });
      
      await delay(backoff(attempt));
    }
  }
}
```

---

## State Persistence

### What's Persisted
- Run state (for crash recovery)
- Task queue (for resume)
- Completed steps (for audit)
- Browser session (cookies, local storage)

### Storage
- SQLite for structured data
- Electron-store for preferences
- OS keychain for secrets

### Recovery on Restart
1. Check for incomplete runs
2. Show "Resume or Discard?" prompt
3. If resume: restore state, continue from last checkpoint
4. If discard: mark run as cancelled, clean up
