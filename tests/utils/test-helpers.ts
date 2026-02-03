/**
 * Test Helper Utilities
 * Common utilities for E2E testing
 */

import { Page, expect, Locator } from '@playwright/test';
import { ElectronApplication } from '@playwright/test';
import { RuntimeEvent, EventType, AutomationStatus } from '../../src/types/events';
import { EventCapture, MockBrowserController, TestContext } from '../setup';

// ============================================================================
// Wait Utilities
// ============================================================================

/**
 * Wait for a specific event to be emitted
 */
export async function waitForEvent<T extends RuntimeEvent>(
  capture: EventCapture,
  eventType: T['type'],
  options: {
    timeoutMs?: number;
    filter?: (event: T) => boolean;
  } = {}
): Promise<T> {
  const { timeoutMs = 5000, filter } = options;
  return capture.waitForEvent(eventType, timeoutMs, filter);
}

/**
 * Wait for an element to appear and be visible
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options: { timeout?: number; state?: 'visible' | 'attached' | 'hidden' } = {}
): Promise<Locator> {
  const { timeout = 5000, state = 'visible' } = options;
  const locator = page.locator(selector);
  await locator.waitFor({ state, timeout });
  return locator;
}

/**
 * Wait for text to appear on the page
 */
export async function waitForText(
  page: Page,
  text: string,
  options: { timeout?: number; exact?: boolean } = {}
): Promise<Locator> {
  const { timeout = 5000, exact = false } = options;
  const locator = exact
    ? page.getByText(text, { exact: true })
    : page.getByText(text);
  await locator.waitFor({ state: 'visible', timeout });
  return locator;
}

/**
 * Wait for automation status to change
 */
export async function waitForAutomationStatus(
  page: Page,
  expectedStatus: AutomationStatus,
  timeoutMs = 5000
): Promise<void> {
  await page.waitForFunction(
    (status) => {
      const statusElement = document.querySelector('[data-testid="automation-status"]');
      return statusElement?.textContent?.toLowerCase().includes(status.toLowerCase());
    },
    expectedStatus,
    { timeout: timeoutMs }
  );
}

/**
 * Wait for a condition with polling
 */
export async function waitForCondition(
  condition: () => Promise<boolean> | boolean,
  options: { timeoutMs?: number; intervalMs?: number; message?: string } = {}
): Promise<void> {
  const { timeoutMs = 5000, intervalMs = 100, message = 'Condition not met' } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (await condition()) {
      return;
    }
    await delay(intervalMs);
  }

  throw new Error(`Timeout: ${message}`);
}

/**
 * Simple delay utility
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// User Action Simulators
// ============================================================================

/**
 * Simulate clicking the start button
 */
export async function clickStart(page: Page): Promise<void> {
  const startButton = page.locator('[data-testid="start-button"], button:has-text("Start")');
  await startButton.click();
}

/**
 * Simulate clicking the stop button
 */
export async function clickStop(page: Page): Promise<void> {
  const stopButton = page.locator('[data-testid="stop-button"], button:has-text("Stop")');
  await stopButton.click();
}

/**
 * Simulate clicking the pause button
 */
export async function clickPause(page: Page): Promise<void> {
  const pauseButton = page.locator('[data-testid="pause-button"], button:has-text("Pause")');
  await pauseButton.click();
}

/**
 * Simulate clicking the resume button
 */
export async function clickResume(page: Page): Promise<void> {
  const resumeButton = page.locator('[data-testid="resume-button"], button:has-text("Resume")');
  await resumeButton.click();
}

/**
 * Simulate clicking the approve button
 */
export async function clickApprove(page: Page): Promise<void> {
  const approveButton = page.locator('[data-testid="approve-button"], button:has-text("Approve")');
  await approveButton.click();
}

/**
 * Simulate clicking the deny button
 */
export async function clickDeny(page: Page): Promise<void> {
  const denyButton = page.locator('[data-testid="deny-button"], button:has-text("Deny")');
  await denyButton.click();
}

