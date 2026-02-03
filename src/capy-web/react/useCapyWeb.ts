// ============================================================================
// CAPY WEB - REACT HOOK
// Hook for using Capy Web in React applications
// ============================================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  CapyWebEngine,
  createCapyWeb,
  CapyWebConfig,
  CapyWebResult,
  ProgressState,
  TelemetryEvent,
  OperatorMode,
  ExecutionStatus
} from '../index';

// ============================================================================
// HOOK STATE
// ============================================================================

export interface UseCapyWebState {
  // Status
  isResearching: boolean;
  isPaused: boolean;
  status: ExecutionStatus;
  
  // Progress
  progress: ProgressState | null;
  
  // Results
  result: CapyWebResult | null;
  error: Error | null;
  
  // Telemetry
  events: TelemetryEvent[];
}

export interface UseCapyWebActions {
  research: (query: string, options?: ResearchOptions) => Promise<CapyWebResult>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  reset: () => void;
}

export interface ResearchOptions {
  mode?: OperatorMode;
  confidenceThreshold?: number;
  maxTimeMs?: number;
  maxPages?: number;
  knownDomains?: string[];
}

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useCapyWeb(
  config?: Partial<CapyWebConfig>
): [UseCapyWebState, UseCapyWebActions] {
  // State
  const [state, setState] = useState<UseCapyWebState>({
    isResearching: false,
    isPaused: false,
    status: ExecutionStatus.IDLE,
    progress: null,
    result: null,
    error: null,
    events: []
  });
  
  // Engine ref
  const engineRef = useRef<CapyWebEngine | null>(null);
  const browserContextRef = useRef<unknown>(null);
  
  // Initialize engine
  useEffect(() => {
    engineRef.current = createCapyWeb(config);
    
    return () => {
      engineRef.current?.stop();
    };
  }, []);
  
  // Research action
  const research = useCallback(async (
    query: string,
    options?: ResearchOptions
  ): Promise<CapyWebResult> => {
    if (!engineRef.current) {
      throw new Error('Engine not initialized');
    }
    
    // Reset state
    setState(prev => ({
      ...prev,
      isResearching: true,
      isPaused: false,
      status: ExecutionStatus.PLANNING,
      progress: null,
      result: null,
      error: null,
      events: []
    }));
    
    // Set up callbacks
    engineRef.current.onProgress((progress) => {
      setState(prev => ({
        ...prev,
        progress,
        status: progress.status
      }));
    });
    
    engineRef.current.onEvent((event) => {
      setState(prev => ({
        ...prev,
        events: [...prev.events, event]
      }));
    });
    
    try {
      // Get or create browser context
      if (!browserContextRef.current) {
        // In browser environment, we'll use a mock or web-based approach
        // For now, this is a placeholder - real implementation would
        // connect to a browser automation service
        throw new Error(
          'Browser context not available. Capy Web requires a Playwright browser context. ' +
          'In browser environments, use the /api/capy-web endpoint instead.'
        );
      }
      
      engineRef.current.setBrowserContext(browserContextRef.current);
      
      const result = await engineRef.current.research({
        query,
        confidenceRequirement: options?.confidenceThreshold,
        knownDomains: options?.knownDomains,
        constraints: {
          mode: options?.mode,
          maxTimeMs: options?.maxTimeMs,
          maxPages: options?.maxPages
        }
      });
      
      setState(prev => ({
        ...prev,
        isResearching: false,
        status: ExecutionStatus.COMPLETED,
        result
      }));
      
      return result;
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      setState(prev => ({
        ...prev,
        isResearching: false,
        status: ExecutionStatus.FAILED,
        error: err
      }));
      
      throw err;
    }
  }, []);
  
  // Pause action
  const pause = useCallback(() => {
    engineRef.current?.pause();
    setState(prev => ({
      ...prev,
      isPaused: true,
      status: ExecutionStatus.PAUSED
    }));
  }, []);
  
  // Resume action
  const resume = useCallback(() => {
    engineRef.current?.resume();
    setState(prev => ({
      ...prev,
      isPaused: false,
      status: ExecutionStatus.EXECUTING
    }));
  }, []);
  
  // Stop action
  const stop = useCallback(() => {
    engineRef.current?.stop();
    setState(prev => ({
      ...prev,
      isResearching: false,
      isPaused: false,
      status: ExecutionStatus.COMPLETED
    }));
  }, []);
  
  // Reset action
  const reset = useCallback(() => {
    engineRef.current?.stop();
    setState({
      isResearching: false,
      isPaused: false,
      status: ExecutionStatus.IDLE,
      progress: null,
      result: null,
      error: null,
      events: []
    });
  }, []);
  
  return [
    state,
    { research, pause, resume, stop, reset }
  ];
}

// ============================================================================
// SIMPLIFIED HOOK FOR BASIC USAGE
// ============================================================================

export interface UseCapyWebSimpleResult {
  research: (query: string) => Promise<CapyWebResult>;
  isLoading: boolean;
  progress: number;
  result: CapyWebResult | null;
  error: Error | null;
  stop: () => void;
}

export function useCapyWebSimple(): UseCapyWebSimpleResult {
  const [state, actions] = useCapyWeb();
  
  return {
    research: (query: string) => actions.research(query),
    isLoading: state.isResearching,
    progress: state.progress?.confidence ?? 0,
    result: state.result,
    error: state.error,
    stop: actions.stop
  };
}

// ============================================================================
// SERVER-SIDE HOOK (for API calls)
// ============================================================================

export interface UseCapyWebAPIOptions {
  apiEndpoint?: string;
  apiKey?: string;
}

export function useCapyWebAPI(options?: UseCapyWebAPIOptions) {
  const [state, setState] = useState<{
    isLoading: boolean;
    progress: ProgressState | null;
    result: CapyWebResult | null;
    error: Error | null;
  }>({
    isLoading: false,
    progress: null,
    result: null,
    error: null
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  
  const research = useCallback(async (
    query: string,
    researchOptions?: ResearchOptions
  ): Promise<CapyWebResult> => {
    setState(prev => ({
      ...prev,
      isLoading: true,
      progress: null,
      result: null,
      error: null
    }));
    
    abortControllerRef.current = new AbortController();
    
    try {
      const endpoint = options?.apiEndpoint || '/api/capy-web/research';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options?.apiKey ? { 'Authorization': `Bearer ${options.apiKey}` } : {})
        },
        body: JSON.stringify({
          query,
          ...researchOptions
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }
      
      // Handle streaming response if available
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let result: CapyWebResult | null = null;
        
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const text = decoder.decode(value);
          const lines = text.split('\n');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setState(prev => ({ ...prev, progress: data.progress }));
              } else if (data.type === 'result') {
                result = data.result;
              }
            }
          }
        }
        
        if (result) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            result
          }));
          return result;
        }
        
        throw new Error('No result received from stream');
        
      } else {
        // Regular JSON response
        const result = await response.json();
        
        setState(prev => ({
          ...prev,
          isLoading: false,
          result
        }));
        
        return result;
      }
      
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        setState(prev => ({ ...prev, isLoading: false }));
        throw error;
      }
      
      const err = error instanceof Error ? error : new Error(String(error));
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: err
      }));
      throw err;
    }
  }, [options?.apiEndpoint, options?.apiKey]);
  
  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);
  
  return {
    ...state,
    research,
    stop
  };
}
