/**
 * Run Store - Zustand State Management
 * 
 * Central state management for the Copilot Runtime:
 * - Current run state
 * - Step history
 * - Active approvals
 * - Event log
 * - UI-friendly selectors
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  RunState,
  RuntimeEvent,
  StepStatus,
  ApprovalRequest,
  Task,
  Action,
  RunSummary,
} from '../types/events';
import { EventBus, getEventBus, EventSubscription } from '../runtime/event-bus';
import { Orchestrator, getOrchestrator, RunContext } from '../runtime/orchestrator';

// ============================================================================
// Types
// ============================================================================

export interface RunStoreState {
  // Current state
  currentRunId: string | null;
  runState: RunState;
  
  // Run data
  runs: Map<string, RunSummary>;
  activeRun: RunSummary | null;
  
  // Steps
  currentStepIndex: number;
  steps: StepStatus[];
  
  // Approvals
  pendingApprovals: ApprovalRequest[];
  
  // Events
  events: RuntimeEvent[];
  maxEvents: number;
  
  // Queue
  queuedTasks: Task[];
  
  // UI state
  isLoading: boolean;
  error: string | null;
  userTakeover: boolean;
  
  // Actions
  startRun: (task: Task) => Promise<string>;
  pauseRun: (runId?: string) => boolean;
  resumeRun: (runId?: string) => boolean;
  stopRun: (runId?: string, immediate?: boolean) => boolean;
  
  approveAction: (approvalId: string) => boolean;
  denyAction: (approvalId: string, reason?: string) => boolean;
  
  setUserTakeover: (enabled: boolean) => void;
  clearError: () => void;
  clearEvents: () => void;
  
  // Subscriptions
  subscribeToEvents: () => () => void;
  
  // Internal
  _updateFromOrchestrator: () => void;
  _handleEvent: (event: RuntimeEvent) => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useRunStore = create<RunStoreState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    currentRunId: null,
    runState: 'IDLE',
    runs: new Map(),
    activeRun: null,
    currentStepIndex: 0,
    steps: [],
    pendingApprovals: [],
    events: [],
    maxEvents: 500,
    queuedTasks: [],
    isLoading: false,
    error: null,
    userTakeover: false,

    // --------------------------------------------------------------------------
    // Run Control Actions
    // --------------------------------------------------------------------------

    startRun: async (task: Task): Promise<string> => {
      const orchestrator = getOrchestrator();
      
      set({ isLoading: true, error: null });
      
      try {
        const runId = await orchestrator.start(task);
        
        set({
          currentRunId: runId,
          runState: 'RUNNING',
          isLoading: false,
        });
        
        get()._updateFromOrchestrator();
        
        return runId;
      } catch (error) {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to start run',
        });
        throw error;
      }
    },

    pauseRun: (runId?: string): boolean => {
      const orchestrator = getOrchestrator();
      const targetRunId = runId ?? get().currentRunId;
      
      if (!targetRunId) return false;
      
      const success = orchestrator.pause(targetRunId);
      if (success) {
        set({ runState: 'PAUSED' });
        get()._updateFromOrchestrator();
      }
      return success;
    },

    resumeRun: (runId?: string): boolean => {
      const orchestrator = getOrchestrator();
      const targetRunId = runId ?? get().currentRunId;
      
      if (!targetRunId) return false;
      
      const success = orchestrator.resume(targetRunId);
      if (success) {
        set({ runState: 'RUNNING' });
        get()._updateFromOrchestrator();
      }
      return success;
    },

    stopRun: (runId?: string, immediate: boolean = false): boolean => {
      const orchestrator = getOrchestrator();
      const targetRunId = runId ?? get().currentRunId;
      
      if (!targetRunId) return false;
      
      const success = orchestrator.stop(targetRunId, immediate);
      if (success) {
        set({ runState: 'STOPPED' });
        get()._updateFromOrchestrator();
      }
      return success;
    },

    // --------------------------------------------------------------------------
    // Approval Actions
    // --------------------------------------------------------------------------

    approveAction: (approvalId: string): boolean => {
      const orchestrator = getOrchestrator();
      const { currentRunId } = get();
      
      if (!currentRunId) return false;
      
      const success = orchestrator.approveAction(currentRunId, approvalId);
      if (success) {
        get()._updateFromOrchestrator();
      }
      return success;
    },

    denyAction: (approvalId: string, reason?: string): boolean => {
      const orchestrator = getOrchestrator();
      const { currentRunId } = get();
      
      if (!currentRunId) return false;
      
      const success = orchestrator.denyAction(currentRunId, approvalId, reason);
      if (success) {
        get()._updateFromOrchestrator();
      }
      return success;
    },

    // --------------------------------------------------------------------------
    // UI Actions
    // --------------------------------------------------------------------------

    setUserTakeover: (enabled: boolean): void => {
      const { currentRunId } = get();
      
      if (currentRunId) {
        const eventBus = getEventBus();
        eventBus.emit({
          id: `evt_${Date.now()}`,
          type: enabled ? 'USER_TAKEOVER_ON' : 'USER_TAKEOVER_OFF',
          timestamp: Date.now(),
          runId: currentRunId,
        });
      }
      
      set({ userTakeover: enabled });
    },

    clearError: (): void => {
      set({ error: null });
    },

    clearEvents: (): void => {
      set({ events: [] });
    },

    // --------------------------------------------------------------------------
    // Event Subscription
    // --------------------------------------------------------------------------

    subscribeToEvents: (): (() => void) => {
      const eventBus = getEventBus();
      
      const subscription = eventBus.onAny((event) => {
        get()._handleEvent(event);
      });
      
      // Also set up orchestrator state change listener
      const orchestrator = getOrchestrator();
      const unsubscribeState = orchestrator.onStateChange((runId, oldState, newState) => {
        if (runId === get().currentRunId) {
          set({ runState: newState });
          get()._updateFromOrchestrator();
        }
      });
      
      return () => {
        subscription.unsubscribe();
        unsubscribeState();
      };
    },

    // --------------------------------------------------------------------------
    // Internal Methods
    // --------------------------------------------------------------------------

    _updateFromOrchestrator: (): void => {
      const orchestrator = getOrchestrator();
      const { currentRunId } = get();
      
      if (!currentRunId) return;
      
      const run = orchestrator.getRun(currentRunId);
      if (!run) return;
      
      // Update steps
      const steps = [...run.steps];
      
      // Update pending approvals
      const pendingApprovals = Array.from(run.pendingApprovals.values()).filter(
        (a) => a.status === 'pending'
      );
      
      // Update queued tasks
      const queuedTasks = orchestrator.getQueuedTasks();
      
      // Create run summary
      const summary = createRunSummary(run, get().events);
      
      // Update runs map
      const runs = new Map(get().runs);
      runs.set(currentRunId, summary);
      
      set({
        steps,
        currentStepIndex: run.currentStepIndex,
        pendingApprovals,
        queuedTasks,
        runs,
        activeRun: summary,
      });
    },

    _handleEvent: (event: RuntimeEvent): void => {
      const { events, maxEvents, currentRunId } = get();
      
      // Add event to log
      const newEvents = [...events, event];
      if (newEvents.length > maxEvents) {
        newEvents.shift();
      }
      
      // Update state based on event type
      const updates: Partial<RunStoreState> = { events: newEvents };
      
      switch (event.type) {
        case 'RUN_STARTED':
          if (!currentRunId) {
            updates.currentRunId = event.runId;
            updates.runState = 'RUNNING';
          }
          break;
          
        case 'RUN_FINISHED':
        case 'RUN_FAILED':
        case 'STOPPED':
          if (event.runId === currentRunId) {
            updates.runState = 'STOPPED';
          }
          break;
          
        case 'RUN_PAUSED':
          if (event.runId === currentRunId) {
            updates.runState = 'PAUSED';
          }
          break;
          
        case 'RUN_RESUMED':
          if (event.runId === currentRunId) {
            updates.runState = 'RUNNING';
          }
          break;
          
        case 'STEP_STARTED':
          if (event.runId === currentRunId) {
            updates.currentStepIndex = event.stepIndex;
          }
          break;
          
        case 'NEEDS_APPROVAL':
          if (event.runId === currentRunId) {
            get()._updateFromOrchestrator();
          }
          break;
          
        case 'USER_TAKEOVER_ON':
          if (event.runId === currentRunId) {
            updates.userTakeover = true;
          }
          break;
          
        case 'USER_TAKEOVER_OFF':
          if (event.runId === currentRunId) {
            updates.userTakeover = false;
          }
          break;
      }
      
      set(updates);
      
      // Sync with orchestrator for step updates
      if (event.runId === currentRunId) {
        get()._updateFromOrchestrator();
      }
    },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

/**
 * Select if a run is currently active
 */
