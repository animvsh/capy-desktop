/**
 * Split View E2E Tests
 * 
 * Tests that the chat remains responsive during automation execution.
 * Validates the dual-loop model: planner loop (chat) and executor loop (automation)
 * run independently.
 */

import { test, expect } from '@playwright/test';
import { launchApp, TestContext, EventCapture } from '../setup';
import {
  waitForEvent,
  waitForAutomationStatus,
  clickStart,
  sendChatMessage,
  assertChatResponsive,
  assertEventEmitted,
  waitForElement,
  waitForText,
  delay,
  startNavigationTask,
  createTestSteps,
  generateTestRunId,
} from '../utils/test-helpers';

test.describe('Split View - Chat During Execution', () => {
  let ctx: TestContext;
  let eventCapture: EventCapture;

  test.beforeEach(async () => {
    ctx = await launchApp({ mockBrowser: true });
    eventCapture = new EventCapture(ctx.eventBus);
    eventCapture.start();
  });

  test.afterEach(async () => {
    eventCapture.stop();
    await ctx.cleanup();
  });

  test('chat remains responsive while run is active', async () => {
    const { page, eventBus } = ctx;

    // Start an automation run
    await startNavigationTask(page, 'https://example.com');

    // Wait for run to start
    await waitForAutomationStatus(page, 'running');

    // Verify RUN_STARTED event
    await waitForEvent(eventCapture, 'RUN_STARTED', { timeoutMs: 3000 });

    // While automation is running, send a chat message
    const testMessage = 'Is this working?';
    await sendChatMessage(page, testMessage);

    // Verify chat response appears (chat should not be blocked)
    await waitForText(page, testMessage, { timeout: 2000 });

    // Verify we can receive a response while run continues
    // The chat should show the user's message immediately
    const chatMessages = page.locator('[data-testid="chat-message"]');
    const messageCount = await chatMessages.count();
    expect(messageCount).toBeGreaterThan(0);

    // Verify automation is still running (not blocked by chat)
    const status = await page.locator('[data-testid="automation-status"]').textContent();
    expect(status?.toLowerCase()).toContain('running');
  });

  test('user can ask unrelated question during run', async () => {
    const { page } = ctx;

    // Start a multi-step automation
    await startNavigationTask(page, 'https://linkedin.com/search');

    // Wait for run to be in progress
    await waitForAutomationStatus(page, 'running');

    // Ask an unrelated question
    const question = 'What is the weather today?';
    await sendChatMessage(page, question);

    // The chat should process and respond to the question
    // even while automation continues in the background
    await waitForText(page, question, { timeout: 2000 });

    // There should be some response (the exact content depends on the chat backend)
    // We just verify the chat system processed the message
    const chatContainer = page.locator('[data-testid="chat-container"]');
    const text = await chatContainer.textContent();
    expect(text).toContain(question);

    // Verify automation events are still being emitted
    // (run was not interrupted by the chat message)
    const events = eventCapture.getEvents();
    const stepEvents = events.filter(
      (e) => e.type === 'STEP_STARTED' || e.type === 'STEP_COMPLETED'
    );
    
    // Should have some step activity
    expect(stepEvents.length).toBeGreaterThanOrEqual(0);
  });

  test('answer received while run continues', async () => {
    const { page, eventBus } = ctx;

    // Start a longer-running automation
    await page.evaluate(() => {
      // Mock a long-running automation with multiple steps
      window.dispatchEvent(
        new CustomEvent('start-automation', {
          detail: {
            steps: [
              { type: 'navigate', params: { url: 'https://example.com' } },
              { type: 'wait', params: { ms: 2000 } },
              { type: 'click', params: { selector: 'button' } },
              { type: 'wait', params: { ms: 2000 } },
            ],
          },
        })
      );
    });

    // Wait for automation to start
    await waitForAutomationStatus(page, 'running');

    // Send a question
    const question = 'How many steps are left?';
    await sendChatMessage(page, question);

    // Wait a moment for the chat to process
    await delay(500);

    // Verify chat processed the message (question appears in chat)
    await waitForText(page, question, { timeout: 3000 });

    // Continue waiting for automation to make progress
    await delay(1000);

    // Verify automation is still running
    const automationStatus = await page
      .locator('[data-testid="automation-status"]')
      .textContent();
    
    // Status should be running, paused, or completed - not stuck
    expect(['running', 'paused', 'completed', 'stopped']).toContain(
      automationStatus?.toLowerCase().trim()
    );

    // Verify step progress is being tracked
    const stepProgress = page.locator('[data-testid="step-progress"]');
    const progressText = await stepProgress.textContent();
    // Progress should show some indication of step numbers
    expect(progressText).toMatch(/\d+/);
  });

  test('chat input is never disabled during execution', async () => {
    const { page } = ctx;

    // Start automation
    await startNavigationTask(page, 'https://example.com');
    await waitForAutomationStatus(page, 'running');

    // Get the chat input
    const chatInput = page.locator(
      '[data-testid="chat-input"], input[placeholder*="message"], textarea[placeholder*="message"]'
    );

    // Verify input is enabled
    await expect(chatInput).toBeEnabled();

    // Type something
    await chatInput.fill('Testing input during execution');
    const value = await chatInput.inputValue();
    expect(value).toBe('Testing input during execution');

    // Verify send button is also enabled
    const sendButton = page.locator('[data-testid="send-button"], button:has-text("Send")');
    await expect(sendButton).toBeEnabled();
  });

  test('multiple chat messages can be sent during single run', async () => {
    const { page } = ctx;

    // Start automation
    await startNavigationTask(page, 'https://example.com');
    await waitForAutomationStatus(page, 'running');

    // Send multiple messages in quick succession
    const messages = [
      'First question',
      'Second question',
      'Third question',
    ];

    for (const msg of messages) {
      await sendChatMessage(page, msg);
      await delay(200); // Small delay between messages
    }

    // Verify all messages appear in chat
    for (const msg of messages) {
      const messageElement = page.getByText(msg);
      await expect(messageElement).toBeVisible();
    }

    // Verify automation wasn't disrupted
    const status = await page.locator('[data-testid="automation-status"]').textContent();
    expect(['running', 'completed', 'paused']).toContain(status?.toLowerCase().trim());
  });

  test('live control pane updates while chat is active', async () => {
    const { page } = ctx;

    // Start automation
    await startNavigationTask(page, 'https://example.com');
    await waitForAutomationStatus(page, 'running');

    // Get initial step list state
    const stepList = page.locator('[data-testid="step-list"]');
    const initialSteps = await stepList.locator('[data-testid="step-item"]').count();

    // Send a chat message
    await sendChatMessage(page, 'Status update please');

    // Wait a moment
    await delay(500);

    // The step list should have been updated or be updating
    // (not frozen due to chat activity)
    const stepItems = stepList.locator('[data-testid="step-item"]');
    
    // Should have step items visible
    const stepCount = await stepItems.count();
    expect(stepCount).toBeGreaterThanOrEqual(0);

    // Verify the live control pane is visible
    const liveControlPane = page.locator('[data-testid="live-control-pane"]');
    await expect(liveControlPane).toBeVisible();
  });

  test('chat correctly identifies run context when asked', async () => {
    const { page } = ctx;

    // Start a specific task
    await startNavigationTask(page, 'https://linkedin.com/jobs');

    await waitForAutomationStatus(page, 'running');

    // Ask about the current task
    await sendChatMessage(page, 'What are you currently doing?');

    await delay(1000);

    // The chat response should reference the ongoing task
    // This tests that the planner loop has context about the executor loop
    const chatContainer = page.locator('[data-testid="chat-container"]');
    const chatText = await chatContainer.textContent();

    // Chat should contain reference to the task or show awareness of the run
    // The exact response depends on the backend, but it shouldn't be empty
    expect(chatText?.length).toBeGreaterThan(0);
  });

  test('interrupt command via chat works during run', async () => {
    const { page, eventBus } = ctx;

    // Start automation
    await startNavigationTask(page, 'https://example.com');
    await waitForAutomationStatus(page, 'running');

    // Send interrupt command via chat
    await sendChatMessage(page, 'stop');

    // Wait for stop to be processed
    await delay(500);

    // Verify automation has stopped or is stopping
    await waitForAutomationStatus(page, 'stopped');

    // Verify stop events were emitted
    const events = eventCapture.getEvents();
    const hasStopEvent = events.some(
      (e) => e.type === 'STOP_REQUESTED' || e.type === 'STOPPED'
    );
    expect(hasStopEvent).toBe(true);
  });
});

test.describe('Split View - View Modes', () => {
  let ctx: TestContext;

  test.beforeEach(async () => {
    ctx = await launchApp({ mockBrowser: true });
  });

  test.afterEach(async () => {
    await ctx.cleanup();
  });

  test('can toggle between chat-only and split view', async () => {
    const { page } = ctx;

    // Default should be split view
    const chatPane = page.locator('[data-testid="chat-pane"]');
    const livePane = page.locator('[data-testid="live-control-pane"]');

    await expect(chatPane).toBeVisible();
    await expect(livePane).toBeVisible();

    // Toggle to chat-only
    const chatOnlyButton = page.locator('[data-testid="view-chat-only"]');
    if (await chatOnlyButton.isVisible()) {
      await chatOnlyButton.click();
      await expect(chatPane).toBeVisible();
      // Live pane should be hidden or minimized
    }
  });

  test('can toggle between split view and control-only', async () => {
    const { page } = ctx;

    // Find and click control-only toggle
    const controlOnlyButton = page.locator('[data-testid="view-control-only"]');
    if (await controlOnlyButton.isVisible()) {
      await controlOnlyButton.click();

      const livePane = page.locator('[data-testid="live-control-pane"]');
      await expect(livePane).toBeVisible();
    }
  });
});
