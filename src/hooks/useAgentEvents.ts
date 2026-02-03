/**
 * useAgentEvents - Hook to connect SSE events to the agent store
 * 
 * Listens to SSE events from the chat endpoint and updates the agent store
 * with real-time status information.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useAgentStore, AgentEvent } from '@/stores/agentStore';

interface UseAgentEventsOptions {
  sessionId: string;
  enabled?: boolean;
}

export function useAgentEvents({ sessionId, enabled = true }: UseAgentEventsOptions) {
  const handleEvent = useAgentStore((state) => state.handleEvent);
  const createAgent = useAgentStore((state) => state.createAgent);
  const updateAgent = useAgentStore((state) => state.updateAgent);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Process incoming SSE events
  const processEvent = useCallback((eventType: string, data: Record<string, unknown>) => {
    const agentId = (data.agentId as string) || `agent_${sessionId}`;
    
    // Map SSE event types to agent events
    const event: AgentEvent = {
      type: eventType,
      agentId,
      sessionId,
      timestamp: Date.now(),
      data: { ...data, sessionId },
    };

    handleEvent(event);
  }, [sessionId, handleEvent]);

  // Parse SSE data
  const parseSSEData = useCallback((eventData: string): { type: string; data: Record<string, unknown> } | null => {
    try {
      // Handle different SSE formats
      if (eventData.startsWith('data:')) {
        const jsonStr = eventData.replace(/^data:\s*/, '').trim();
        if (!jsonStr || jsonStr === '[DONE]') return null;
        const parsed = JSON.parse(jsonStr);
        return {
          type: parsed.type || 'unknown',
          data: parsed,
        };
      }
      
      // Try parsing as JSON directly
      const parsed = JSON.parse(eventData);
      return {
        type: parsed.type || 'unknown',
        data: parsed,
      };
    } catch (e) {
      console.warn('[useAgentEvents] Failed to parse SSE data:', eventData);
      return null;
    }
  }, []);

  // Connect to SSE stream
  const connect = useCallback((url: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('[useAgentEvents] Connected to SSE stream');
    };

    eventSource.onmessage = (event) => {
      const parsed = parseSSEData(event.data);
      if (parsed) {
        processEvent(parsed.type, parsed.data);
      }
    };

    // Handle specific event types
    const eventTypes = [
      'planning_started',
      'planning_complete',
      'task_queued',
      'task_started',
      'task_progress',
      'task_complete',
      'task_error',
      'results_updated',
      'confidence_updated',
      'stopped',
      'complete',
      'error',
    ];

    for (const type of eventTypes) {
      eventSource.addEventListener(type, (event: MessageEvent) => {
        const parsed = parseSSEData(event.data);
        if (parsed) {
          processEvent(type, parsed.data);
        }
      });
    }

    eventSource.onerror = (error) => {
      console.error('[useAgentEvents] SSE error:', error);
      eventSource.close();
      eventSourceRef.current = null;
      
      // Reset agent state to idle on SSE disconnect
      // This prevents stuck "Planning" states
      const agentId = `agent_${sessionId}`;
      handleEvent({
        type: 'error',
        agentId,
        sessionId,
        timestamp: Date.now(),
        data: { 
          sessionId, 
          error: 'Connection lost. Please try again.',
          resetToIdle: true,
        },
      });
    };

    return eventSource;
  }, [parseSSEData, processEvent]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  return {
    connect,
    disconnect: () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    },
    isConnected: () => eventSourceRef.current?.readyState === EventSource.OPEN,
  };
}

/**
 * Process status updates from the chat hook and convert to agent events
 */
export function processStatusUpdate(
  sessionId: string,
  status: { type: string; message: string; metadata?: Record<string, unknown> },
  handleEvent: (event: AgentEvent) => void
) {
  const agentId = `agent_${sessionId}`;
  
  // Map status types to agent event types
  const typeMap: Record<string, string> = {
    thinking: 'planning_started',
    extracting: 'planning_started',
    executing: 'task_started',
    sourcing: 'task_started',
    signal_found: 'task_complete',
    pivot: 'pivot',
    decision: 'confidence_updated',
    complete: 'complete',
    error: 'error',
  };

  const eventType = typeMap[status.type] || status.type;

  const event: AgentEvent = {
    type: eventType,
    agentId,
    sessionId,
    timestamp: Date.now(),
    data: {
      ...status.metadata,
      message: status.message,
      originalType: status.type,
    },
  };

  handleEvent(event);
}

export default useAgentEvents;
