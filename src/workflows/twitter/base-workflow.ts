/**
 * Base Workflow Executor
 * 
 * Finite state machine implementation for Twitter workflows.
 * Handles execution, pause/stop, events, and error recovery.
 */

import { v4 as uuid } from 'uuid';
import { EventBus, getEventBus, createBaseEvent } from '../../runtime/event-bus';
import { ComplianceManager, getComplianceManager } from '../../runtime/compliance';
import { browserBridge, BrowserResponse } from '../../lib/browserBridge';
import { Action } from '../../types/events';
import {
  WorkflowConfig,
  WorkflowContext,
  WorkflowDefinition,
  WorkflowState,
  WorkflowStatus,
  WorkflowStep,
  TwitterWorkflowEvent,
  BrowserControl,
  TypeOptions,
} from './types';
import { getAllSelectors, getSelectorDescription } from './selectors';

// ============================================================================
// Workflow Executor
// ============================================================================

export class WorkflowExecutor<TInput, TOutput> {
  private definition: WorkflowDefinition<TInput, TOutput>;
  private eventBus: EventBus;
  private compliance: ComplianceManager;
  private abortController: AbortController | null = null;
  private state: WorkflowState<Partial<TOutput>> | null = null;
  private runId: string | null = null;
  private pausePromise: { resolve: () => void } | null = null;

  constructor(
    definition: WorkflowDefinition<TInput, TOutput>,
    eventBus?: EventBus,
    compliance?: ComplianceManager
  ) {
    this.definition = definition;
    this.eventBus = eventBus ?? getEventBus();
    this.compliance = compliance ?? getComplianceManager();
  }

  // --------------------------------------------------------------------------
  // Execution
  // --------------------------------------------------------------------------