export const selectIsRunning = (state: RunStoreState): boolean =>
  state.runState === 'RUNNING';

/**
 * Select if a run is paused
 */
export const selectIsPaused = (state: RunStoreState): boolean =>
  state.runState === 'PAUSED';

/**
 * Select if there are pending approvals
 */
export const selectHasPendingApprovals = (state: RunStoreState): boolean =>
  state.pendingApprovals.length > 0;

/**
 * Select the current step being executed
 */
export const selectCurrentStep = (state: RunStoreState): StepStatus | null =>
  state.steps[state.currentStepIndex] ?? null;

/**
 * Select completed steps
 */
export const selectCompletedSteps = (state: RunStoreState): StepStatus[] =>
  state.steps.filter((s) => s.status === 'completed');

/**
 * Select failed steps
 */
export const selectFailedSteps = (state: RunStoreState): StepStatus[] =>
  state.steps.filter((s) => s.status === 'failed');

/**
 * Select progress percentage
 */
export const selectProgress = (state: RunStoreState): number => {
  if (state.steps.length === 0) return 0;
  const completed = state.steps.filter(
    (s) => s.status === 'completed' || s.status === 'failed' || s.status === 'skipped'
  ).length;
  return Math.round((completed / state.steps.length) * 100);
};

/**
 * Select recent events (last N)
 */
