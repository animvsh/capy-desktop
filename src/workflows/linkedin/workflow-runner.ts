/**
 * Workflow Runner
 * 
 * Executes LinkedIn workflows as finite state machines.
 * Supports pause/stop, approvals, retries, and event emission.
 */

import { v4 as uuid } from 'uuid';
import {
  WorkflowDefinition,
  WorkflowInstance,
  WorkflowState,
  StepState,
  WorkflowStep,
  StepResult,
} from './types';
import { EventBus, getEventBus, createBaseEvent } from '../../runtime/event-bus';
import { ComplianceManager, getComplianceManager } from '../../runtime/compliance';
import { ApprovalRequest, RuntimeEvent } from '../../types/events';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowRunnerOptions {
  eventBus?: EventBus;
  complianceManager?: ComplianceManager;
  defaultTimeout?: number;
  defaultMaxRetries?: number;
}

export interface RunOptions {
  runId?: string;
  onStep?: (stepId: string, state: StepState) => void;
  onApproval?: (approval: ApprovalRequest) => void;
}

// ============================================================================
// Workflow Runner
// ============================================================================

export class WorkflowRunner<TInput, TOutput, TContext> {
  private definition: WorkflowDefinition<TInput, TOutput, TContext>;
  private eventBus: EventBus;
  private complianceManager: ComplianceManager;
  private defaultTimeout: number;
  private defaultMaxRetries: number;

  // Current execution state
  private instance: WorkflowInstance<TInput, TOutput, TContext> | null = null;
  private abortController: AbortController | null = null;
  private pauseResolver: (() => void) | null = null;
  private approvalResolver: ((approved: boolean) => void) | null = null;

  constructor(
    definition: WorkflowDefinition<TInput, TOutput, TContext>,
    options: WorkflowRunnerOptions = {}
  ) {
    this.definition = definition;
    this.eventBus = options.eventBus ?? getEventBus();
    this.complianceManager = options.complianceManager ?? getComplianceManager();
    this.defaultTimeout = options.defaultTimeout ?? 30000;
    this.defaultMaxRetries = options.defaultMaxRetries ?? 3;
  }

  // --------------------------------------------------------------------------
  // Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start workflow execution
   */
  async run(input: TInput, options: RunOptions = {}): Promise<TOutput> {
    // Validate input
    if (this.definition.validate) {
      const validation = this.definition.validate(input);
      if (!validation.valid) {
        throw new WorkflowError(
          'VALIDATION_ERROR',
          `Input validation failed: ${validation.errors.join(', ')}`
        );
      }
    }

    // Initialize instance
    const runId = options.runId ?? uuid();
    this.instance = this.createInstance(input, runId);
    this.abortController = new AbortController();

    // Emit start event
    this.emitEvent({
      ...createBaseEvent('RUN_STARTED', runId),
      taskDescription: `${this.definition.name}: ${this.definition.description}`,
      totalSteps: this.definition.steps.length,
    } as RuntimeEvent);

    try {
      // Execute steps
      await this.executeSteps(options);

      // Mark completed
      this.instance.state = 'COMPLETED';
      this.instance.completedAt = Date.now();
      this.instance.output = this.definition.getOutput(this.instance.context);

      // Emit finish event
      this.emitEvent({
        ...createBaseEvent('RUN_FINISHED', runId),
        summary: {
          totalSteps: this.definition.steps.length,
          completedSteps: this.getCompletedStepCount(),
          failedSteps: this.getFailedStepCount(),
          durationMs: Date.now() - (this.instance.startedAt ?? Date.now()),
        },
      } as RuntimeEvent);

      return this.instance.output;
    } catch (error) {
      // Mark failed
      this.instance.state = 'FAILED';
      this.instance.error = error instanceof Error ? error.message : String(error);

      // Emit fail event
      this.emitEvent({
        ...createBaseEvent('RUN_FAILED', runId),
        error: this.instance.error,
        lastStep: this.getCurrentStepId(),
      } as RuntimeEvent);

      throw error;
    }
  }

