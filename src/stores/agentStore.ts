/**
 * Agent Store - Zustand store for managing agent state in the UI
 * 
 * Tracks:
 * - Active agents per session
 * - Real-time status updates
 * - Task progress
 * - Results and confidence
 */

import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';

// ============================================
// STOP COOLDOWN - Ignore planning events for a few seconds after stop
// ============================================
const stopCooldowns = new Map<string, number>();
const STOP_COOLDOWN_MS = 10000; // Ignore planning events for 10s after stop

function isInStopCooldown(sessionId: string): boolean {
  const stopTime = stopCooldowns.get(sessionId);
  if (!stopTime) return false;
  const elapsed = Date.now() - stopTime;
  if (elapsed > STOP_COOLDOWN_MS) {
    stopCooldowns.delete(sessionId);
    return false;
  }
  return true;
}

function setStopCooldown(sessionId: string): void {
  stopCooldowns.set(sessionId, Date.now());
}

// ============================================
// TYPES
// ============================================

export type AgentState = 
  | 'idle'
  | 'planning'
  | 'running'
  | 'complete'
  | 'stopped'
  | 'error';

export interface AgentTask {
  id: string;
  source: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'cancelled';
  progress?: number;
  message?: string;
  resultCount?: number;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface AgentResult {
  id: string;
  type: 'person' | 'company' | 'insight';
  name: string;
  title?: string;
  company?: string;
  email?: string;
  source: string;
  confidence: number;
}

export interface AgentStatus {
  id: string;
  sessionId: string;
  state: AgentState;
  startTime: number;
  runtimeMs: number;
  confidence: number;
  resultCount: number;
  
  // Current activity
  currentPhase?: string;
  currentMessage?: string;
  
  // Step progress (Priority 0.1 - shows execution progress)
  steps: Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  }>;
  currentStepIndex: number;
  
  // Tasks
  tasks: AgentTask[];
  activeTasks: number;
  queuedTasks: number;
  
  // Results
  results: AgentResult[];
  
  // Planning
  plan?: {
    questionType: string;
    sources: string[];
    targetResults: number;
    confidenceThreshold: number;
  };
  
  // Errors
  errors: string[];
}

export interface AgentStoreState {
  // Active agents by session ID
  agents: Map<string, AgentStatus>;
  
  // Currently focused agent
  activeSessionId: string | null;
  
  // Global event log (for debugging)
  eventLog: AgentEvent[];
  maxEventLogSize: number;
  
  // Actions
  setActiveSession: (sessionId: string | null) => void;
  
  // Agent lifecycle
  createAgent: (sessionId: string, agentId: string) => void;
  updateAgent: (sessionId: string, updates: Partial<AgentStatus>) => void;
  removeAgent: (sessionId: string) => void;
  
  // Task updates
  addTask: (sessionId: string, task: AgentTask) => void;
  updateTask: (sessionId: string, taskId: string, updates: Partial<AgentTask>) => void;
  
  // Result updates
  addResults: (sessionId: string, results: AgentResult[]) => void;
  
  // Event handling
  handleEvent: (event: AgentEvent) => void;
  
  // Stop agent
  requestStop: (sessionId: string) => Promise<void>;
  
  // Selectors
  getAgent: (sessionId: string) => AgentStatus | undefined;
  getActiveAgent: () => AgentStatus | undefined;
  isAgentRunning: (sessionId: string) => boolean;
  
  // Cleanup
  clearAgentForSession: (sessionId: string) => void;
  resetAllAgents: () => void;
}

export interface AgentEvent {
  type: string;
  agentId: string;
  sessionId?: string;
  timestamp: number;
  data: Record<string, unknown>;
}

// ============================================
// DEFAULT VALUES
// ============================================

const createDefaultAgent = (sessionId: string, agentId: string): AgentStatus => ({
  id: agentId,
  sessionId,
  state: 'idle',
  startTime: 0,
  runtimeMs: 0,
  confidence: 0,
  resultCount: 0,
  steps: [],
  currentStepIndex: 0,
  tasks: [],
  activeTasks: 0,
  queuedTasks: 0,
  results: [],
  errors: [],
});

// ============================================
// STORE
// ============================================