export const selectRecentEvents = (count: number) => (state: RunStoreState): RuntimeEvent[] =>
  state.events.slice(-count);

/**
 * Select events by type
 */
export const selectEventsByType = (type: RuntimeEvent['type']) => (state: RunStoreState): RuntimeEvent[] =>
  state.events.filter((e) => e.type === type);

/**
 * Select run duration
 */
export const selectRunDuration = (state: RunStoreState): number | null => {
  if (!state.activeRun) return null;
  const endTime = state.activeRun.endedAt ?? Date.now();
  return endTime - state.activeRun.startedAt;
};

// ============================================================================
// Helper Functions
// ============================================================================

function createRunSummary(run: RunContext, events: RuntimeEvent[]): RunSummary {
  const runEvents = events.filter((e) => e.runId === run.id);
  
  return {
    id: run.id,
    taskDescription: run.task.description,
    state: run.state,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    totalSteps: run.steps.length,
    completedSteps: run.steps.filter((s) => s.status === 'completed').length,
    failedSteps: run.steps.filter((s) => s.status === 'failed').length,
    skippedSteps: run.steps.filter((s) => s.status === 'skipped').length,
    currentStep: run.currentStepIndex,
    steps: [...run.steps],
    events: runEvents,
    pendingApprovals: Array.from(run.pendingApprovals.values()),
  };
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to subscribe to events on mount
 */
export function useEventSubscription(): void {
  const subscribeToEvents = useRunStore((state) => state.subscribeToEvents);
  
  // Subscribe on mount, unsubscribe on unmount
  // This should be called in a useEffect in a React component
}

/**
 * Hook to get current run controls
 */
export function useRunControls() {
  return useRunStore((state) => ({
    start: state.startRun,
    pause: state.pauseRun,
    resume: state.resumeRun,
    stop: state.stopRun,
    isRunning: state.runState === 'RUNNING',
    isPaused: state.runState === 'PAUSED',
    isStopped: state.runState === 'STOPPED',
    isIdle: state.runState === 'IDLE',
  }));
}

/**
 * Hook to get approval controls
 */
export function useApprovalControls() {
  return useRunStore((state) => ({
    approve: state.approveAction,
    deny: state.denyAction,
    pending: state.pendingApprovals,
    hasPending: state.pendingApprovals.length > 0,
  }));
}

/**
 * Hook to get step progress
 */
export function useStepProgress() {
  return useRunStore((state) => ({
    steps: state.steps,
    currentIndex: state.currentStepIndex,
    total: state.steps.length,
    completed: state.steps.filter((s) => s.status === 'completed').length,
    failed: state.steps.filter((s) => s.status === 'failed').length,
    progress: selectProgress(state),
  }));
}

// ============================================================================
// Store Initialization
// ============================================================================

/**
 * Initialize the store with event subscriptions
 * Call this once at app startup
 */
export function initializeRunStore(): () => void {
  const store = useRunStore.getState();
  return store.subscribeToEvents();
}
