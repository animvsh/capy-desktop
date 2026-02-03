/**
 * useOrchestrator Hook
 * 
 * Provides access to the Copilot Orchestrator:
 * - Start/pause/stop/resume runs
 * - Subscribe to run events
 * - Send commands
 * - Access run state
 */

import { useCallback, useEffect, useState, useRef } from 'react';
import { create } from 'zustand';
import { EventBus, getEventBus, createBaseEvent } from '../runtime/event-bus';
import { Executor, getExecutor } from '../runtime/executor';
import { ComplianceManager, getComplianceManager } from '../runtime/compliance';
import {
  RunState,
  Action,
  Task,
  ApprovalRequest,
  RunSummary,
  StepStatus,
  RuntimeEvent,
  RUN_STATE_TRANSITIONS,
} from '../types/events';
import { generateId } from '../lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface OrchestratorState {
  // Run state
  currentRunId: string | null;
  runState: RunState;
  currentTask: Task | null;
  stepStatuses: StepStatus[];
  pendingApprovals: ApprovalRequest[];
  
  // Execution state
  currentStepIndex: number;
  isExecuting: boolean;
  error: string | null;
  
  // Metrics
  startedAt: number | null;
  completedSteps: number;
  failedSteps: number;
}

export interface OrchestratorActions {
  // Run lifecycle
  startRun: (task: Task) => Promise<string>;
  pauseRun: () => void;
  resumeRun: () => void;
  stopRun: (immediate?: boolean) => void;
  
  // Approvals
  approveAction: (approvalId: string) => void;
  denyAction: (approvalId: string, reason?: string) => void;
  
  // State access
  getRunSummary: () => RunSummary | null;
  
  // Internal
  reset: () => void;
}

export type OrchestratorStore = OrchestratorState & OrchestratorActions;

// ============================================================================
// Orchestrator Store
// ============================================================================

const initialState: OrchestratorState = {
  currentRunId: null,
  runState: 'IDLE',
  currentTask: null,
  stepStatuses: [],
  pendingApprovals: [],
  currentStepIndex: -1,
  isExecuting: false,
  error: null,
  startedAt: null,
  completedSteps: 0,
  failedSteps: 0,
};

