/**
 * Executor - Atomic Action Executor
 * 
 * Executes individual browser automation actions:
 * - navigate, click, type, scroll, extract, screenshot, wait, hover, select
 * - Timeout handling with configurable retries
 * - Emits events for every step
 * - Supports AbortController for immediate cancellation
 */

import {
  Action,
  ActionKind,
  NavigateAction,
  ClickAction,
  TypeAction,
  ScrollAction,
  ExtractAction,
  ScreenshotAction,
  WaitAction,
  HoverAction,
  SelectAction,
  ExtractionResult,
  StepStatus,
} from '../types/events';
import { EventBus, getEventBus, createBaseEvent } from './event-bus';

// ============================================================================
// Types
// ============================================================================

export interface ExecutorConfig {
  defaultTimeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
  typeDelayMs: number; // Delay between keystrokes
  screenshotQuality: number;
}

export interface ExecutionContext {
  runId: string;
  stepIndex: number;
  abortSignal: AbortSignal;
}

export interface ExecutionResult {
  success: boolean;
  result?: unknown;
  error?: string;
  durationMs: number;
  retries: number;
}

export interface BrowserAdapter {
  navigate(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  type(selector: string, text: string, delay?: number): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number, selector?: string): Promise<void>;
  extract(fields: Array<{ name: string; selector: string; type: string; attribute?: string }>): Promise<Record<string, unknown>>;
  screenshot(options?: { fullPage?: boolean; selector?: string }): Promise<string>; // base64
  waitForSelector(selector: string, options?: { state?: string; timeout?: number }): Promise<void>;
  waitForTimeout(ms: number): Promise<void>;
  hover(selector: string): Promise<void>;
  select(selector: string, values: string | string[]): Promise<void>;
  getCurrentUrl(): Promise<string>;
  getTitle(): Promise<string>;
}

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  defaultTimeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
  typeDelayMs: 50,
  screenshotQuality: 80,
};

// ============================================================================
// Executor Implementation
// ============================================================================

export class Executor {
  private config: ExecutorConfig;
  private eventBus: EventBus;
  private browserAdapter: BrowserAdapter | null = null;

  constructor(config: Partial<ExecutorConfig> = {}, eventBus?: EventBus) {
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
    this.eventBus = eventBus ?? getEventBus();
  }

  // --------------------------------------------------------------------------
  // Browser Adapter
  // --------------------------------------------------------------------------

  setBrowserAdapter(adapter: BrowserAdapter): void {
    this.browserAdapter = adapter;
  }

  getBrowserAdapter(): BrowserAdapter | null {
    return this.browserAdapter;
  }

  // --------------------------------------------------------------------------
  // Main Execution
  // --------------------------------------------------------------------------

