/**
 * E2E Test Setup
 * Test harness for Electron app with Playwright
 */

import { _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { EventBus, resetEventBus } from '../src/runtime/event-bus';
import { resetComplianceManager } from '../src/runtime/compliance';
import { RuntimeEvent, EventType } from '../src/types/events';

// ============================================================================
// Types
// ============================================================================

export interface TestContext {
  app: ElectronApplication;
  page: Page;
  eventBus: EventBus;
  capturedEvents: RuntimeEvent[];
  cleanup: () => Promise<void>;
}

export interface MockBrowserState {
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

export interface LaunchOptions {
  mockBrowser?: boolean;
  env?: Record<string, string>;
  args?: string[];
}

// ============================================================================
// Event Capture Utilities
// ============================================================================

export class EventCapture {
  private events: RuntimeEvent[] = [];
  private eventBus: EventBus;
  private unsubscribe: (() => void) | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  start(): void {
    const subscription = this.eventBus.onAny((event) => {
      this.events.push(event);
    });
    this.unsubscribe = subscription.unsubscribe;
  }

  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  getEvents(): RuntimeEvent[] {
    return [...this.events];
  }

  getEventsByType<T extends RuntimeEvent>(type: T['type']): T[] {
    return this.events.filter((e) => e.type === type) as T[];
  }

  getEventsByRunId(runId: string): RuntimeEvent[] {
    return this.events.filter((e) => e.runId === runId);
  }

  hasEvent(type: EventType): boolean {
    return this.events.some((e) => e.type === type);
  }

  getLastEvent(): RuntimeEvent | undefined {
    return this.events[this.events.length - 1];
  }

  getLastEventOfType<T extends RuntimeEvent>(type: T['type']): T | undefined {
    const filtered = this.getEventsByType<T>(type);
    return filtered[filtered.length - 1];
  }

  clear(): void {
    this.events = [];
  }

  waitForEvent<T extends RuntimeEvent>(
    type: T['type'],
    timeoutMs = 5000,
    filter?: (event: T) => boolean
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check existing events first
      const existing = this.getEventsByType<T>(type);
      const match = filter ? existing.find(filter) : existing[0];
      if (match) {
        resolve(match);
        return;
      }

      // Wait for new event
      const timeoutId = setTimeout(() => {
        subscription.unsubscribe();
        reject(new Error(`Timeout waiting for event: ${type}`));
      }, timeoutMs);

      const subscription = this.eventBus.on(type, (event: T) => {
        if (!filter || filter(event)) {
          clearTimeout(timeoutId);
          subscription.unsubscribe();
          resolve(event);
        }
      });
    });
  }

  waitForEventSequence(
    types: EventType[],
    timeoutMs = 10000
  ): Promise<RuntimeEvent[]> {
    return new Promise((resolve, reject) => {
      const results: RuntimeEvent[] = [];
      let currentIndex = 0;

      const timeoutId = setTimeout(() => {
        subscription.unsubscribe();
        reject(
          new Error(
            `Timeout waiting for event sequence. Got ${results.length}/${types.length}: ${results.map((e) => e.type).join(' -> ')}`
          )
        );
      }, timeoutMs);

      const subscription = this.eventBus.onAny((event) => {
        if (event.type === types[currentIndex]) {
          results.push(event);
          currentIndex++;

          if (currentIndex === types.length) {
            clearTimeout(timeoutId);
            subscription.unsubscribe();
            resolve(results);
          }
        }
      });
    });
  }
}

// ============================================================================
// Mock Browser Controller
// ============================================================================

export class MockBrowserController {
  private state: MockBrowserState = {
    url: 'about:blank',
    title: '',
    isLoading: false,
    canGoBack: false,
    canGoForward: false,
  };
  private navigationHistory: string[] = [];
  private historyIndex = -1;
  private stateChangeCallbacks: Array<(state: MockBrowserState) => void> = [];
  private simulatedDelay = 100; // ms

  // Control mock behavior
  shouldFailNavigation = false;
  shouldDetectLoginWall = false;
  loginWallUrl = 'https://example.com/login';
  navigationDelayMs = 100;

  getState(): MockBrowserState {
    return { ...this.state };
  }

