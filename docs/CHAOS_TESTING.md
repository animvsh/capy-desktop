# Chaos Testing - Browser Automation

This document describes the chaos scenarios tested and the fixes implemented to ensure flawless operation of the desktop browser automation system.

## Chaos Scenarios Tested

### 1. Start automation, close browser window mid-operation ✅
**Issue Found:** Active runs would leave stale state, causing subsequent runs to fail.
**Fix:** 
- Added `page.on('close')` event handler to detect when pages close unexpectedly
- Implemented automatic `failRun()` for any active run using that page
- Proper cleanup of page references from Maps

### 2. Start automation, kill Electron process ✅
**Issue Found:** No graceful shutdown handling.
**Fix:**
- Added `process.on('uncaughtException')` handler in main process
- Added `isQuitting` flag to track app quit state
- `unregisterPlaywrightIpcHandlers()` now calls `shutdown()` for cleanup
- Added `browser.on('disconnected')` handler to detect browser crashes

### 3. Start 3 automations simultaneously ✅
**Issue Found:** Single `currentRun` and `approvalResolver` variables caused race conditions.
**Fix:**
- Changed from single variables to Maps:
  - `activeRuns: Map<string, AutomationRun>` - keyed by runId
  - `approvalResolvers: Map<string, Function>` - keyed by runId
  - `approvalTimeouts: Map<string, NodeJS.Timeout>` - keyed by runId
- Added `profileLocks: Map<string, boolean>` to prevent concurrent operations on same profile
- Frontend shows "Profile is busy" error if trying to start while another is running

### 4. Start automation, rapidly click Stop/Pause ✅
**Issue Found:** Multiple stop calls could cause state corruption.
**Fix:**
- `stopRun()` now accepts optional `runId` parameter
- Proper cleanup of approval resolvers and timeouts on stop
- `isRunActive()` check before each automation step
- Immediate state reset on stop

### 5. Start automation, switch tabs rapidly ✅
**Issue Found:** Page references could become stale.
**Fix:**
- `getPage()` now validates page isn't closed before returning
- Added `page.isClosed()` checks throughout
- Streaming intervals check page validity before capturing frames

### 6. Send command with network disconnected ✅
**Issue Found:** Promises would hang indefinitely.
**Fix:**
- All Playwright operations have explicit timeouts (e.g., `timeout: 20000`)
- IPC handlers catch all errors and return `{ success: false, error: ... }`
- Frontend shows appropriate error messages

### 7. Start automation, minimize window, wait, restore ✅
**Issue Found:** Streaming would continue uselessly.
**Fix:**
- Streaming intervals check `mainWindow.isDestroyed()` before emitting
- Streaming stops automatically if window is gone
- Frame capture has timeout and error handling

### 8. Memory pressure: open 20 tabs, then run automation ✅
**Issue Found:** No concerns found - Playwright handles this well.
**Note:** The design uses one Page per profile, not per tab.

### 9. Timeout simulation: approval wait timeout ✅
**Issue Found:** Old approval resolver pattern could leak memory.
**Fix:**
- `waitForApproval()` now properly clears timeout when resolved
- Approval timeout tracked in `approvalTimeouts` Map
- Frontend shows countdown timer for approval
- Auto-reject on timeout (5 minutes)

### 10. Invalid state transitions: call approve when nothing pending ✅
**Issue Found:** Would silently fail.
**Fix:**
- `playwright:approve-action` returns `{ success: false, error: 'No pending approval for this run' }`
- Frontend checks for pending approval before showing buttons

## Additional Edge Cases Handled

### Profile Management
- Profile creation validates directory creation
- `getOrCreateProfile()` is idempotent
- Profile busy state exposed via `isProfileBusy()` IPC handler

### Event Emission Safety
- `emitEvent()` triple-checks window validity:
  1. `mainWindow` is not null
  2. `mainWindow.isDestroyed()` is false
  3. `mainWindow.webContents.isDestroyed()` is false
- All event emission wrapped in try/catch

### Frontend Safety
- All hooks track `isMountedRef` to prevent state updates after unmount
- `eventCleanupRef` ensures event listeners are removed
- Error states can be cleared via `clearError()`

### Shutdown Safety
- `isShuttingDown` flag prevents new operations during shutdown
- All contexts and pages saved and closed gracefully
- Browser closed last

## New IPC Handlers Added

- `playwright:get-active-runs` - Returns all active automation runs
- `playwright:is-profile-busy` - Check if a profile has an active operation
- `playwright:stop-run` - Now accepts optional `runId` to stop specific run

## Component Changes

### LiveView.tsx
- Added approval timeout countdown display
- Shows specific run errors
- Dismissible error messages
- Status badges for all run states (running, paused, stopped, failed)

### useBrowserAutomation.ts
- Added `activeRuns` and `isProfileBusy` state
- Added `checkProfileBusy()` and `refreshActiveRuns()` methods
- `stopRun()` accepts optional `runId`
- Added `clearError()` utility

### electron/main.ts
- Added `isQuitting` flag for macOS hide/show behavior
- Added crash and unresponsive handlers
- Added uncaught exception and unhandled rejection handlers

## Testing Recommendations

1. **Manual Testing:**
   - Start an automation, close the Playwright browser window
   - Start an automation, force quit the app
   - Try to start two automations on the same profile
   - Rapidly click Stop during an automation
   - Wait for approval timeout (or set shorter timeout for testing)

2. **Automated Testing:**
   - Unit tests for `isRunActive()`, `acquireProfileLock()`, etc.
   - Integration tests with mocked IPC handlers
   - E2E tests with Playwright testing the Playwright automation (meta!)

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                          │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │  LiveView.tsx   │  │useBrowserAuto..│                    │
│  │                 │←─│                 │                    │
│  │ - Frame display │  │ - State mgmt   │                    │
│  │ - Approval UI   │  │ - Commands     │                    │
│  │ - Progress      │  │ - Events       │                    │
│  └────────┬────────┘  └────────┬───────┘                    │
│           │                    │                             │
│           └────────┬───────────┘                             │
│                    │ IPC (contextBridge)                     │
└────────────────────┼────────────────────────────────────────┘
                     │
┌────────────────────┼────────────────────────────────────────┐
│                    ▼        Main Process                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              playwright-ipc.ts                       │    │
│  │                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │    │
│  │  │ activeRuns   │  │ approvalRes- │  │ profile-  │  │    │
│  │  │ Map<id, run> │  │ olvers Map   │  │ Locks Map │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────┘  │    │
│  │                                                      │    │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │    │
│  │  │ contexts Map │  │  pages Map   │  │ streaming │  │    │
│  │  │ (per profile)│  │ (per profile)│  │ intervals │  │    │
│  │  └──────────────┘  └──────────────┘  └───────────┘  │    │
│  └──────────────────────────┬──────────────────────────┘    │
│                             │                                │
└─────────────────────────────┼────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │  Playwright     │
                    │  Browser        │
                    │  (Chromium)     │
                    └─────────────────┘
```

## Conclusion

All chaos scenarios have been addressed with defensive programming patterns:
- State stored in Maps instead of single variables
- Locks prevent concurrent operations on same resource
- Graceful degradation when components fail
- Proper cleanup in all code paths
- Timeouts on all async operations
- Mount state tracking in React components