export const useAgentStore = create<AgentStoreState>()(
  persist(
    subscribeWithSelector((set, get) => ({
    agents: new Map(),
    activeSessionId: null,
    eventLog: [],
    maxEventLogSize: 100,

    setActiveSession: (sessionId) => {
      set({ activeSessionId: sessionId });
    },

    createAgent: (sessionId, agentId) => {
      set((state) => {
        const agents = new Map(state.agents);
        agents.set(sessionId, createDefaultAgent(sessionId, agentId));
        return { agents };
      });
    },

    updateAgent: (sessionId, updates) => {
      set((state) => {
        const agents = new Map(state.agents);
        const existing = agents.get(sessionId);
        if (existing) {
          agents.set(sessionId, { ...existing, ...updates });
        }
        return { agents };
      });
    },

    removeAgent: (sessionId) => {
      set((state) => {
        const agents = new Map(state.agents);
        agents.delete(sessionId);
        return { agents };
      });
    },

    addTask: (sessionId, task) => {
      set((state) => {
        const agents = new Map(state.agents);
        const agent = agents.get(sessionId);
        if (agent) {
          const tasks = [...agent.tasks, task];
          const queuedTasks = tasks.filter(t => t.status === 'pending').length;
          const activeTasks = tasks.filter(t => t.status === 'running').length;
          agents.set(sessionId, { ...agent, tasks, queuedTasks, activeTasks });
        }
        return { agents };
      });
    },

    updateTask: (sessionId, taskId, updates) => {
      set((state) => {
        const agents = new Map(state.agents);
        const agent = agents.get(sessionId);
        if (agent) {
          const tasks = agent.tasks.map(t => 
            t.id === taskId ? { ...t, ...updates } : t
          );
          const queuedTasks = tasks.filter(t => t.status === 'pending').length;
          const activeTasks = tasks.filter(t => t.status === 'running').length;
          agents.set(sessionId, { ...agent, tasks, queuedTasks, activeTasks });
        }
        return { agents };
      });
    },

    addResults: (sessionId, newResults) => {
      set((state) => {
        const agents = new Map(state.agents);
        const agent = agents.get(sessionId);
        if (agent) {
          const results = [...agent.results, ...newResults];
          agents.set(sessionId, { 
            ...agent, 
            results, 
            resultCount: results.length 
          });
        }
        return { agents };
      });
    },

    handleEvent: (event) => {
      const { type, agentId, data } = event;
      const sessionId = (data as any).sessionId || event.sessionId || get().activeSessionId;
      
      if (!sessionId) return;

      // Add to event log
      set((state) => ({
        eventLog: [
          event,
          ...state.eventLog.slice(0, state.maxEventLogSize - 1)
        ]
      }));

      // Auto-create agent if it doesn't exist (on any event)
      const agents = get().agents;
      if (!agents.has(sessionId)) {
        get().createAgent(sessionId, agentId || `agent_${sessionId}`);
      }

      // Handle specific event types
      switch (type) {
        case 'agent_created':
          // Already handled by auto-create above
          break;

        case 'planning_started':
          // Ignore planning events during stop cooldown
          if (isInStopCooldown(sessionId)) {
            console.log('[AgentStore] Ignoring planning_started during stop cooldown');
            return;
          }
          // Use message if available, fallback to question, then to default
          const planningMessage = (data as any).message || 
            ((data as any).question ? `Analyzing: "${(data as any).question.substring(0, 50)}..."` : 
            'Analyzing your request...');
          get().updateAgent(sessionId, {
            state: 'planning',
            startTime: Date.now(),
            currentPhase: 'planning',
            currentMessage: planningMessage,
          });
          break;

        case 'planning_complete':
          const plan = (data as any).plan;
          get().updateAgent(sessionId, {
            state: 'running',
            currentPhase: 'executing',
            plan: plan ? {
              questionType: plan.questionType,
              sources: plan.sourcePriority?.map((s: any) => s.source) || [],
              targetResults: plan.targetResults,
              confidenceThreshold: plan.confidenceThreshold,
            } : undefined,
          });
          break;

        case 'task_queued':
          get().addTask(sessionId, {
            id: (data as any).task.id,
            source: (data as any).task.source,
            status: 'pending',
          });
          break;

        case 'task_started':
          get().updateTask(sessionId, (data as any).taskId, {
            status: 'running',
            startedAt: Date.now(),
          });
          get().updateAgent(sessionId, {
            currentMessage: `Searching ${(data as any).source}...`,
          });
          break;

        case 'task_progress':
          get().updateTask(sessionId, (data as any).taskId, {
            progress: (data as any).progress,
            message: (data as any).message,
          });
          break;

        case 'task_complete':
          get().updateTask(sessionId, (data as any).taskId, {
            status: 'complete',
            resultCount: (data as any).resultCount,
            completedAt: Date.now(),
          });
          break;

        case 'task_error':
          get().updateTask(sessionId, (data as any).taskId, {
            status: 'error',
            error: (data as any).error,
            completedAt: Date.now(),
          });
          break;

        case 'results_updated':
          get().updateAgent(sessionId, {
            resultCount: (data as any).totalResults,
          });
          break;

        case 'confidence_updated':
          get().updateAgent(sessionId, {
            confidence: (data as any).confidence,
          });
          break;

        // Step progress events (Priority 0.1)
        case 'steps_initialized':
          get().updateAgent(sessionId, {
            steps: (data as any).steps || [],
            currentStepIndex: 0,
          });
          break;

        case 'step_started':
          const stepIndex = (data as any).stepIndex ?? 0;
          const agent = get().agents.get(sessionId);
          if (agent && agent.steps[stepIndex]) {
            const newSteps = [...agent.steps];
            newSteps[stepIndex] = { ...newSteps[stepIndex], status: 'running' };
            get().updateAgent(sessionId, {
              steps: newSteps,
              currentStepIndex: stepIndex,
              currentMessage: `Step ${stepIndex + 1}/${newSteps.length}: ${newSteps[stepIndex].name}`,
            });
          }
          break;

        case 'step_completed':
          const completedIndex = (data as any).stepIndex ?? 0;
          const agentForComplete = get().agents.get(sessionId);
          if (agentForComplete && agentForComplete.steps[completedIndex]) {
            const newSteps = [...agentForComplete.steps];
            newSteps[completedIndex] = { ...newSteps[completedIndex], status: 'complete' };
            get().updateAgent(sessionId, {
              steps: newSteps,
            });
          }
          break;

        case 'step_failed':
          const failedIndex = (data as any).stepIndex ?? 0;
          const agentForFail = get().agents.get(sessionId);
          if (agentForFail && agentForFail.steps[failedIndex]) {
            const newSteps = [...agentForFail.steps];
            newSteps[failedIndex] = { ...newSteps[failedIndex], status: 'failed' };
            get().updateAgent(sessionId, {
              steps: newSteps,
            });
          }
          break;

        // ============================================
        // JOB LIFECYCLE EVENTS (Lovable-style)
        // ============================================
        
        case 'job_created':
          // Ignore job_created events during stop cooldown
          if (isInStopCooldown(sessionId)) {
            console.log('[AgentStore] Ignoring job_created during stop cooldown');
            return;
          }
          get().updateAgent(sessionId, {
            state: 'planning',
            startTime: Date.now(),
            currentPhase: 'creating job',
            currentMessage: `Starting: ${(data as any).goal?.objective || 'New task'}`,
            steps: (data as any).steps || [],
            currentStepIndex: 0,
          });
          break;

        case 'job_started':
          get().updateAgent(sessionId, {
            state: 'running',
            startTime: Date.now(),
            currentPhase: 'executing',
            currentMessage: 'Job started - running steps...',
          });
          break;

        case 'job_stopped':
          get().updateAgent(sessionId, {
            state: 'stopped',
            currentPhase: 'stopped',
            currentMessage: `Stopped: ${(data as any).reason || 'User requested'}`,
          });
          break;

        case 'job_complete':
          get().updateAgent(sessionId, {
            state: 'complete',
            currentPhase: 'complete',
            currentMessage: `Complete! Found ${(data as any).resultsCount || 0} results`,
            resultCount: (data as any).resultsCount || 0,
          });
          break;

        case 'job_failed':
          get().updateAgent(sessionId, {
            state: 'error',
            currentPhase: 'failed',
            currentMessage: `Failed: ${(data as any).error || 'Unknown error'}`,
            errors: [...(get().agents.get(sessionId)?.errors || []), (data as any).error],
          });
          break;

        case 'stopped':
          get().updateAgent(sessionId, {
            state: 'stopped',
            currentPhase: 'stopped',
            currentMessage: (data as any).reason,
          });
          break;

        case 'complete':
          get().updateAgent(sessionId, {
            state: 'complete',
            currentPhase: 'complete',
            currentMessage: (data as any).summary,
            confidence: (data as any).confidence,
            resultCount: (data as any).resultCount,
          });
          break;

        case 'error':
          // If resetToIdle flag is set (SSE disconnect), go back to idle
          if ((data as any).resetToIdle) {
            get().updateAgent(sessionId, {
              state: 'idle',
              currentPhase: undefined,
              currentMessage: undefined,
            });
          } else {
            get().updateAgent(sessionId, {
              state: 'error',
              currentPhase: 'error',
              currentMessage: (data as any).error,
              errors: [...(get().agents.get(sessionId)?.errors || []), (data as any).error],
            });
          }
          break;
      }
    },

    requestStop: async (sessionId) => {
      // Set cooldown to ignore incoming planning events
      setStopCooldown(sessionId);
      
      // IMMEDIATELY reset to idle - don't wait for backend
      // This is critical for UX when backend is stuck/unreachable
      get().updateAgent(sessionId, {
        state: 'idle',
        currentMessage: undefined,
        currentPhase: undefined,
        startTime: 0,
      });
      console.log('[AgentStore] Stop requested - immediately reset to idle, cooldown active');
      
      // Send stop request to backend (fire and forget)
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lnfkmfjlbisdikwmjxdy.supabase.co';
        const authToken = localStorage.getItem('sb-lnfkmfjlbisdikwmjxdy-auth-token');
        let accessToken = '';
        
        if (authToken) {
          try {
            const parsed = JSON.parse(authToken);
            accessToken = parsed.access_token || '';
          } catch {
            console.warn('[AgentStore] Failed to parse auth token');
          }
        }
        
        if (accessToken) {
          // Don't await - fire and forget
          fetch(`${supabaseUrl}/functions/v1/capy-chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'task.stop',
              sessionId,
            }),
          }).then(response => {
            if (response.ok) {
              console.log('[AgentStore] Backend stop request acknowledged');
            }
          }).catch(err => {
            console.warn('[AgentStore] Backend stop request failed (ignored):', err);
          });
        }
      } catch (error) {
        console.error('[AgentStore] Failed to send stop request:', error);
        // Already reset to idle above, so no further action needed
      }
    },

    getAgent: (sessionId) => {
      return get().agents.get(sessionId);
    },

    getActiveAgent: () => {
      const { activeSessionId, agents } = get();
      if (!activeSessionId) return undefined;
      return agents.get(activeSessionId);
    },

    isAgentRunning: (sessionId) => {
      const agent = get().agents.get(sessionId);
      return agent?.state === 'running' || agent?.state === 'planning';
    },

    // Clear agent for a specific session (call when switching sessions)
    clearAgentForSession: (sessionId: string) => {
      set((state) => {
        const agents = new Map(state.agents);
        agents.delete(sessionId);
        return { agents };
      });
    },

    // Reset all agents (call on logout or hard reset)
    resetAllAgents: () => {
      set({ agents: new Map(), activeSessionId: null, eventLog: [] });
    },
  })),
  {
    name: 'capy-agent-store',
    // Custom storage to handle Map serialization
    storage: {
      getItem: (name) => {
        const str = localStorage.getItem(name);
        if (!str) return null;
        const parsed = JSON.parse(str);
        // Convert agents array back to Map
        if (parsed.state?.agents) {
          parsed.state.agents = new Map(parsed.state.agents);
        }
        return parsed;
      },
      setItem: (name, value) => {
        // Convert agents Map to array for JSON serialization
        const toStore = {
          ...value,
          state: {
            ...value.state,
            agents: value.state.agents ? Array.from(value.state.agents.entries()) : [],
            // Don't persist event log (too large)
            eventLog: [],
          },
        };
        localStorage.setItem(name, JSON.stringify(toStore));
      },
      removeItem: (name) => localStorage.removeItem(name),
    },
    // Only persist essential state
    partialize: (state) => ({
      agents: state.agents,
      activeSessionId: state.activeSessionId,
    }),
  }
  )
);

// ============================================
// SELECTORS
// ============================================

export const selectActiveAgent = (state: AgentStoreState) => 
  state.activeSessionId ? state.agents.get(state.activeSessionId) : undefined;

export const selectAgentTasks = (sessionId: string) => (state: AgentStoreState) =>
  state.agents.get(sessionId)?.tasks || [];

export const selectAgentResults = (sessionId: string) => (state: AgentStoreState) =>
  state.agents.get(sessionId)?.results || [];

export const selectIsRunning = (sessionId: string) => (state: AgentStoreState) => {
  const agent = state.agents.get(sessionId);
  return agent?.state === 'running' || agent?.state === 'planning';
};