  onStateChange(callback: (state: MockBrowserState) => void): () => void {
    this.stateChangeCallbacks.push(callback);
    return () => {
      const index = this.stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        this.stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  private notifyStateChange(): void {
    for (const callback of this.stateChangeCallbacks) {
      callback(this.getState());
    }
  }

  async navigate(url: string): Promise<{ success: boolean; error?: string }> {
    if (this.shouldFailNavigation) {
      return { success: false, error: 'Navigation failed (simulated)' };
    }

    this.state.isLoading = true;
    this.notifyStateChange();

    await this.delay(this.navigationDelayMs);

    // Simulate login wall detection
    if (this.shouldDetectLoginWall && url !== this.loginWallUrl) {
      this.state.url = this.loginWallUrl;
      this.state.title = 'Login Required';
      this.state.isLoading = false;
      this.updateHistory(this.loginWallUrl);
      this.notifyStateChange();
      return { success: true };
    }

    this.state.url = url;
    this.state.title = this.getTitleFromUrl(url);
    this.state.isLoading = false;
    this.updateHistory(url);
    this.notifyStateChange();

    return { success: true };
  }

  async click(selector: string): Promise<{ success: boolean; error?: string }> {
    await this.delay(this.simulatedDelay);
    return { success: true };
  }

  async type(selector: string, text: string): Promise<{ success: boolean; error?: string }> {
    await this.delay(text.length * 10); // 10ms per character
    return { success: true };
  }

  async back(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.canGoBack) {
      return { success: false, error: 'Cannot go back' };
    }

    this.historyIndex--;
    this.state.url = this.navigationHistory[this.historyIndex];
    this.state.title = this.getTitleFromUrl(this.state.url);
    this.state.canGoBack = this.historyIndex > 0;
    this.state.canGoForward = true;
    this.notifyStateChange();

    return { success: true };
  }

  async forward(): Promise<{ success: boolean; error?: string }> {
    if (!this.state.canGoForward) {
      return { success: false, error: 'Cannot go forward' };
    }

    this.historyIndex++;
    this.state.url = this.navigationHistory[this.historyIndex];
    this.state.title = this.getTitleFromUrl(this.state.url);
    this.state.canGoBack = true;
    this.state.canGoForward = this.historyIndex < this.navigationHistory.length - 1;
    this.notifyStateChange();

    return { success: true };
  }

  async screenshot(): Promise<{ success: boolean; data?: string; error?: string }> {
    await this.delay(50);
    // Return a minimal valid PNG base64
    const minimalPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    return { success: true, data: minimalPng };
  }

  halt(): void {
    this.state.isLoading = false;
    this.notifyStateChange();
  }

  reset(): void {
    this.state = {
      url: 'about:blank',
      title: '',
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
    };
    this.navigationHistory = [];
    this.historyIndex = -1;
    this.shouldFailNavigation = false;
    this.shouldDetectLoginWall = false;
    this.notifyStateChange();
  }

  private updateHistory(url: string): void {
    // Truncate forward history if navigating from middle
    if (this.historyIndex < this.navigationHistory.length - 1) {
      this.navigationHistory = this.navigationHistory.slice(0, this.historyIndex + 1);
    }
    this.navigationHistory.push(url);
    this.historyIndex = this.navigationHistory.length - 1;
    this.state.canGoBack = this.historyIndex > 0;
    this.state.canGoForward = false;
  }

  private getTitleFromUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.charAt(0).toUpperCase() + hostname.slice(1);
    } catch {
      return url;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// App Launch & Teardown
// ============================================================================

let electronApp: ElectronApplication | null = null;

export async function launchApp(options: LaunchOptions = {}): Promise<TestContext> {
  // Reset singletons
  resetEventBus();
  resetComplianceManager();

  // Launch Electron app
  const app = await electron.launch({
    args: ['.', ...(options.args ?? [])],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      E2E_TEST: 'true',
      MOCK_BROWSER: options.mockBrowser ? 'true' : 'false',
      ...options.env,
    },
  });

  electronApp = app;

  // Get the first window
  const page = await app.firstWindow();

  // Wait for app to be ready
  await page.waitForLoadState('domcontentloaded');

  // Create event capture
  const eventBus = new EventBus();
  const capturedEvents: RuntimeEvent[] = [];
  eventBus.onAny((event) => capturedEvents.push(event));

  const cleanup = async () => {
    if (electronApp) {
      await electronApp.close();
      electronApp = null;
    }
    resetEventBus();
    resetComplianceManager();
  };

  return {
    app,
    page,
    eventBus,
    capturedEvents,
    cleanup,
  };
}

export async function closeApp(): Promise<void> {
  if (electronApp) {
    await electronApp.close();
    electronApp = null;
  }
}

// ============================================================================
// State Persistence Helpers
// ============================================================================

export interface PersistedState {
  runId: string;
  state: 'RUNNING' | 'PAUSED' | 'STOPPED';
  currentStepIndex: number;
  stepHistory: Array<{
    status: string;
    error?: string;
  }>;
  timestamp: number;
}

export async function getPersistedState(page: Page): Promise<PersistedState | null> {
  return page.evaluate(() => {
    const stored = localStorage.getItem('capy:run-state');
    return stored ? JSON.parse(stored) : null;
  });
}

export async function setPersistedState(page: Page, state: PersistedState): Promise<void> {
  await page.evaluate((s) => {
    localStorage.setItem('capy:run-state', JSON.stringify(s));
  }, state);
}

export async function clearPersistedState(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('capy:run-state');
  });
}

// ============================================================================
// IPC Helpers for Tests
// ============================================================================

export async function emitIPCEvent(
  app: ElectronApplication,
  channel: string,
  ...args: unknown[]
): Promise<void> {
  await app.evaluate(
    ({ channel, args }) => {
      const { BrowserWindow } = require('electron');
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.webContents.send(channel, ...args);
      }
    },
    { channel, args }
  );
}

export async function invokeIPCHandler(
  app: ElectronApplication,
  channel: string,
  ...args: unknown[]
): Promise<unknown> {
  return app.evaluate(
    async ({ channel, args }) => {
      const { ipcMain } = require('electron');
      // Note: This is a simplified approach - in real tests you'd mock handlers
      return new Promise((resolve) => {
        ipcMain.handleOnce(channel, async () => resolve(true));
      });
    },
    { channel, args }
  );
}

// ============================================================================
// Global Test Setup/Teardown
// ============================================================================

export function setupGlobalHooks(): void {
  // This can be imported in playwright.config.ts for global setup
  process.on('exit', async () => {
    await closeApp();
  });
}