/**
 * Simulate clicking the takeover button
 */
export async function clickTakeover(page: Page): Promise<void> {
  const takeoverButton = page.locator('[data-testid="takeover-button"], button:has-text("Take Over")');
  await takeoverButton.click();
}

/**
 * Simulate clicking the return control button
 */
export async function clickReturnControl(page: Page): Promise<void> {
  const returnButton = page.locator('[data-testid="return-control-button"], button:has-text("Return Control")');
  await returnButton.click();
}

/**
 * Type a message in the chat input
 */
export async function typeInChat(page: Page, message: string): Promise<void> {
  const chatInput = page.locator('[data-testid="chat-input"], input[placeholder*="message"], textarea[placeholder*="message"]');
  await chatInput.fill(message);
}

/**
 * Send a chat message
 */
export async function sendChatMessage(page: Page, message: string): Promise<void> {
  await typeInChat(page, message);
  const sendButton = page.locator('[data-testid="send-button"], button:has-text("Send")');
  await sendButton.click();
}

/**
 * Submit a task/automation request
 */
export async function submitTask(page: Page, taskDescription: string): Promise<void> {
  const taskInput = page.locator('[data-testid="task-input"], input[placeholder*="task"], textarea[placeholder*="task"]');
  await taskInput.fill(taskDescription);
  const submitButton = page.locator('[data-testid="submit-task"], button:has-text("Run"), button:has-text("Execute")');
  await submitButton.click();
}

// ============================================================================
// State Assertions
// ============================================================================

/**
 * Assert that the UI shows a specific status
 */
export async function assertStatus(page: Page, expectedStatus: string): Promise<void> {
  const statusElement = page.locator('[data-testid="automation-status"]');
  await expect(statusElement).toContainText(expectedStatus, { ignoreCase: true });
}

/**
 * Assert that a specific event was emitted
 */
export function assertEventEmitted(
  events: RuntimeEvent[],
  eventType: EventType,
  filter?: (event: RuntimeEvent) => boolean
): void {
  const matchingEvents = events.filter((e) => e.type === eventType);
  if (filter) {
    const filtered = matchingEvents.filter(filter);
    expect(filtered.length).toBeGreaterThan(0);
  } else {
    expect(matchingEvents.length).toBeGreaterThan(0);
  }
}

/**
 * Assert that events occurred in a specific order
 */
export function assertEventOrder(
  events: RuntimeEvent[],
  expectedOrder: EventType[]
): void {
  const eventTypes = events.map((e) => e.type);
  let lastIndex = -1;

  for (const expectedType of expectedOrder) {
    const currentIndex = eventTypes.indexOf(expectedType, lastIndex + 1);
    expect(currentIndex).toBeGreaterThan(lastIndex);
    lastIndex = currentIndex;
  }
}

/**
 * Assert that a specific number of events were emitted
 */
export function assertEventCount(
  events: RuntimeEvent[],
  eventType: EventType,
  expectedCount: number
): void {
  const count = events.filter((e) => e.type === eventType).length;
  expect(count).toBe(expectedCount);
}

/**
 * Assert that chat is responsive (can send and receive messages)
 */
export async function assertChatResponsive(
  page: Page,
  testMessage = 'Test message'
): Promise<void> {
  const initialMessageCount = await page.locator('[data-testid="chat-message"]').count();

  await sendChatMessage(page, testMessage);

  // Wait for response (new message appears)
  await page.waitForFunction(
    (count) => {
      const messages = document.querySelectorAll('[data-testid="chat-message"]');
      return messages.length > count;
    },
    initialMessageCount,
    { timeout: 10000 }
  );

  const newMessageCount = await page.locator('[data-testid="chat-message"]').count();
  expect(newMessageCount).toBeGreaterThan(initialMessageCount);
}

/**
 * Assert the run queue is empty
 */
export async function assertQueueEmpty(page: Page): Promise<void> {
  const queueCount = page.locator('[data-testid="queue-count"]');
  await expect(queueCount).toHaveText('0');
}