  /**
   * Execute the workflow
   */
  async execute(input: TInput): Promise<{
    success: boolean;
    output?: TOutput;
    error?: string;
    state: WorkflowState<Partial<TOutput>>;
  }> {
    // Validate input
    const validation = this.definition.validateInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid input: ${validation.errors?.join(', ')}`,
        state: this.createInitialState(),
      };
    }

    // Initialize
    this.runId = `run_${Date.now()}_${uuid().slice(0, 8)}`;
    this.abortController = new AbortController();
    const initialData = this.definition.initialize(input);
    
    this.state = {
      status: 'running',
      currentStep: '',
      stepIndex: 0,
      totalSteps: this.definition.steps.length,
      data: initialData,
      startedAt: Date.now(),
    };

    // Create context
    const context = this.createContext(input);

    // Emit workflow started
    this.emitWorkflowEvent({
      type: 'TWITTER_WORKFLOW_STARTED',
      workflowName: this.definition.config.name,
      data: { input },
    });

    try {
      // Execute steps
      for (let i = 0; i < this.definition.steps.length; i++) {
        // Check abort
        if (this.abortController.signal.aborted) {
          throw new Error('Workflow stopped by user');
        }

        // Check pause
        if (this.state.status === 'paused') {
          await this.waitForResume();
        }

        const step = this.definition.steps[i];
        this.state.currentStep = step.id;
        this.state.stepIndex = i;

        // Check if step can be skipped
        if (step.canSkip?.(context)) {
          this.emitStepEvent('TWITTER_STEP_COMPLETED', step, {
            skipped: true,
            reason: 'Condition not met',
          });
          continue;
        }

        // Execute step
        const success = await this.executeStep(step, context);
        
        if (!success) {
          throw new Error(`Step "${step.name}" failed`);
        }

        // Optional delay between steps
        if (this.definition.config.stepDelay) {
          await this.delay(this.definition.config.stepDelay);
        }
      }

      // Finalize
      const output = this.definition.finalize(this.state.data);
      this.state.status = 'completed';
      this.state.completedAt = Date.now();

      this.emitWorkflowEvent({
        type: 'TWITTER_WORKFLOW_COMPLETED',
        workflowName: this.definition.config.name,
        data: { output },
      });

      return {
        success: true,
        output,
        state: this.state,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.state.status = 'failed';
      this.state.error = errorMessage;
      this.state.completedAt = Date.now();

      this.emitWorkflowEvent({
        type: 'TWITTER_WORKFLOW_FAILED',
        workflowName: this.definition.config.name,
        data: { error: errorMessage },
      });

      return {
        success: false,
        error: errorMessage,
        state: this.state,
      };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Execute a single step with retries
   */
  private async executeStep(
    step: WorkflowStep<WorkflowContext<TInput, Partial<TOutput>>>,
    context: WorkflowContext<TInput, Partial<TOutput>>
  ): Promise<boolean> {
    const maxRetries = step.maxRetries ?? this.definition.config.maxRetries ?? 2;
    const timeout = step.timeout ?? this.definition.config.defaultStepTimeout ?? 30000;

    this.emitStepEvent('TWITTER_STEP_STARTED', step);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Check for approval requirement
        if (step.requiresApproval) {
          const approved = await context.requestApproval(
            { id: step.id, kind: 'send_message', timestamp: Date.now() } as Action,
            `Step "${step.name}" requires approval`
          );
          if (!approved) {
            throw new Error('Approval denied');
          }
        }

        // Execute with timeout
        const success = await this.withTimeout(
          step.execute(context),
          timeout,
          `Step "${step.name}" timed out`
        );

        if (success) {
          this.emitStepEvent('TWITTER_STEP_COMPLETED', step, { attempt });
          return true;
        }
      } catch (error) {
        const isLastAttempt = attempt === maxRetries;
        
        if (!isLastAttempt) {
          this.emitStepEvent('TWITTER_STEP_FAILED', step, {
            attempt,
            willRetry: true,
            error: error instanceof Error ? error.message : String(error),
          });
          await this.delay(1000 * (attempt + 1)); // Exponential backoff
        } else {
          this.emitStepEvent('TWITTER_STEP_FAILED', step, {
            attempt,
            willRetry: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return false;
  }

  // --------------------------------------------------------------------------
  // Control
  // --------------------------------------------------------------------------

  /**
   * Pause the workflow
   */
  pause(): void {
    if (this.state && this.state.status === 'running') {
      this.state.status = 'paused';
      this.state.pausedAt = Date.now();
      
      this.emitWorkflowEvent({
        type: 'TWITTER_WORKFLOW_PAUSED',
        workflowName: this.definition.config.name,
      });
    }
  }

  /**
   * Resume the workflow
   */
  resume(): void {
    if (this.state && this.state.status === 'paused') {
      this.state.status = 'running';
      this.state.pausedAt = undefined;
      
      if (this.pausePromise) {
        this.pausePromise.resolve();
        this.pausePromise = null;
      }

      this.emitWorkflowEvent({
        type: 'TWITTER_WORKFLOW_RESUMED',
        workflowName: this.definition.config.name,
      });
    }
  }

  /**
   * Stop the workflow
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    if (this.state && this.state.status !== 'completed' && this.state.status !== 'failed') {
      this.state.status = 'stopped';
      this.state.completedAt = Date.now();
      
      // Also resolve pause if waiting
      if (this.pausePromise) {
        this.pausePromise.resolve();
        this.pausePromise = null;
      }

      this.emitWorkflowEvent({
        type: 'TWITTER_WORKFLOW_STOPPED',
        workflowName: this.definition.config.name,
      });
    }
  }

  /**
   * Get current state
   */
  getState(): WorkflowState<Partial<TOutput>> | null {
    return this.state;
  }

  // --------------------------------------------------------------------------
  // Context Creation
  // --------------------------------------------------------------------------

  private createContext(input: TInput): WorkflowContext<TInput, Partial<TOutput>> {
    return {
      runId: this.runId!,
      input,
      data: this.state!.data,
      state: this.state!,
      abortSignal: this.abortController!.signal,
      emit: (event) => this.emitWorkflowEvent(event),
      requestApproval: (action, reason) => this.requestApproval(action, reason),
      browser: this.createBrowserControl(),
    };
  }

  private createBrowserControl(): BrowserControl {
    return {
      navigate: async (url: string): Promise<boolean> => {
        const result = await browserBridge.navigate(url);
        if (!result.success) return false;
        
        // Wait for navigation
        const waitResult = await browserBridge.waitForNavigation(10000);
        return waitResult.success;
      },

      click: async (selectors: string | string[]): Promise<boolean> => {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        
        for (let i = 0; i < selectorList.length; i++) {
          const selector = selectorList[i];
          const result = await browserBridge.clickSelector(selector);
          
          if (result.success) {
            // Emit fallback event if not primary selector
            if (i > 0) {
              this.emitWorkflowEvent({
                type: 'TWITTER_SELECTOR_FALLBACK',
                workflowName: this.definition.config.name,
                data: {
                  originalSelector: selectorList[0],
                  usedSelector: selector,
                  fallbackIndex: i,
                },
              });
            }
            return true;
          }
        }
        
        return false;
      },

      type: async (selectors: string | string[], text: string, options?: TypeOptions): Promise<boolean> => {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        
        for (const selector of selectorList) {
          // First click to focus
          const clickResult = await browserBridge.clickSelector(selector);
          if (!clickResult.success) continue;
          
          // Small delay for focus
          await this.delay(100);
          
          // Type the text
          const typeResult = await browserBridge.type({
            text,
            delay: options?.delay ?? 50,
            clearFirst: options?.clearFirst ?? false,
          });
          
          if (typeResult.success) {
            // Press Enter if requested
            if (options?.pressEnter) {
              await browserBridge.execute('document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true }))');
            }
            return true;
          }
        }
        
        return false;
      },

      waitForSelector: async (selectors: string | string[], timeout = 10000): Promise<boolean> => {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
          for (const selector of selectorList) {
            const result = await browserBridge.waitForSelector(selector, { timeout: 500 });
            if (result.success) return true;
          }
          await this.delay(200);
        }
        
        return false;
      },

      waitForNavigation: async (timeout = 10000): Promise<boolean> => {
        const result = await browserBridge.waitForNavigation(timeout);
        return result.success;
      },

      execute: async <T = unknown>(script: string): Promise<T | null> => {
        const result = await browserBridge.execute<T>(script);
        return result.success ? (result.result as T) : null;
      },

      getCurrentUrl: async (): Promise<string> => {
        const state = await browserBridge.getState();
        return state?.url ?? '';
      },

      elementExists: async (selectors: string | string[]): Promise<boolean> => {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        
        for (const selector of selectorList) {
          const exists = await browserBridge.execute<boolean>(
            `!!document.querySelector(${JSON.stringify(selector)})`
          );
          if (exists.success && exists.result) return true;
        }
        
        return false;
      },

      getElementText: async (selectors: string | string[]): Promise<string | null> => {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        
        for (const selector of selectorList) {
          const result = await browserBridge.execute<string>(
            `document.querySelector(${JSON.stringify(selector)})?.textContent?.trim() ?? null`
          );
          if (result.success && result.result) return result.result;
        }
        
        return null;
      },

      getElementAttribute: async (selectors: string | string[], attribute: string): Promise<string | null> => {
        const selectorList = Array.isArray(selectors) ? selectors : [selectors];
        
        for (const selector of selectorList) {
          const result = await browserBridge.execute<string>(
            `document.querySelector(${JSON.stringify(selector)})?.getAttribute(${JSON.stringify(attribute)}) ?? null`
          );
          if (result.success && result.result) return result.result;
        }
        
        return null;
      },

      scroll: async (direction: 'up' | 'down', amount = 500): Promise<boolean> => {
        const deltaY = direction === 'down' ? amount : -amount;
        const result = await browserBridge.scroll({ deltaY, deltaX: 0, x: 0, y: 0 });
        return result.success;
      },

      screenshot: async (): Promise<string | null> => {
        const result = await browserBridge.screenshot();
        return result.success ? result.result ?? null : null;
      },
    };
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private async requestApproval(action: Action, reason: string): Promise<boolean> {
    if (!this.runId) return false;

    const result = await this.compliance.checkAction(action, this.runId);
    
    if (!result.allowed && result.requiresApproval && result.approvalRequest) {
      this.state!.status = 'awaiting_approval';
      
      // Wait for approval (with timeout)
      const approved = await this.waitForApproval(result.approvalRequest.id, 300000);
      
      this.state!.status = 'running';
      return approved;
    }
    
    return result.allowed;
  }

  private async waitForApproval(approvalId: string, timeoutMs: number): Promise<boolean> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      const request = this.compliance.getApprovalRequest(approvalId);
      
      if (!request) return false;
      if (request.status === 'approved') return true;
      if (request.status === 'denied' || request.status === 'expired') return false;
      
      await this.delay(500);
    }
    
    return false;
  }

  private async waitForResume(): Promise<void> {
    return new Promise((resolve) => {
      this.pausePromise = { resolve };
    });
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    errorMessage: string
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
      ),
    ]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private createInitialState(): WorkflowState<Partial<TOutput>> {
    return {
      status: 'idle',
      currentStep: '',
      stepIndex: 0,
      totalSteps: this.definition.steps.length,
      data: {} as Partial<TOutput>,
    };
  }

  // --------------------------------------------------------------------------
  // Events
  // --------------------------------------------------------------------------

  private emitWorkflowEvent(event: Omit<TwitterWorkflowEvent, 'id' | 'timestamp' | 'runId'>): void {
    const fullEvent: TwitterWorkflowEvent = {
      id: `twt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: Date.now(),
      runId: this.runId!,
      ...event,
    };

    // Also emit as a runtime event for the UI
    this.eventBus.emit({
      ...createBaseEvent('ACTION_STARTED', this.runId!),
      action: event.type,
      target: event.workflowName,
      value: JSON.stringify(event.data),
    } as any);
  }

  private emitStepEvent(
    type: 'TWITTER_STEP_STARTED' | 'TWITTER_STEP_COMPLETED' | 'TWITTER_STEP_FAILED',
    step: WorkflowStep<any>,
    data?: Record<string, unknown>
  ): void {
    this.emitWorkflowEvent({
      type,
      workflowName: this.definition.config.name,
      data: {
        stepId: step.id,
        stepName: step.name,
        stepDescription: step.description,
        ...data,
      },
    });
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWorkflowExecutor<TInput, TOutput>(
  definition: WorkflowDefinition<TInput, TOutput>
): WorkflowExecutor<TInput, TOutput> {
  return new WorkflowExecutor(definition);
}