  /**
   * Pause execution after current step
   */
  async pause(): Promise<void> {
    if (!this.instance || this.instance.state !== 'RUNNING') {
      return;
    }

    this.instance.state = 'PAUSED';
    this.emitEvent({
      ...createBaseEvent('RUN_PAUSED', this.instance.runId),
      reason: 'user_request',
    } as RuntimeEvent);

    // Create pause promise that will be resolved on resume
    return new Promise((resolve) => {
      this.pauseResolver = resolve;
    });
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (!this.instance || this.instance.state !== 'PAUSED') {
      return;
    }

    this.instance.state = 'RUNNING';
    this.emitEvent({
      ...createBaseEvent('RUN_RESUMED', this.instance.runId),
    } as RuntimeEvent);

    // Resolve pause promise
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
  }

  /**
   * Stop execution immediately
   */
  async stop(): Promise<void> {
    if (!this.instance) {
      return;
    }

    // Signal abort
    this.abortController?.abort();

    this.emitEvent({
      ...createBaseEvent('STOP_REQUESTED', this.instance.runId),
      immediate: true,
    } as RuntimeEvent);

    // Wait for acknowledgment (max 100ms)
    await new Promise((resolve) => setTimeout(resolve, 100));

    this.emitEvent({
      ...createBaseEvent('STOP_ACKNOWLEDGED', this.instance.runId),
    } as RuntimeEvent);

    this.instance.state = 'STOPPED';

    this.emitEvent({
      ...createBaseEvent('STOPPED', this.instance.runId),
      reason: 'user_request',
    } as RuntimeEvent);

    // Resolve any pending promises
    if (this.pauseResolver) {
      this.pauseResolver();
      this.pauseResolver = null;
    }
    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  /**
   * Grant approval for pending action
   */
  approveAction(approvalId: string): void {
    if (!this.instance?.pendingApproval) return;
    if (this.instance.pendingApproval.id !== approvalId) return;

    this.complianceManager.approveAction(approvalId);
    this.instance.pendingApproval = null;

    this.emitEvent({
      ...createBaseEvent('APPROVAL_GRANTED', this.instance.runId),
      approvalId,
      grantedBy: 'user',
    } as RuntimeEvent);

    if (this.approvalResolver) {
      this.approvalResolver(true);
      this.approvalResolver = null;
    }
  }

  /**
   * Deny approval for pending action
   */
  denyAction(approvalId: string, reason?: string): void {
    if (!this.instance?.pendingApproval) return;
    if (this.instance.pendingApproval.id !== approvalId) return;

    this.complianceManager.denyAction(approvalId);
    this.instance.pendingApproval = null;

    this.emitEvent({
      ...createBaseEvent('APPROVAL_DENIED', this.instance.runId),
      approvalId,
      reason,
    } as RuntimeEvent);

    if (this.approvalResolver) {
      this.approvalResolver(false);
      this.approvalResolver = null;
    }
  }

  // --------------------------------------------------------------------------
  // Getters
  // --------------------------------------------------------------------------

  get state(): WorkflowState {
    return this.instance?.state ?? 'IDLE';
  }

  get currentStep(): string | null {
    if (!this.instance) return null;
    const step = this.definition.steps[this.instance.currentStepIndex];
    return step?.id ?? null;
  }

  get progress(): { current: number; total: number } {
    return {
      current: this.instance?.currentStepIndex ?? 0,
      total: this.definition.steps.length,
    };
  }

  getInstance(): WorkflowInstance<TInput, TOutput, TContext> | null {
    return this.instance;
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private createInstance(
    input: TInput,
    runId: string
  ): WorkflowInstance<TInput, TOutput, TContext> {
    return {
      id: uuid(),
      runId,
      workflowId: this.definition.id,
      state: 'RUNNING',
      input,
      context: this.definition.createContext(input),
      output: null,
      currentStepIndex: 0,
      stepStates: new Map(),
      stepResults: new Map(),
      startedAt: Date.now(),
      completedAt: null,
      error: null,
      retryCount: 0,
      pendingApproval: null,
    };
  }

  private async executeSteps(options: RunOptions): Promise<void> {
    if (!this.instance) return;

    for (let i = 0; i < this.definition.steps.length; i++) {
      // Check abort signal
      if (this.abortController?.signal.aborted) {
        throw new WorkflowError('STOPPED', 'Workflow was stopped');
      }

      // Check for pause
      if (this.instance.state === 'PAUSED') {
        await new Promise<void>((resolve) => {
          this.pauseResolver = resolve;
        });
        // After resume, check if we should continue
        // Note: state can change during pause, so re-read with full type
        const currentState = this.instance.state as WorkflowState;
        if (currentState === 'STOPPED') {
          throw new WorkflowError('STOPPED', 'Workflow was stopped');
        }
      }

      this.instance.currentStepIndex = i;
      const step = this.definition.steps[i];

      // Check if step should be skipped
      if (step.shouldSkip?.(this.instance.context)) {
        this.instance.stepStates.set(step.id, 'SKIPPED');
        this.emitStepEvent('STEP_SKIPPED', step, i, { reason: 'Condition not met' });
        options.onStep?.(step.id, 'SKIPPED');
        continue;
      }

      // Validate step preconditions
      if (step.validate) {
        const validation = step.validate(this.instance.context);
        if (!validation.valid) {
          this.instance.stepStates.set(step.id, 'FAILED');
          throw new WorkflowError(
            'VALIDATION_ERROR',
            `Step "${step.name}" validation failed: ${validation.errors.join(', ')}`
          );
        }
      }

      // Check if step requires approval
      if (step.requiresApproval) {
        const approved = await this.requestApproval(step, options);
        if (!approved) {
          this.instance.stepStates.set(step.id, 'SKIPPED');
          this.emitStepEvent('STEP_SKIPPED', step, i, { reason: 'Approval denied' });
          options.onStep?.(step.id, 'SKIPPED');
          throw new WorkflowError('APPROVAL_DENIED', 'User denied the action');
        }
      }

      // Execute step with retries
      await this.executeStepWithRetries(step, i, options);
    }
  }

  private async executeStepWithRetries(
    step: WorkflowStep<TContext>,
    index: number,
    options: RunOptions
  ): Promise<void> {
    if (!this.instance) return;

    const maxRetries = step.maxRetries ?? this.defaultMaxRetries;
    const timeout = step.timeoutMs ?? this.defaultTimeout;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Mark running
        this.instance.stepStates.set(step.id, 'RUNNING');
        this.emitStepEvent('STEP_STARTED', step, index);
        options.onStep?.(step.id, 'RUNNING');

        // Execute with timeout
        const result = await this.executeWithTimeout(
          () => step.execute(this.instance!.context),
          timeout
        );

        // Store result
        this.instance.stepResults.set(step.id, result);

        if (result.success) {
          this.instance.stepStates.set(step.id, 'COMPLETED');
          this.emitStepEvent('STEP_COMPLETED', step, index, {
            durationMs: Date.now() - (this.instance.startedAt ?? Date.now()),
            result: result.data,
          });
          options.onStep?.(step.id, 'COMPLETED');
          return;
        } else if (result.shouldRetry && attempt < maxRetries) {
          lastError = new Error(result.error ?? 'Step failed');
          this.emitStepEvent('STEP_FAILED', step, index, {
            error: result.error,
            retryable: true,
          });
          // Wait before retry
          await this.delay(Math.pow(2, attempt) * 1000);
        } else {
          throw new Error(result.error ?? 'Step failed');
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries && this.isRetryableError(lastError)) {
          this.emitStepEvent('STEP_FAILED', step, index, {
            error: lastError.message,
            retryable: true,
          });
          await this.delay(Math.pow(2, attempt) * 1000);
        } else {
          // Final failure
          this.instance.stepStates.set(step.id, 'FAILED');
          this.emitStepEvent('STEP_FAILED', step, index, {
            error: lastError.message,
            retryable: false,
          });
          options.onStep?.(step.id, 'FAILED');

          // Run cleanup if defined
          if (step.cleanup) {
            try {
              await step.cleanup(this.instance.context, lastError);
            } catch {
              // Ignore cleanup errors
            }
          }

          throw lastError;
        }
      }
    }
  }