/**
 * Assert an approval dialog is visible
 */
export async function assertApprovalDialogVisible(page: Page): Promise<void> {
  const dialog = page.locator('[data-testid="approval-dialog"], [role="dialog"]:has-text("Approve")');
  await expect(dialog).toBeVisible();
}

/**
 * Assert a draft preview is shown
 */
export async function assertDraftPreviewVisible(page: Page): Promise<void> {
  const preview = page.locator('[data-testid="draft-preview"], [data-testid="message-preview"]');
  await expect(preview).toBeVisible();
}

// ============================================================================
// Zustand Store Helpers
// ============================================================================

/**
 * Get browser store state from the page
 */
export async function getBrowserStoreState(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    // Access Zustand store via window if exposed for testing
    return (window as any).__BROWSER_STORE_STATE__;
  });
}

/**
 * Get automation status from the store
 */
export async function getAutomationStatus(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    return (window as any).__BROWSER_STORE_STATE__?.automationStatus ?? null;
  });
}

/**
 * Get step history from the store
 */
export async function getStepHistory(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    return (window as any).__BROWSER_STORE_STATE__?.stepHistory ?? [];
  });
}

// ============================================================================
// Navigation & Task Helpers
// ============================================================================

/**
 * Start a navigation task to a specific URL
 */
export async function startNavigationTask(page: Page, url: string): Promise<void> {
  await submitTask(page, `Navigate to ${url}`);
}

/**
 * Start a send message task
 */
export async function startSendMessageTask(
  page: Page,
  recipient: string,
  message: string
): Promise<void> {
  await submitTask(page, `Send message to ${recipient}: ${message}`);
}

/**
 * Create automation steps for testing
 */
export function createTestSteps(count: number): Array<{ type: string; params: Record<string, unknown>; description: string }> {
  return Array.from({ length: count }, (_, i) => ({
    type: 'wait' as const,
    params: { ms: 100 },
    description: `Test step ${i + 1}`,
  }));
}

// ============================================================================
// Crash Simulation
// ============================================================================

/**
 * Simulate app crash
 */
export async function simulateCrash(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => {
    process.crash();
  });
}

/**
 * Simulate browser crash
 */
export async function simulateBrowserCrash(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Dispatch crash event
    window.dispatchEvent(new CustomEvent('browser-crash', { detail: { reason: 'simulated' } }));
  });
}

/**
 * Simulate network disconnect
 */
export async function simulateNetworkDisconnect(page: Page): Promise<void> {
  await page.context().setOffline(true);
}

/**
 * Restore network connection
 */
export async function restoreNetwork(page: Page): Promise<void> {
  await page.context().setOffline(false);
}

// ============================================================================
// Test Data Generators
// ============================================================================

/**
 * Generate a unique run ID for testing
 */
export function generateTestRunId(): string {
  return `test-run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Generate a test approval request
 */
export function generateTestApprovalRequest(runId: string): {
  id: string;
  action: { kind: string; message: string; recipient: string };
  reason: string;
} {
  return {
    id: `apr-${Date.now()}`,
    action: {
      kind: 'send_message',
      message: 'Test message',
      recipient: 'test@example.com',
    },
    reason: 'Sending a message requires your approval',
  };
}

// ============================================================================
// Debug Utilities
// ============================================================================

/**
 * Log all captured events (for debugging)
 */
export function logEvents(events: RuntimeEvent[]): void {
  console.log('=== Captured Events ===');
  events.forEach((e, i) => {
    console.log(`${i + 1}. [${e.timestamp}] ${e.type} (run: ${e.runId})`);
  });
  console.log('=======================');
}

/**
 * Take a screenshot for debugging
 */
export async function debugScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-screenshots/${name}-${Date.now()}.png` });
}

/**
 * Log page state for debugging
 */
export async function logPageState(page: Page): Promise<void> {
  const html = await page.content();
  console.log('=== Page State ===');
  console.log('URL:', page.url());
  console.log('HTML length:', html.length);
  console.log('==================');
}
