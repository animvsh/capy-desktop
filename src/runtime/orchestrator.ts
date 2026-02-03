/**
 * Orchestrator - Run Lifecycle Manager
 * 
 * Manages the execution lifecycle with:
 * - State machine: IDLE → RUNNING → PAUSED → STOPPED
 * - start(task), pause(), resume(), stop()
 * - Task queue management
 * - Guarantees stoppability via AbortController
 * - Delegates to executor for atomic actions
 * - Non-blocking: chat never blocks on executor
 */

import {
  RunState,
  RUN_STATE_TRANSITIONS,
  Task,
  Action,
  StepStatus,
  ApprovalRequest,
  RuntimeEvent,
  ApprovalGrantedEvent,
  ApprovalDeniedEvent,
  ACTIONS_REQUIRING_APPROVAL,
} from '../types/events';
import { EventBus, getEventBus, createBaseEvent } from './event-bus';
import { Executor, getExecutor, ExecutionContext, BrowserAdapter } from './executor';
import { ComplianceManager, getComplianceManager, ComplianceResult } from './compliance';

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorConfig {
  maxConcurrentRuns: number;
  approvalTimeoutMs: number;
  pauseCheckIntervalMs: number;
}

export interface RunContext {
  id: string;
  task: Task;
  state: RunState;
  steps: StepStatus[];
  currentStepIndex: number;
  startedAt: number;
  endedAt?: number;
  abortController: AbortController;
  pausePromise?: {
    promise: Promise<void>;
    resolve: () => void;
  };
  pendingApprovals: Map<string, ApprovalRequest>;
  error?: string;
}

export type StateChangeHandler = (runId: string, oldState: RunState, newState: RunState) => void;

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxConcurrentRuns: 1,
  approvalTimeoutMs: 300000, // 5 minutes
  pauseCheckIntervalMs: 100,
};

// ============================================================================
// Orchestrator Implementation
// ============================================================================

export class Orchestrator {
  private config: OrchestratorConfig;
  private eventBus: EventBus;
  private executor: Executor;
  private compliance: ComplianceManager;
  
  private runs: Map<string, RunContext> = new Map();
  private taskQueue: Task[] = [];
  private stateChangeHandlers: Set<StateChangeHandler> = new Set();

  constructor(
    config: Partial<OrchestratorConfig> = {},
    eventBus?: EventBus,
    executor?: Executor,
    compliance?: ComplianceManager
  ) {
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.eventBus = eventBus ?? getEventBus();
    this.executor = executor ?? getExecutor();
    this.compliance = compliance ?? getComplianceManager();

    // Listen for approval events
    this.setupApprovalListeners();
  }

  // --------------------------------------------------------------------------
  // Browser Adapter
  // --------------------------------------------------------------------------

  setBrowserAdapter(adapter: BrowserAdapter): void {
    this.executor.setBrowserAdapter(adapter);
  }

  // --------------------------------------------------------------------------
  // State Change Handlers
  // --------------------------------------------------------------------------

  onStateChange(handler: StateChangeHandler): () => void {
    this.stateChangeHandlers.add(handler);
    return () => this.stateChangeHandlers.delete(handler);
  }

