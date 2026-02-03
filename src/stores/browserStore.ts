/**
 * Browser Store
 * Zustand store for browser control state management
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import {
  browserBridge,
  BrowserState,
  BrowserBounds,
  AutomationStep,
  AutomationStepResult,
  BrowserViewConfig,
} from '../lib/browserBridge';

// ============================================================================
// Types
// ============================================================================

export type AutomationStatus = 'idle' | 'running' | 'paused' | 'stopped' | 'completed' | 'error';

export interface StepHistoryEntry {
  id: string;
  step: AutomationStep;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: number;
  endTime?: number;
  duration?: number;
  error?: string;
}

export interface BrowserStoreState {
  // Browser view state
  isCreated: boolean;
  url: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  bounds: BrowserBounds;
  lastScreenshot: string | null;

  // Automation state
  automationStatus: AutomationStatus;
  currentStepIndex: number;
  totalSteps: number;
  stepHistory: StepHistoryEntry[];
  automationError: string | null;

  // UI state
  isViewerVisible: boolean;
  isPanelExpanded: boolean;
}

export interface BrowserStoreActions {
  // Browser lifecycle
  createBrowser: (config?: BrowserViewConfig) => Promise<boolean>;
  destroyBrowser: () => Promise<boolean>;

  // Navigation
  navigate: (url: string) => Promise<boolean>;
  goBack: () => Promise<boolean>;
  goForward: () => Promise<boolean>;
  reload: () => Promise<boolean>;

  // Automation
  startAutomation: (steps: AutomationStep[]) => Promise<boolean>;
  pauseAutomation: () => void;
  resumeAutomation: () => void;
  stopAutomation: () => void;
  clearStepHistory: () => void;

  // Screenshots
  takeScreenshot: () => Promise<string | null>;

  // Bounds
  setBounds: (bounds: BrowserBounds) => Promise<boolean>;

  // State updates (internal)
  updateBrowserState: (state: Partial<BrowserState>) => void;
  updateStepStatus: (index: number, status: StepHistoryEntry['status'], error?: string) => void;
  setAutomationStatus: (status: AutomationStatus, error?: string) => void;

  // UI
  toggleViewer: () => void;
  togglePanel: () => void;
  setViewerVisible: (visible: boolean) => void;

  // Initialize event listeners
  initEventListeners: () => () => void;
}

export type BrowserStore = BrowserStoreState & BrowserStoreActions;

// ============================================================================
// Initial State
// ============================================================================

const initialState: BrowserStoreState = {
  // Browser view state
  isCreated: false,
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  bounds: { x: 0, y: 0, width: 800, height: 600 },
  lastScreenshot: null,

  // Automation state
  automationStatus: 'idle',
  currentStepIndex: -1,
  totalSteps: 0,
  stepHistory: [],
  automationError: null,

  // UI state
  isViewerVisible: true,
  isPanelExpanded: true,
};

// ============================================================================
// Store
// ============================================================================

export const useBrowserStore = create<BrowserStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========================================================================
    // Browser Lifecycle
    // ========================================================================

    createBrowser: async (config?: BrowserViewConfig) => {
      const result = await browserBridge.create(config);
      if (result.success) {
        set({ isCreated: true });
        return true;
      }
      console.error('Failed to create browser:', result.error);
      return false;
    },

    destroyBrowser: async () => {
      const result = await browserBridge.destroy();
      if (result.success) {
        set({
          isCreated: false,
          url: '',
          title: '',
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          lastScreenshot: null,
        });
        return true;
      }
      console.error('Failed to destroy browser:', result.error);
      return false;
    },

    // ========================================================================
    // Navigation
    // ========================================================================

    navigate: async (url: string) => {
      set({ isLoading: true });
      const result = await browserBridge.navigate(url);
      if (result.success) {
        set({ url });
        return true;
      }
      set({ isLoading: false });
      console.error('Failed to navigate:', result.error);
      return false;
    },

    goBack: async () => {
      const result = await browserBridge.back();
      return result.success;
    },

    goForward: async () => {
      const result = await browserBridge.forward();
      return result.success;
    },

    reload: async () => {
      set({ isLoading: true });
      const result = await browserBridge.reload();
      return result.success;
    },

    // ========================================================================
    // Automation
    // ========================================================================

    startAutomation: async (steps: AutomationStep[]) => {
      const { automationStatus } = get();

      // Can't start if already running
      if (automationStatus === 'running') {
        console.warn('Automation already running');
        return false;
      }

      // Initialize step history
      const stepHistory: StepHistoryEntry[] = steps.map((step, index) => ({
        id: `step-${index}-${Date.now()}`,
        step,
        status: 'pending' as const,
      }));

      set({
        automationStatus: 'running',
        currentStepIndex: 0,
        totalSteps: steps.length,
        stepHistory,
        automationError: null,
      });

      // Execute the sequence
      const result = await browserBridge.executeSequence(steps);

      if (result.success) {
        set({
          automationStatus: 'completed',
          currentStepIndex: steps.length - 1,
        });
        return true;
      } else {
        set({
          automationStatus: 'error',
          automationError: result.error || 'Unknown error',
        });
        return false;
      }
    },

    pauseAutomation: () => {
      const { automationStatus } = get();
      if (automationStatus === 'running') {
        set({ automationStatus: 'paused' });
      }
    },

    resumeAutomation: () => {
      const { automationStatus } = get();
      if (automationStatus === 'paused') {
        set({ automationStatus: 'running' });
      }
    },

    stopAutomation: () => {
      const { automationStatus, stepHistory, currentStepIndex } = get();
      if (automationStatus === 'running' || automationStatus === 'paused') {
        // Mark remaining steps as skipped
        const updatedHistory = stepHistory.map((entry, index) => {
          if (index > currentStepIndex && entry.status === 'pending') {
            return { ...entry, status: 'skipped' as const };
          }
          return entry;
        });

        set({
          automationStatus: 'stopped',
          stepHistory: updatedHistory,
        });
      }
    },

    clearStepHistory: () => {
      set({
        stepHistory: [],
        currentStepIndex: -1,
        totalSteps: 0,
        automationStatus: 'idle',
        automationError: null,
      });
    },

    // ========================================================================
    // Screenshots
    // ========================================================================

    takeScreenshot: async () => {
      const result = await browserBridge.screenshot();
      if (result.success && result.result) {
        set({ lastScreenshot: result.result });
        return result.result;
      }
      console.error('Failed to take screenshot:', result.error);
      return null;
    },

    // ========================================================================
    // Bounds
    // ========================================================================

    setBounds: async (bounds: BrowserBounds) => {
      const result = await browserBridge.setBounds(bounds);
      if (result.success) {
        set({ bounds });
        return true;
      }
      return false;
    },

    // ========================================================================
    // State Updates (internal, called by event listeners)
    // ========================================================================

    updateBrowserState: (state: Partial<BrowserState>) => {
      set((prev) => ({
        url: state.url ?? prev.url,
        title: state.title ?? prev.title,
        isLoading: state.isLoading ?? prev.isLoading,
        canGoBack: state.canGoBack ?? prev.canGoBack,
        canGoForward: state.canGoForward ?? prev.canGoForward,
      }));
    },

    updateStepStatus: (index: number, status: StepHistoryEntry['status'], error?: string) => {
      set((prev) => {
        const stepHistory = [...prev.stepHistory];
        if (stepHistory[index]) {
          const now = Date.now();
          stepHistory[index] = {
            ...stepHistory[index],
            status,
            error,
            ...(status === 'running' ? { startTime: now } : {}),
            ...(status === 'completed' || status === 'failed'
              ? {
                  endTime: now,
                  duration: stepHistory[index].startTime
                    ? now - stepHistory[index].startTime!
                    : undefined,
                }
              : {}),
          };
        }
        return { stepHistory, currentStepIndex: index };
      });
    },

    setAutomationStatus: (status: AutomationStatus, error?: string) => {
      set({
        automationStatus: status,
        automationError: error || null,
      });
    },

    // ========================================================================
    // UI
    // ========================================================================

    toggleViewer: () => {
      set((prev) => ({ isViewerVisible: !prev.isViewerVisible }));
    },

    togglePanel: () => {
      set((prev) => ({ isPanelExpanded: !prev.isPanelExpanded }));
    },

    setViewerVisible: (visible: boolean) => {
      set({ isViewerVisible: visible });
    },

    // ========================================================================
    // Event Listeners
    // ========================================================================

    initEventListeners: () => {
      const { updateBrowserState, updateStepStatus } = get();

      // Subscribe to browser state changes
      const unsubStateChanged = browserBridge.onStateChanged((state) => {
        updateBrowserState(state);
      });

      // Subscribe to step started events
      const unsubStepStarted = browserBridge.onStepStarted((event) => {
        updateStepStatus(event.index, 'running');
      });

      // Subscribe to step completed events
      const unsubStepCompleted = browserBridge.onStepCompleted((event) => {
        const status = event.result.success ? 'completed' : 'failed';
        updateStepStatus(event.index, status, event.result.error);
      });

      // Return cleanup function
      return () => {
        unsubStateChanged();
        unsubStepStarted();
        unsubStepCompleted();
      };
    },
  }))
);

// ============================================================================
// Selectors
// ============================================================================

export const selectBrowserState = (state: BrowserStore) => ({
  url: state.url,
  title: state.title,
  isLoading: state.isLoading,
  canGoBack: state.canGoBack,
  canGoForward: state.canGoForward,
});

export const selectAutomationState = (state: BrowserStore) => ({
  status: state.automationStatus,
  currentStep: state.currentStepIndex,
  totalSteps: state.totalSteps,
  error: state.automationError,
});

export const selectStepHistory = (state: BrowserStore) => state.stepHistory;

export const selectCurrentStep = (state: BrowserStore) => {
  const { stepHistory, currentStepIndex } = state;
  return currentStepIndex >= 0 ? stepHistory[currentStepIndex] : null;
};

export const selectIsAutomationRunning = (state: BrowserStore) =>
  state.automationStatus === 'running';

export const selectCanStartAutomation = (state: BrowserStore) =>
  state.isCreated && (state.automationStatus === 'idle' || state.automationStatus === 'completed' || state.automationStatus === 'stopped' || state.automationStatus === 'error');

// ============================================================================
// Export
// ============================================================================

export default useBrowserStore;