const useOrchestratorStore = create<OrchestratorStore>((set, get) => {
  const eventBus = getEventBus();
  const executor = getExecutor();
  const compliance = getComplianceManager();
  
  let abortController: AbortController | null = null;
  let isPaused = false;
  let pendingResolvers: Map<string, { resolve: (approved: boolean) => void }> = new Map();

  // --------------------------------------------------------------------------
  // Helper Functions
  // --------------------------------------------------------------------------

  const canTransition = (from: RunState, to: RunState): boolean => {
    return RUN_STATE_TRANSITIONS[from]?.includes(to) ?? false;
  };

  const emitRunStarted = (runId: string, task: Task) => {
    eventBus.emit({
      ...createBaseEvent('RUN_STARTED', runId),
      taskDescription: task.description,
      totalSteps: task.actions.length,
    });
  };

  const emitRunFinished = (runId: string) => {
    const state = get();
    eventBus.emit({
      ...createBaseEvent('RUN_FINISHED', runId),
      summary: {
        totalSteps: state.stepStatuses.length,
        completedSteps: state.completedSteps,
        failedSteps: state.failedSteps,
        durationMs: state.startedAt ? Date.now() - state.startedAt : 0,
      },
    });
  };

  const emitRunFailed = (runId: string, error: string, lastStep?: string) => {
    eventBus.emit({
      ...createBaseEvent('RUN_FAILED', runId),
      error,
      lastStep,
    });
  };

  const emitRunPaused = (runId: string, reason: 'user_request' | 'approval_needed' | 'rate_limit' | 'error') => {
    eventBus.emit({
      ...createBaseEvent('RUN_PAUSED', runId),
      reason,
    });
  };

  const emitRunResumed = (runId: string) => {
    eventBus.emit({
      ...createBaseEvent('RUN_RESUMED', runId),
    });
  };

  const executeStep = async (action: Action, stepIndex: number, runId: string): Promise<boolean> => {
    // Check for pause
    while (isPaused) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (abortController?.signal.aborted) return false;
    }

    // Check for abort
    if (abortController?.signal.aborted) return false;

    // Check compliance
    const complianceResult = await compliance.checkAction(action, runId);
    
    if (!complianceResult.allowed && !complianceResult.requiresApproval) {
      // Blocked by compliance
      set(state => ({
        error: complianceResult.blockReason,
        stepStatuses: state.stepStatuses.map((s, i) =>
          i === stepIndex ? { ...s, status: 'failed', error: complianceResult.blockReason } : s
        ),
      }));
      return false;
    }

    if (complianceResult.requiresApproval && complianceResult.approvalRequest) {
      // Wait for approval
      set(state => ({
        pendingApprovals: [...state.pendingApprovals, complianceResult.approvalRequest!],
        runState: 'PAUSED',
      }));
      emitRunPaused(runId, 'approval_needed');

      const approved = await new Promise<boolean>(resolve => {
        pendingResolvers.set(complianceResult.approvalRequest!.id, { resolve });
        
        // Set timeout
        setTimeout(() => {
          if (pendingResolvers.has(complianceResult.approvalRequest!.id)) {
            pendingResolvers.delete(complianceResult.approvalRequest!.id);
            resolve(false);
          }
        }, compliance.getConfig().approvalTimeoutMs);
      });

      if (!approved) {
        set(state => ({
          stepStatuses: state.stepStatuses.map((s, i) =>
            i === stepIndex ? { ...s, status: 'skipped', error: 'Approval denied or timed out' } : s
          ),
        }));
        return false;
      }

      set({ runState: 'RUNNING' });
      emitRunResumed(runId);
    }

    // Execute the action
    const context = {
      runId,
      stepIndex,
      abortSignal: abortController!.signal,
    };

    set(state => ({
      currentStepIndex: stepIndex,
      stepStatuses: state.stepStatuses.map((s, i) =>
        i === stepIndex ? { ...s, status: 'running', startedAt: Date.now() } : s
      ),
    }));

    const result = await executor.execute(action, context);

    if (result.success) {
      set(state => ({
        completedSteps: state.completedSteps + 1,
        stepStatuses: state.stepStatuses.map((s, i) =>
          i === stepIndex ? { 
            ...s, 
            status: 'completed', 
            completedAt: Date.now(),
            result: result.result,
            retries: result.retries,
          } : s
        ),
      }));
      return true;
    } else {
      set(state => ({
        failedSteps: state.failedSteps + 1,
        stepStatuses: state.stepStatuses.map((s, i) =>
          i === stepIndex ? {
            ...s,
            status: 'failed',
            completedAt: Date.now(),
            error: result.error,
            retries: result.retries,
          } : s
        ),
      }));
      return false;
    }
  };

  const runTask = async (task: Task, runId: string) => {
    set({ isExecuting: true, startedAt: Date.now() });
    emitRunStarted(runId, task);

    let lastFailedStep: string | undefined;

    for (let i = 0; i < task.actions.length; i++) {
      if (abortController?.signal.aborted) {
        break;
      }

      const success = await executeStep(task.actions[i], i, runId);
      
      if (!success) {
        lastFailedStep = task.actions[i].kind;
        // Continue to next step on failure (can be configured to stop)
      }
    }

    const state = get();
    const wasAborted = abortController?.signal.aborted;

    set({ isExecuting: false, runState: 'STOPPED' });

    if (wasAborted) {
      eventBus.emit({
        ...createBaseEvent('STOPPED', runId),
        reason: 'user_request',
      });
    } else if (state.failedSteps > 0 && state.completedSteps === 0) {
      emitRunFailed(runId, 'All steps failed', lastFailedStep);
    } else {
      emitRunFinished(runId);
    }
  };

  // --------------------------------------------------------------------------
  // Store Actions
  // --------------------------------------------------------------------------

  return {
    ...initialState,

    startRun: async (task: Task) => {
      const state = get();
      if (!canTransition(state.runState, 'RUNNING')) {
        throw new Error(`Cannot start run from state: ${state.runState}`);
      }

      const runId = generateId();
      abortController = new AbortController();
      isPaused = false;

      const stepStatuses: StepStatus[] = task.actions.map((action, index) => ({
        index,
        action,
        status: 'pending',
        retries: 0,
      }));

      set({
        currentRunId: runId,
        runState: 'RUNNING',
        currentTask: task,
        stepStatuses,
        pendingApprovals: [],
        currentStepIndex: -1,
        error: null,
        completedSteps: 0,
        failedSteps: 0,
      });

      // Start execution in background
      runTask(task, runId).catch(error => {
        set({ error: error.message, runState: 'STOPPED' });
        emitRunFailed(runId, error.message);
      });

      return runId;
    },

    pauseRun: () => {
      const state = get();
      if (!canTransition(state.runState, 'PAUSED')) return;

      isPaused = true;
      set({ runState: 'PAUSED' });
      
      if (state.currentRunId) {
        emitRunPaused(state.currentRunId, 'user_request');
      }
    },

    resumeRun: () => {
      const state = get();
      if (!canTransition(state.runState, 'RUNNING')) return;

      isPaused = false;
      set({ runState: 'RUNNING' });
      
      if (state.currentRunId) {
        emitRunResumed(state.currentRunId);
      }
    },

    stopRun: (immediate = false) => {
      const state = get();
      if (!canTransition(state.runState, 'STOPPED') && state.runState !== 'PAUSED') return;

      abortController?.abort();
      isPaused = false;
      
      // Reject all pending approvals
      pendingResolvers.forEach(({ resolve }) => resolve(false));
      pendingResolvers.clear();

      if (state.currentRunId) {
        eventBus.emit({
          ...createBaseEvent('STOP_REQUESTED', state.currentRunId),
          immediate,
        });
      }

      set({ runState: 'STOPPED', pendingApprovals: [] });
    },

    approveAction: (approvalId: string) => {
      const resolver = pendingResolvers.get(approvalId);
      if (resolver) {
        resolver.resolve(true);
        pendingResolvers.delete(approvalId);
        
        const state = get();
        if (state.currentRunId) {
          eventBus.emit({
            ...createBaseEvent('APPROVAL_GRANTED', state.currentRunId),
            approvalId,
            grantedBy: 'user',
          });
        }

        set(state => ({
          pendingApprovals: state.pendingApprovals.filter(a => a.id !== approvalId),
        }));

        compliance.approveAction(approvalId);
      }
    },

    denyAction: (approvalId: string, reason?: string) => {
      const resolver = pendingResolvers.get(approvalId);
      if (resolver) {
        resolver.resolve(false);
        pendingResolvers.delete(approvalId);
        
        const state = get();
        if (state.currentRunId) {
          eventBus.emit({
            ...createBaseEvent('APPROVAL_DENIED', state.currentRunId),
            approvalId,
            reason,
          });
        }

        set(state => ({
          pendingApprovals: state.pendingApprovals.filter(a => a.id !== approvalId),
        }));

        compliance.denyAction(approvalId);
      }
    },

    getRunSummary: () => {
      const state = get();
      if (!state.currentRunId || !state.currentTask) return null;

      return {
        id: state.currentRunId,
        taskDescription: state.currentTask.description,
        state: state.runState,
        startedAt: state.startedAt ?? Date.now(),
        endedAt: state.runState === 'STOPPED' ? Date.now() : undefined,
        totalSteps: state.stepStatuses.length,
        completedSteps: state.completedSteps,
        failedSteps: state.failedSteps,
        skippedSteps: state.stepStatuses.filter(s => s.status === 'skipped').length,
        currentStep: state.currentStepIndex >= 0 ? state.currentStepIndex : undefined,
        steps: state.stepStatuses,
        events: eventBus.getRunHistory(state.currentRunId),
        pendingApprovals: state.pendingApprovals,
      };
    },

    reset: () => {
      abortController?.abort();
      isPaused = false;
      pendingResolvers.clear();
      set(initialState);
    },
  };
});

