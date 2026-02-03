/**
 * EXECUTION CONTEXT
 * 
 * React context for managing task graph execution state.
 * This is the bridge between the backend execution engine and the UI.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// ============================================
// TYPES (mirrors backend schemas)
// ============================================

export type GoalType = 'prospect' | 'campaign' | 'research' | 'email' | 'meeting' | 'enrich' | 'analyze';
export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'blocked' | 'skipped';
export type GraphStatus = 'compiling' | 'ready' | 'running' | 'paused' | 'completed' | 'failed';

export interface TaskNode {
  id: string;
  type: string;
  description: string;
  status: TaskStatus;
  progressPercent?: number;
  currentAction?: string;
  outputs?: Record<string, any>;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface Goal {
  id: string;
  type: GoalType;
  objective: string;
  constraints: Record<string, any>;
  locked: boolean;
  missingFields?: string[];
}

export interface TaskGraph {
  id: string;
  goal: Goal;
  tasks: TaskNode[];
  status: GraphStatus;
  currentTaskId?: string;
  completedTasks: number;
  totalTasks: number;
  outputs?: Record<string, any>;
  startedAt?: string;
  completedAt?: string;
}

export interface ExecutionEvent {
  timestamp: string;
  eventType: string;
  graphId?: string;
  taskId?: string;
  tool?: string;
  details?: Record<string, any>;
}

// ============================================
// CONTEXT
// ============================================

interface ExecutionContextType {
  // Current execution state
  activeGraph: TaskGraph | null;
  isExecuting: boolean;
  events: ExecutionEvent[];
  
  // Actions
  startExecution: (message: string, context?: Record<string, any>) => Promise<void>;
  pauseExecution: () => Promise<void>;
  resumeExecution: () => Promise<void>;
  stopExecution: () => Promise<void>;
  
  // Queries
  getTaskProgress: (taskId: string) => number;
  getCurrentTask: () => TaskNode | null;
  getCompletedOutputs: () => Record<string, any>;
  
  // UI helpers
  clearEvents: () => void;
}

const ExecutionContext = createContext<ExecutionContextType | null>(null);

export function useExecution() {
  const context = useContext(ExecutionContext);
  if (!context) {
    throw new Error('useExecution must be used within ExecutionProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

export function ExecutionProvider({ children }: { children: React.ReactNode }) {
  const { user, session } = useAuth();
  const [activeGraph, setActiveGraph] = useState<TaskGraph | null>(null);
  const [events, setEvents] = useState<ExecutionEvent[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Start task graph execution
  const startExecution = useCallback(async (message: string, context?: Record<string, any>) => {
    if (!session?.access_token) return;
    
    setIsExecuting(true);
    setEvents([]);
    
    try {
      // Use SSE for streaming execution updates
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            useTaskGraph: true,
            context,
          }),
        }
      );
      
      const result = await response.json();
      
      if (result.success) {
        setActiveGraph({
          id: result.graphId,
          goal: result.goal,
          tasks: result.tasks || [],
          status: result.status,
          completedTasks: result.tasks?.filter((t: TaskNode) => t.status === 'completed').length || 0,
          totalTasks: result.tasks?.length || 0,
          outputs: result.outputs,
        });
        
        // Add completion event
        setEvents(prev => [...prev, {
          timestamp: new Date().toISOString(),
          eventType: 'task_completed',
          graphId: result.graphId,
          details: { status: result.status },
        }]);
      } else {
        // Handle goal clarification needed
        if (result.missingFields || result.clarifyingQuestions) {
          setActiveGraph({
            id: 'pending',
            goal: {
              id: 'pending',
              type: 'prospect',
              objective: message,
              constraints: {},
              locked: false,
              missingFields: result.missingFields,
            },
            tasks: [],
            status: 'compiling',
            completedTasks: 0,
            totalTasks: 0,
          });
        }
      }
    } catch (error) {
      console.error('[ExecutionContext] Start execution error:', error);
      setEvents(prev => [...prev, {
        timestamp: new Date().toISOString(),
        eventType: 'error',
        details: { error: String(error) },
      }]);
    } finally {
      setIsExecuting(false);
    }
  }, [session?.access_token]);

  // Pause execution
  const pauseExecution = useCallback(async () => {
    if (!activeGraph || !session?.access_token) return;
    
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'pause',
            campaign_id: activeGraph.id,
          }),
        }
      );
      
      setActiveGraph(prev => prev ? { ...prev, status: 'paused' } : null);
    } catch (error) {
      console.error('[ExecutionContext] Pause error:', error);
    }
  }, [activeGraph, session?.access_token]);

  // Resume execution
  const resumeExecution = useCallback(async () => {
    if (!activeGraph || !session?.access_token) return;
    
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'resume',
            campaign_id: activeGraph.id,
          }),
        }
      );
      
      setActiveGraph(prev => prev ? { ...prev, status: 'running' } : null);
    } catch (error) {
      console.error('[ExecutionContext] Resume error:', error);
    }
  }, [activeGraph, session?.access_token]);

  // Stop execution
  const stopExecution = useCallback(async () => {
    if (!activeGraph || !session?.access_token) return;
    
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'stop',
            campaign_id: activeGraph.id,
          }),
        }
      );
      
      setActiveGraph(null);
      setIsExecuting(false);
    } catch (error) {
      console.error('[ExecutionContext] Stop error:', error);
    }
  }, [activeGraph, session?.access_token]);

  // Get task progress
  const getTaskProgress = useCallback((taskId: string): number => {
    const task = activeGraph?.tasks.find(t => t.id === taskId);
    if (!task) return 0;
    if (task.status === 'completed') return 100;
    if (task.status === 'running') return task.progressPercent || 50;
    return 0;
  }, [activeGraph]);

  // Get current task
  const getCurrentTask = useCallback((): TaskNode | null => {
    if (!activeGraph) return null;
    return activeGraph.tasks.find(t => t.status === 'running') || null;
  }, [activeGraph]);

  // Get completed outputs
  const getCompletedOutputs = useCallback((): Record<string, any> => {
    if (!activeGraph) return {};
    
    const outputs: Record<string, any> = {};
    activeGraph.tasks
      .filter(t => t.status === 'completed' && t.outputs)
      .forEach(t => Object.assign(outputs, t.outputs));
    
    return outputs;
  }, [activeGraph]);

  // Clear events
  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return (
    <ExecutionContext.Provider
      value={{
        activeGraph,
        isExecuting,
        events,
        startExecution,
        pauseExecution,
        resumeExecution,
        stopExecution,
        getTaskProgress,
        getCurrentTask,
        getCompletedOutputs,
        clearEvents,
      }}
    >
      {children}
    </ExecutionContext.Provider>
  );
}