  /**
   * Execute a single action with retries and event emission
   */
  async execute(action: Action, context: ExecutionContext): Promise<ExecutionResult> {
    if (!this.browserAdapter) {
      return {
        success: false,
        error: 'Browser adapter not configured',
        durationMs: 0,
        retries: 0,
      };
    }

    const startTime = Date.now();
    let lastError: string | undefined;
    let retries = 0;

    // Emit step started
    this.emitStepStarted(action, context);

    while (retries <= this.config.maxRetries) {
      // Check for abort
      if (context.abortSignal.aborted) {
        const result: ExecutionResult = {
          success: false,
          error: 'Execution aborted',
          durationMs: Date.now() - startTime,
          retries,
        };
        this.emitStepFailed(action, context, result.error!, false);
        return result;
      }

      try {
        const result = await this.executeWithTimeout(action, context);
        const duration = Date.now() - startTime;

        // Emit step completed
        this.emitStepCompleted(action, context, duration, result);

        return {
          success: true,
          result,
          durationMs: duration,
          retries,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        retries++;

        if (retries <= this.config.maxRetries) {
          this.emitActionRetrying(action, context, retries, lastError);
          await this.delay(this.config.retryDelayMs);
        }
      }
    }

    // All retries exhausted
    const result: ExecutionResult = {
      success: false,
      error: lastError,
      durationMs: Date.now() - startTime,
      retries: retries - 1,
    };

    this.emitStepFailed(action, context, lastError ?? 'Unknown error', true);
    return result;
  }

  /**
   * Execute action with timeout
   */
  private async executeWithTimeout(action: Action, context: ExecutionContext): Promise<unknown> {
    const timeoutMs = this.getActionTimeout(action);

    return Promise.race([
      this.executeAction(action, context),
      this.createTimeoutPromise(timeoutMs),
      this.createAbortPromise(context.abortSignal),
    ]);
  }

  /**
   * Route action to appropriate handler
   */
  private async executeAction(action: Action, context: ExecutionContext): Promise<unknown> {
    switch (action.kind) {
      case 'navigate':
        return this.executeNavigate(action as NavigateAction, context);
      case 'click':
        return this.executeClick(action as ClickAction, context);
      case 'type':
        return this.executeType(action as TypeAction, context);
      case 'scroll':
        return this.executeScroll(action as ScrollAction, context);
      case 'extract':
        return this.executeExtract(action as ExtractAction, context);
      case 'screenshot':
        return this.executeScreenshot(action as ScreenshotAction, context);
      case 'wait':
        return this.executeWait(action as WaitAction, context);
      case 'hover':
        return this.executeHover(action as HoverAction, context);
      case 'select':
        return this.executeSelect(action as SelectAction, context);
      default:
        throw new Error(`Unknown action kind: ${action.kind}`);
    }
  }

  // --------------------------------------------------------------------------
  // Action Implementations
  // --------------------------------------------------------------------------

  private async executeNavigate(action: NavigateAction, context: ExecutionContext): Promise<void> {
    await this.browserAdapter!.navigate(action.url);
    
    // Emit navigation event
    const url = await this.browserAdapter!.getCurrentUrl();
    const title = await this.browserAdapter!.getTitle();
    
    this.eventBus.emit({
      ...createBaseEvent('BROWSER_NAVIGATION', context.runId),
      url,
      title,
    });
  }

  private async executeClick(action: ClickAction, context: ExecutionContext): Promise<void> {
    const selectors = [action.selector, ...(action.fallbackSelectors ?? [])];
    let lastError: Error | null = null;

    for (const selector of selectors) {
      try {
        await this.browserAdapter!.click(selector);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError ?? new Error('Click failed with no selectors');
  }

  private async executeType(action: TypeAction, context: ExecutionContext): Promise<void> {
    const delay = action.delay ?? this.config.typeDelayMs;
    await this.browserAdapter!.type(action.selector, action.text, delay);
  }

  private async executeScroll(action: ScrollAction, context: ExecutionContext): Promise<void> {
    await this.browserAdapter!.scroll(
      action.direction,
      action.amount,
      action.selector
    );
  }

  private async executeExtract(action: ExtractAction, context: ExecutionContext): Promise<ExtractionResult> {
    try {
      const fields = action.schema.fields.map(f => ({
        name: f.name,
        selector: f.selector,
        type: f.type,
        attribute: f.attribute,
      }));

      const data = await this.browserAdapter!.extract(fields);

      const result: ExtractionResult = {
        success: true,
        data,
      };

      // Emit extraction result
      this.eventBus.emit({
        ...createBaseEvent('EXTRACTION_RESULT', context.runId),
        result,
      });

      return result;
    } catch (error) {
      const result: ExtractionResult = {
        success: false,
        data: {},
        errors: [error instanceof Error ? error.message : String(error)],
      };

      this.eventBus.emit({
        ...createBaseEvent('EXTRACTION_RESULT', context.runId),
        result,
      });

      return result;
    }
  }

  private async executeScreenshot(action: ScreenshotAction, context: ExecutionContext): Promise<string> {
    const imageData = await this.browserAdapter!.screenshot({
      fullPage: action.fullPage,
      selector: action.selector,
    });

    // Emit screenshot captured
    this.eventBus.emit({
      ...createBaseEvent('SCREENSHOT_CAPTURED', context.runId),
      imageData,
      fullPage: action.fullPage ?? false,
    });

    return imageData;
  }

  private async executeWait(action: WaitAction, context: ExecutionContext): Promise<void> {
    if (action.selector) {
      await this.browserAdapter!.waitForSelector(action.selector, {
        state: action.condition,
        timeout: action.ms,
      });
    } else if (action.ms) {
      await this.browserAdapter!.waitForTimeout(action.ms);
    }
  }

  private async executeHover(action: HoverAction, context: ExecutionContext): Promise<void> {
    await this.browserAdapter!.hover(action.selector);
  }

  private async executeSelect(action: SelectAction, context: ExecutionContext): Promise<void> {
    await this.browserAdapter!.select(action.selector, action.value);
  }

  // --------------------------------------------------------------------------
  // Event Emission
  // --------------------------------------------------------------------------

  private emitStepStarted(action: Action, context: ExecutionContext): void {
    this.eventBus.emit({
      ...createBaseEvent('STEP_STARTED', context.runId),
      stepIndex: context.stepIndex,
      stepDescription: this.getActionDescription(action),
      action,
    });
  }

  private emitStepCompleted(
    action: Action,
    context: ExecutionContext,
    durationMs: number,
    result?: unknown
  ): void {
    this.eventBus.emit({
      ...createBaseEvent('STEP_COMPLETED', context.runId),
      stepIndex: context.stepIndex,
      durationMs,
      result,
    });
  }

  private emitStepFailed(
    action: Action,
    context: ExecutionContext,
    error: string,
    retryable: boolean
  ): void {
    this.eventBus.emit({
      ...createBaseEvent('STEP_FAILED', context.runId),
      stepIndex: context.stepIndex,
      error,
      retryable,
    });
  }

  private emitActionRetrying(
    action: Action,
    context: ExecutionContext,
    attempt: number,
    error: string
  ): void {
    this.eventBus.emit({
      ...createBaseEvent('ACTION_RETRYING', context.runId),
      stepIndex: context.stepIndex,
      attempt,
      error,
      action,
    } as any); // ACTION_RETRYING might need to be added to types
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getActionTimeout(action: Action): number {
    // Some actions may have custom timeouts
    if (action.kind === 'wait' && (action as WaitAction).ms) {
      return (action as WaitAction).ms! + 5000; // Add buffer
    }
    return action.metadata?.timeout as number ?? this.config.defaultTimeoutMs;
  }

  private getActionDescription(action: Action): string {
    switch (action.kind) {
      case 'navigate':
        return `Navigating to ${(action as NavigateAction).url}`;
      case 'click':
        return `Clicking on ${(action as ClickAction).selector}`;
      case 'type':
        return `Typing "${(action as TypeAction).text.substring(0, 50)}${(action as TypeAction).text.length > 50 ? '...' : ''}"`;
      case 'scroll':
        return `Scrolling ${(action as ScrollAction).direction}`;
      case 'extract':
        return `Extracting data from page`;
      case 'screenshot':
        return `Taking screenshot`;
      case 'wait':
        return (action as WaitAction).selector
          ? `Waiting for ${(action as WaitAction).selector}`
          : `Waiting ${(action as WaitAction).ms}ms`;
      case 'hover':
        return `Hovering over ${(action as HoverAction).selector}`;
      case 'select':
        return `Selecting ${(action as SelectAction).value} in ${(action as SelectAction).selector}`;
      case 'send_message':
        return `Sending message`;
      case 'connect':
        return `Sending connection request`;
      case 'post':
        return `Publishing post`;
      case 'follow':
        return `Following user`;
      default:
        return `Executing ${(action as Action).kind}`;
    }
  }

  private createTimeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Action timed out after ${ms}ms`)), ms);
    });
  }

  private createAbortPromise(signal: AbortSignal): Promise<never> {
    return new Promise((_, reject) => {
      if (signal.aborted) {
        reject(new Error('Execution aborted'));
      }
      signal.addEventListener('abort', () => {
        reject(new Error('Execution aborted'));
      });
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  updateConfig(config: Partial<ExecutorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ExecutorConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Mock Browser Adapter (for testing)
// ============================================================================

export class MockBrowserAdapter implements BrowserAdapter {
  private currentUrl = 'about:blank';
  private currentTitle = '';

  async navigate(url: string): Promise<void> {
    this.currentUrl = url;
    this.currentTitle = `Page: ${url}`;
    await this.simulateDelay();
  }

  async click(selector: string): Promise<void> {
    await this.simulateDelay();
  }

  async type(selector: string, text: string, delay?: number): Promise<void> {
    await this.simulateDelay(delay ? delay * text.length : undefined);
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount?: number, selector?: string): Promise<void> {
    await this.simulateDelay();
  }

  async extract(fields: Array<{ name: string; selector: string; type: string; attribute?: string }>): Promise<Record<string, unknown>> {
    await this.simulateDelay();
    const result: Record<string, unknown> = {};
    for (const field of fields) {
      result[field.name] = `Mock value for ${field.name}`;
    }
    return result;
  }

  async screenshot(options?: { fullPage?: boolean; selector?: string }): Promise<string> {
    await this.simulateDelay();
    return 'data:image/png;base64,mockScreenshotData';
  }

  async waitForSelector(selector: string, options?: { state?: string; timeout?: number }): Promise<void> {
    await this.simulateDelay();
  }

  async waitForTimeout(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async hover(selector: string): Promise<void> {
    await this.simulateDelay();
  }

  async select(selector: string, values: string | string[]): Promise<void> {
    await this.simulateDelay();
  }

  async getCurrentUrl(): Promise<string> {
    return this.currentUrl;
  }

  async getTitle(): Promise<string> {
    return this.currentTitle;
  }

  private async simulateDelay(ms: number = 100): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalExecutor: Executor | null = null;

export function getExecutor(config?: Partial<ExecutorConfig>): Executor {
  if (!globalExecutor) {
    globalExecutor = new Executor(config);
  }
  return globalExecutor;
}

export function resetExecutor(): void {
  globalExecutor = null;
}