// ============================================================================
// useOrchestrator Hook
// ============================================================================

export interface UseOrchestratorOptions {
  onEvent?: (event: RuntimeEvent) => void;
  eventTypes?: RuntimeEvent['type'][];
}

export function useOrchestrator(options: UseOrchestratorOptions = {}) {
  const store = useOrchestratorStore();
  const { onEvent, eventTypes } = options;
  const eventBusRef = useRef<EventBus>(getEventBus());

  // Subscribe to events
  useEffect(() => {
    if (!onEvent) return;

    const eventBus = eventBusRef.current;
    let subscription: { unsubscribe: () => void };

    if (eventTypes && eventTypes.length > 0) {
      subscription = eventBus.onMany(eventTypes, onEvent);
    } else {
      subscription = eventBus.onAny(onEvent);
    }

    return () => subscription.unsubscribe();
  }, [onEvent, eventTypes]);

  // Subscribe to run-specific events
  const subscribeToRun = useCallback((runId: string, handler: (event: RuntimeEvent) => void) => {
    const eventBus = eventBusRef.current;
    return eventBus.onRun(runId, handler);
  }, []);

  // Create a task from simple description
  const createTask = useCallback((description: string, actions: Action[]): Task => {
    return {
      id: generateId(),
      description,
      actions,
      createdAt: Date.now(),
    };
  }, []);

  // Quick start for common tasks
  const startQuickRun = useCallback(async (description: string, actions: Action[]) => {
    const task = createTask(description, actions);
    return store.startRun(task);
  }, [createTask, store]);

  return {
    // State
    runId: store.currentRunId,
    state: store.runState,
    task: store.currentTask,
    steps: store.stepStatuses,
    currentStepIndex: store.currentStepIndex,
    isRunning: store.runState === 'RUNNING',
    isPaused: store.runState === 'PAUSED',
    isStopped: store.runState === 'STOPPED',
    isIdle: store.runState === 'IDLE',
    error: store.error,
    pendingApprovals: store.pendingApprovals,
    
    // Metrics
    completedSteps: store.completedSteps,
    failedSteps: store.failedSteps,
    totalSteps: store.stepStatuses.length,
    progress: store.stepStatuses.length > 0 
      ? (store.completedSteps / store.stepStatuses.length) * 100 
      : 0,

    // Actions
    startRun: store.startRun,
    pauseRun: store.pauseRun,
    resumeRun: store.resumeRun,
    stopRun: store.stopRun,
    approveAction: store.approveAction,
    denyAction: store.denyAction,
    getRunSummary: store.getRunSummary,
    reset: store.reset,

    // Helpers
    subscribeToRun,
    createTask,
    startQuickRun,

    // Event bus access
    eventBus: eventBusRef.current,
  };
}

export default useOrchestrator;