  private notifyStateChange(runId: string, oldState: RunState, newState: RunState): void {
    for (const handler of this.stateChangeHandlers) {
      try {
        handler(runId, oldState, newState);
      } catch (error) {
        console.error('[Orchestrator] State change handler error:', error);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Run Lifecycle
  // --------------------------------------------------------------------------

  /**
   * Start a new run with the given task
   * Returns immediately (non-blocking)
   */
  async start(task: Task): Promise<string> {
    // Check if we can start a new run
    const activeRuns = this.getActiveRuns();
    if (activeRuns.length >= this.config.maxConcurrentRuns) {
      // Queue the task
      this.taskQueue.push(task);
      this.eventBus.emit({
        ...createBaseEvent('ACTION_QUEUED', task.id),
        task,
      } as any);
      return task.id;
    }

    // Create run context
    const runContext = this.createRunContext(task);
    this.runs.set(runContext.id, runContext);

    // Transition to RUNNING
    this.transitionState(runContext, 'RUNNING');

    // Emit run started
    this.eventBus.emit({
      ...createBaseEvent('RUN_STARTED', runContext.id),
      taskDescription: task.description,
      totalSteps: task.actions.length,
    });

    // Start execution loop (non-blocking)
    this.executeRun(runContext).catch((error) => {
      console.error('[Orchestrator] Run execution error:', error);
      this.handleRunError(runContext, error);
    });

    return runContext.id;
  }

  /**
   * Pause a running run (completes current step first)
   */
  pause(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.state !== 'RUNNING') {
      return false;
    }

    // Create pause promise that execution loop will await
    let resolveFunc: () => void;
    const pausePromise = new Promise<void>((resolve) => {
      resolveFunc = resolve;
    });
    run.pausePromise = {
      promise: pausePromise,
      resolve: resolveFunc!,
    };

    this.eventBus.emit({
      ...createBaseEvent('PAUSE_REQUESTED', runId),
    });

    this.transitionState(run, 'PAUSED');

    this.eventBus.emit({
      ...createBaseEvent('RUN_PAUSED', runId),
      reason: 'user_request',
    });

    return true;
  }

  /**
   * Resume a paused run
   */
  resume(runId: string): boolean {
    const run = this.runs.get(runId);
    if (!run || run.state !== 'PAUSED') {
      return false;
    }

    // Resolve the pause promise to continue execution
    if (run.pausePromise) {
      run.pausePromise.resolve();
      run.pausePromise = undefined;
    }

    this.transitionState(run, 'RUNNING');

    this.eventBus.emit({
      ...createBaseEvent('RUN_RESUMED', runId),
    });

    return true;
  }

  /**
   * Stop a run immediately
   */
  stop(runId: string, immediate: boolean = false): boolean {
    const run = this.runs.get(runId);
    if (!run || run.state === 'STOPPED' || run.state === 'IDLE') {
      return false;
    }

    this.eventBus.emit({
      ...createBaseEvent('STOP_REQUESTED', runId),
      immediate,
    });

    // Abort the controller to cancel any in-flight operations
    run.abortController.abort();

    // If paused, resolve the pause promise
    if (run.pausePromise) {
      run.pausePromise.resolve();
      run.pausePromise = undefined;
    }

    this.eventBus.emit({
      ...createBaseEvent('STOP_ACKNOWLEDGED', runId),
    });

    this.transitionState(run, 'STOPPED');
    run.endedAt = Date.now();

    this.eventBus.emit({
      ...createBaseEvent('STOPPED', runId),
      reason: 'user_request',
    });

    // Process queue
    this.processQueue();

    return true;
  }

  /**
   * Stop all running tasks
   */
  stopAll(): void {
    for (const run of this.runs.values()) {
      if (run.state === 'RUNNING' || run.state === 'PAUSED') {
        this.stop(run.id, true);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Approval Handling
  // --------------------------------------------------------------------------

  /**
   * Approve a pending approval
   */
  approveAction(runId: string, approvalId: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;

    const approval = run.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') return false;

    const success = this.compliance.approveAction(approvalId);
    if (success) {
      approval.status = 'approved';
      approval.resolvedAt = Date.now();
      approval.resolvedBy = 'user';

      this.eventBus.emit({
        ...createBaseEvent('APPROVAL_GRANTED', runId),
        approvalId,
        grantedBy: 'user',
      });

      // Resume if paused for approval
      if (run.state === 'PAUSED' && run.pausePromise) {
        this.resume(runId);
      }
    }

    return success;
  }

  /**
   * Deny a pending approval
   */
  denyAction(runId: string, approvalId: string, reason?: string): boolean {
    const run = this.runs.get(runId);
    if (!run) return false;

    const approval = run.pendingApprovals.get(approvalId);
    if (!approval || approval.status !== 'pending') return false;

    const success = this.compliance.denyAction(approvalId);
    if (success) {
      approval.status = 'denied';
      approval.resolvedAt = Date.now();
      approval.resolvedBy = 'user';

      this.eventBus.emit({
        ...createBaseEvent('APPROVAL_DENIED', runId),
        approvalId,
        reason,
      });

      // Resume to skip this action
      if (run.state === 'PAUSED' && run.pausePromise) {
        this.resume(runId);
      }
    }

    return success;
  }

  // --------------------------------------------------------------------------
  // Query Methods
  // --------------------------------------------------------------------------

  getRun(runId: string): RunContext | undefined {
    return this.runs.get(runId);
  }

  getRunState(runId: string): RunState | undefined {
    return this.runs.get(runId)?.state;
  }

  getActiveRuns(): RunContext[] {
    return Array.from(this.runs.values()).filter(
      (run) => run.state === 'RUNNING' || run.state === 'PAUSED'
    );
  }

  getAllRuns(): RunContext[] {
    return Array.from(this.runs.values());
  }

  getQueuedTasks(): Task[] {
    return [...this.taskQueue];
  }

  getPendingApprovals(runId: string): ApprovalRequest[] {
    const run = this.runs.get(runId);
    if (!run) return [];
    return Array.from(run.pendingApprovals.values()).filter(
      (a) => a.status === 'pending'
    );
  }

  // --------------------------------------------------------------------------
  // Execution Loop
  // --------------------------------------------------------------------------

  private async executeRun(run: RunContext): Promise<void> {
    try {
      while (run.currentStepIndex < run.steps.length) {
        // Check for abort
        if (run.abortController.signal.aborted) {
          break;
        }

        // Check for pause
        if (run.pausePromise) {
          await run.pausePromise.promise;
          // After resume, check if we were stopped during pause
          if (run.abortController.signal.aborted) {
            break;
          }
        }

        const step = run.steps[run.currentStepIndex];
        const action = step.action;

        // Check compliance
        const complianceResult = await this.compliance.checkAction(action, run.id);

        if (!complianceResult.allowed && !complianceResult.requiresApproval) {
          // Blocked by compliance (rate limit, time window, etc.)
          step.status = 'skipped';
          step.error = complianceResult.blockReason;
          
          this.eventBus.emit({
            ...createBaseEvent('STEP_SKIPPED', run.id),
            stepIndex: run.currentStepIndex,
            reason: complianceResult.blockReason ?? 'Compliance check failed',
          });

          run.currentStepIndex++;
          continue;
        }

        if (complianceResult.requiresApproval && complianceResult.approvalRequest) {
          // Needs approval - pause and wait
          run.pendingApprovals.set(
            complianceResult.approvalRequest.id,
            complianceResult.approvalRequest
          );

          // Pause for approval
          this.pause(run.id);

          // Wait for approval resolution
          const approved = await this.waitForApproval(
            run,
            complianceResult.approvalRequest.id
          );

          if (!approved) {
            // Denied or timed out - skip this action
            step.status = 'skipped';
            step.error = 'Approval denied or timed out';
            
            this.eventBus.emit({
              ...createBaseEvent('STEP_SKIPPED', run.id),
              stepIndex: run.currentStepIndex,
              reason: 'Approval denied or timed out',
            });

            run.currentStepIndex++;
            continue;
          }
        }

        // Execute the action
        step.status = 'running';
        step.startedAt = Date.now();

        const context: ExecutionContext = {
          runId: run.id,
          stepIndex: run.currentStepIndex,
          abortSignal: run.abortController.signal,
        };

        const result = await this.executor.execute(action, context);

        if (result.success) {
          step.status = 'completed';
          step.completedAt = Date.now();
          step.result = result.result;
          step.retries = result.retries;
        } else {
          step.status = 'failed';
          step.completedAt = Date.now();
          step.error = result.error;
          step.retries = result.retries;

          // Continue to next step (don't fail entire run on single step failure)
        }

        run.currentStepIndex++;
      }

      // Run completed
      if (!run.abortController.signal.aborted) {
        this.completeRun(run);
      }
    } catch (error) {
      this.handleRunError(run, error);
    }
  }

  private async waitForApproval(run: RunContext, approvalId: string): Promise<boolean> {
    const approval = run.pendingApprovals.get(approvalId);
    if (!approval) return false;

    const timeout = this.config.approvalTimeoutMs;
    const checkInterval = 100;
    let elapsed = 0;

    while (elapsed < timeout) {
      // Check if aborted
      if (run.abortController.signal.aborted) {
        return false;
      }

      // Check approval status
      const currentApproval = run.pendingApprovals.get(approvalId);
      if (!currentApproval) return false;

      if (currentApproval.status === 'approved') {
        return true;
      }

      if (currentApproval.status === 'denied') {
        return false;
      }

      await this.delay(checkInterval);
      elapsed += checkInterval;
    }

    // Timed out
    approval.status = 'expired';
    approval.resolvedAt = Date.now();
    approval.resolvedBy = 'timeout';

    this.eventBus.emit({
      ...createBaseEvent('APPROVAL_TIMEOUT', run.id),
      approvalId,
    });

    return false;
  }

  private completeRun(run: RunContext): void {
    run.endedAt = Date.now();
    this.transitionState(run, 'STOPPED');

    const completedSteps = run.steps.filter((s) => s.status === 'completed').length;
    const failedSteps = run.steps.filter((s) => s.status === 'failed').length;

    this.eventBus.emit({
      ...createBaseEvent('RUN_FINISHED', run.id),
      summary: {
        totalSteps: run.steps.length,
        completedSteps,
        failedSteps,
        durationMs: run.endedAt - run.startedAt,
      },
    });

    this.processQueue();
  }

  private handleRunError(run: RunContext, error: unknown): void {
    run.error = error instanceof Error ? error.message : String(error);
    run.endedAt = Date.now();
    this.transitionState(run, 'STOPPED');

    this.eventBus.emit({
      ...createBaseEvent('RUN_FAILED', run.id),
      error: run.error,
      lastStep: run.currentStepIndex > 0 
        ? run.steps[run.currentStepIndex - 1].action.kind 
        : undefined,
    });

    this.processQueue();
  }

  // --------------------------------------------------------------------------
  // State Machine
  // --------------------------------------------------------------------------

  private transitionState(run: RunContext, newState: RunState): boolean {
    const oldState = run.state;
    const allowedTransitions = RUN_STATE_TRANSITIONS[oldState];

    if (!allowedTransitions.includes(newState)) {
      console.warn(
        `[Orchestrator] Invalid state transition: ${oldState} → ${newState}`
      );
      return false;
    }

    run.state = newState;
    this.notifyStateChange(run.id, oldState, newState);
    return true;
  }

  // --------------------------------------------------------------------------
  // Task Queue
  // --------------------------------------------------------------------------

  private processQueue(): void {
    const activeRuns = this.getActiveRuns();
    if (activeRuns.length >= this.config.maxConcurrentRuns) {
      return;
    }

    const nextTask = this.taskQueue.shift();
    if (nextTask) {
      this.start(nextTask);
    }
  }

  cancelQueuedTask(taskId: string): boolean {
    const index = this.taskQueue.findIndex((t) => t.id === taskId);
    if (index === -1) return false;
    this.taskQueue.splice(index, 1);
    return true;
  }

  clearQueue(): void {
    this.taskQueue = [];
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private createRunContext(task: Task): RunContext {
    const steps: StepStatus[] = task.actions.map((action, index) => ({
      index,
      action,
      status: 'pending',
      retries: 0,
    }));

    return {
      id: task.id,
      task,
      state: 'IDLE',
      steps,
      currentStepIndex: 0,
      startedAt: Date.now(),
      abortController: new AbortController(),
      pendingApprovals: new Map(),
    };
  }

  private setupApprovalListeners(): void {
    // Listen for external approval events (e.g., from UI)
    this.eventBus.on('APPROVAL_GRANTED', (event: ApprovalGrantedEvent) => {
      const run = this.findRunByApprovalId(event.approvalId);
      if (run) {
        const approval = run.pendingApprovals.get(event.approvalId);
        if (approval && approval.status === 'pending') {
          approval.status = 'approved';
          approval.resolvedAt = Date.now();
          approval.resolvedBy = event.grantedBy;
        }
      }
    });

    this.eventBus.on('APPROVAL_DENIED', (event: ApprovalDeniedEvent) => {
      const run = this.findRunByApprovalId(event.approvalId);
      if (run) {
        const approval = run.pendingApprovals.get(event.approvalId);
        if (approval && approval.status === 'pending') {
          approval.status = 'denied';
          approval.resolvedAt = Date.now();
          approval.resolvedBy = 'user';
        }
      }
    });
  }

  private findRunByApprovalId(approvalId: string): RunContext | undefined {
    for (const run of this.runs.values()) {
      if (run.pendingApprovals.has(approvalId)) {
        return run;
      }
    }
    return undefined;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  updateConfig(config: Partial<OrchestratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): OrchestratorConfig {
    return { ...this.config };
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Clean up completed/stopped runs older than maxAgeMs
   */
  cleanupOldRuns(maxAgeMs: number = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, run] of this.runs.entries()) {
      if (
        run.state === 'STOPPED' &&
        run.endedAt &&
        now - run.endedAt > maxAgeMs
      ) {
        this.runs.delete(id);
        this.eventBus.clearRunHistory(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Reset the orchestrator (stops all runs, clears queue)
   */
  reset(): void {
    this.stopAll();
    this.clearQueue();
    this.runs.clear();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalOrchestrator: Orchestrator | null = null;

export function getOrchestrator(config?: Partial<OrchestratorConfig>): Orchestrator {
  if (!globalOrchestrator) {
    globalOrchestrator = new Orchestrator(config);
  }
  return globalOrchestrator;
}

export function resetOrchestrator(): void {
  if (globalOrchestrator) {
    globalOrchestrator.reset();
    globalOrchestrator = null;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a unique task ID
 */
export function createTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a task from a list of actions
 */
export function createTask(
  description: string,
  actions: Action[],
  options?: { priority?: 'low' | 'normal' | 'high'; metadata?: Record<string, unknown> }
): Task {
  return {
    id: createTaskId(),
    description,
    actions,
    createdAt: Date.now(),
    priority: options?.priority ?? 'normal',
    metadata: options?.metadata,
  };
}