  private async requestApproval(
    step: WorkflowStep<TContext>,
    options: RunOptions
  ): Promise<boolean> {
    if (!this.instance) return false;

    // Create approval request
    const approval: ApprovalRequest = {
      id: `apr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      action: {
        id: step.id,
        kind: 'connect', // Generic, would be overridden by specific workflows
        timestamp: Date.now(),
        profileUrl: '', // Placeholder - actual workflows should override
        platform: 'linkedin',
      },
      reason: step.approvalPrompt ?? `Approve "${step.name}"?`,
      createdAt: Date.now(),
      expiresAt: Date.now() + 300000, // 5 minutes
      status: 'pending',
    };

    this.instance.pendingApproval = approval;
    this.instance.state = 'WAITING_APPROVAL';

    // Emit event
    this.emitEvent({
      ...createBaseEvent('NEEDS_APPROVAL', this.instance.runId),
      action: approval.action,
      reason: approval.reason,
      approvalId: approval.id,
      timeoutMs: 300000,
    } as RuntimeEvent);

    options.onApproval?.(approval);

    // Wait for approval
    return new Promise<boolean>((resolve) => {
      this.approvalResolver = resolve;

      // Set timeout
      setTimeout(() => {
        if (this.instance?.pendingApproval?.id === approval.id) {
          this.instance.pendingApproval.status = 'expired';
          this.instance.pendingApproval = null;
          this.emitEvent({
            ...createBaseEvent('APPROVAL_TIMEOUT', this.instance.runId),
            approvalId: approval.id,
          } as RuntimeEvent);
          resolve(false);
        }
      }, 300000);
    }).finally(() => {
      if (this.instance) {
        this.instance.state = 'RUNNING';
      }
    });
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new WorkflowError('TIMEOUT', 'Step timed out')),
          timeoutMs
        )
      ),
    ]);
  }

  private isRetryableError(error: Error): boolean {
    // Network errors, timeouts, element not found are retryable
    const retryablePatterns = [
      'timeout',
      'network',
      'element not found',
      'navigation',
      'ECONNREFUSED',
      'ENOTFOUND',
    ];
    const message = error.message.toLowerCase();
    return retryablePatterns.some((pattern) => message.includes(pattern));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getCurrentStepId(): string | null {
    if (!this.instance) return null;
    return this.definition.steps[this.instance.currentStepIndex]?.id ?? null;
  }

  private getCompletedStepCount(): number {
    if (!this.instance) return 0;
    return Array.from(this.instance.stepStates.values()).filter(
      (s) => s === 'COMPLETED'
    ).length;
  }

  private getFailedStepCount(): number {
    if (!this.instance) return 0;
    return Array.from(this.instance.stepStates.values()).filter(
      (s) => s === 'FAILED'
    ).length;
  }

  private emitEvent(event: RuntimeEvent): void {
    this.eventBus.emit(event);
  }

  private emitStepEvent(
    type: 'STEP_STARTED' | 'STEP_COMPLETED' | 'STEP_FAILED' | 'STEP_SKIPPED',
    step: WorkflowStep<TContext>,
    index: number,
    extra?: Record<string, unknown>
  ): void {
    if (!this.instance) return;

    this.eventBus.emit({
      ...createBaseEvent(type, this.instance.runId),
      stepIndex: index,
      stepDescription: step.description,
      action: {
        id: step.id,
        kind: 'extract' as const,
        timestamp: Date.now(),
      },
      ...extra,
    } as RuntimeEvent);
  }
}

// ============================================================================
// Workflow Error
// ============================================================================

export type WorkflowErrorCode =
  | 'VALIDATION_ERROR'
  | 'TIMEOUT'
  | 'STOPPED'
  | 'APPROVAL_DENIED'
  | 'ELEMENT_NOT_FOUND'
  | 'NAVIGATION_ERROR'
  | 'RATE_LIMITED'
  | 'LOGIN_REQUIRED'
  | 'PROFILE_NOT_FOUND'
  | 'UNKNOWN';

export class WorkflowError extends Error {
  code: WorkflowErrorCode;
  recoverable: boolean;

  constructor(code: WorkflowErrorCode, message: string, recoverable = false) {
    super(message);
    this.name = 'WorkflowError';
    this.code = code;
    this.recoverable = recoverable;
  }
}
