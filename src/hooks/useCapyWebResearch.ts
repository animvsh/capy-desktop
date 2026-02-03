/**
 * useCapyWebResearch - Hook for triggering Capy Web research
 * 
 * Integrates with the chat system to provide web research capabilities
 */

import { useState, useCallback, useRef } from 'react';

// ============================================
// TYPES
// ============================================

export type ResearchMode = 'lightning' | 'standard' | 'deep' | 'compliance';

export interface ResearchProgress {
  status: 'idle' | 'planning' | 'executing' | 'paused' | 'completed' | 'failed';
  confidence: number;
  pagesVisited: number;
  claimsFound: number;
  activePaths: number;
  elapsedMs: number;
  currentPhase?: string;
}

export interface ResearchAnswer {
  question: string;
  answer: unknown;
  confidence: 'verified' | 'high' | 'medium' | 'low' | 'uncertain' | 'contradicted';
  confidenceScore: number;
  sources: Array<{
    url: string;
    domain: string;
    tier: number;
  }>;
  reasoning?: string;
}

export interface ResearchClaim {
  id: string;
  text: string;
  category: string;
  confidence: string;
  confidenceScore: number;
  corroborationCount: number;
  contradictionCount: number;
  sources: Array<{
    url: string;
    domain: string;
    tier: number;
  }>;
}

export interface ResearchResult {
  sessionId: string;
  objective: string;
  success: boolean;
  confidence: number;
  answers: ResearchAnswer[];
  claims: ResearchClaim[];
  stats: {
    totalTimeMs: number;
    pagesVisited: number;
    claimsFound: number;
    claimsVerified: number;
    contradictionsFound: number;
    cacheHits: number;
  };
  visitedUrls: string[];
}

export interface UseCapyWebResearchOptions {
  apiEndpoint?: string;
  onProgress?: (progress: ResearchProgress) => void;
  onComplete?: (result: ResearchResult) => void;
  onError?: (error: Error) => void;
}

// ============================================
// HOOK
// ============================================

export function useCapyWebResearch(options: UseCapyWebResearchOptions = {}) {
  const [isResearching, setIsResearching] = useState(false);
  const [progress, setProgress] = useState<ResearchProgress | null>(null);
  const [result, setResult] = useState<ResearchResult | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  
  const research = useCallback(async (
    query: string,
    researchOptions?: {
      mode?: ResearchMode;
      confidenceThreshold?: number;
      maxTimeMs?: number;
      maxPages?: number;
      knownDomains?: string[];
    }
  ): Promise<ResearchResult | null> => {
    if (isResearching) {
      console.warn('Research already in progress');
      return null;
    }
    
    setIsResearching(true);
    setProgress({
      status: 'planning',
      confidence: 0,
      pagesVisited: 0,
      claimsFound: 0,
      activePaths: 0,
      elapsedMs: 0,
      currentPhase: 'Initializing...'
    });
    setResult(null);
    setError(null);
    
    abortControllerRef.current = new AbortController();
    
    const endpoint = options.apiEndpoint || '/api/capy-web/research';
    
    try {
      // Start research via POST
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          mode: researchOptions?.mode || 'standard',
          confidenceThreshold: researchOptions?.confidenceThreshold || 0.8,
          maxTimeMs: researchOptions?.maxTimeMs,
          maxPages: researchOptions?.maxPages,
          knownDomains: researchOptions?.knownDomains
        }),
        signal: abortControllerRef.current.signal
      });
      
      if (!response.ok) {
        throw new Error(`Research failed: ${response.statusText}`);
      }
      
      // Check if streaming response
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('text/event-stream')) {
        // Handle SSE streaming
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let finalResult: ResearchResult | null = null;
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value);
            const lines = text.split('\n');
            
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  
                  if (data.type === 'progress') {
                    const progressData = data.progress as ResearchProgress;
                    setProgress(progressData);
                    options.onProgress?.(progressData);
                  } else if (data.type === 'result') {
                    finalResult = data.result as ResearchResult;
                  } else if (data.type === 'error') {
                    throw new Error(data.error);
                  }
                } catch (e) {
                  // Ignore parse errors for partial chunks
                }
              }
            }
          }
        }
        
        if (finalResult) {
          setResult(finalResult);
          setProgress(prev => prev ? { ...prev, status: 'completed' } : null);
          options.onComplete?.(finalResult);
          return finalResult;
        }
        
        throw new Error('No result received from stream');
        
      } else {
        // Handle regular JSON response
        const jsonResult = await response.json() as ResearchResult;
        setResult(jsonResult);
        setProgress(prev => prev ? { ...prev, status: 'completed' } : null);
        options.onComplete?.(jsonResult);
        return jsonResult;
      }
      
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        setProgress(prev => prev ? { ...prev, status: 'completed' } : null);
        return null;
      }
      
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setProgress(prev => prev ? { ...prev, status: 'failed' } : null);
      options.onError?.(error);
      throw error;
      
    } finally {
      setIsResearching(false);
    }
  }, [isResearching, options]);
  
  const pause = useCallback(() => {
    // Send pause command
    fetch(options.apiEndpoint || '/api/capy-web/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pause' })
    });
    setProgress(prev => prev ? { ...prev, status: 'paused' } : null);
  }, [options.apiEndpoint]);
  
  const resume = useCallback(() => {
    // Send resume command
    fetch(options.apiEndpoint || '/api/capy-web/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resume' })
    });
    setProgress(prev => prev ? { ...prev, status: 'executing' } : null);
  }, [options.apiEndpoint]);
  
  const stop = useCallback(() => {
    // Abort the fetch
    abortControllerRef.current?.abort();
    
    // Close EventSource if active
    eventSourceRef.current?.close();
    
    // Send stop command
    fetch(options.apiEndpoint || '/api/capy-web/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop' })
    });
    
    setProgress(prev => prev ? { ...prev, status: 'completed' } : null);
    setIsResearching(false);
  }, [options.apiEndpoint]);
  
  const reset = useCallback(() => {
    stop();
    setProgress(null);
    setResult(null);
    setError(null);
  }, [stop]);
  
  return {
    // State
    isResearching,
    progress,
    result,
    error,
    
    // Actions
    research,
    pause,
    resume,
    stop,
    reset
  };
}

// ============================================
// HELPER: Detect research intent in message
// ============================================

export function detectResearchIntent(message: string): {
  isResearchQuery: boolean;
  query?: string;
  mode?: ResearchMode;
} {
  const lowerMessage = message.toLowerCase();
  
  // Research trigger phrases
  const researchTriggers = [
    /^research\s+(.+)/i,
    /^look up\s+(.+)/i,
    /^find out\s+(.+)/i,
    /^investigate\s+(.+)/i,
    /^deep dive\s+(.+)/i,
    /what is the pricing for\s+(.+)/i,
    /tell me about\s+(.+?)(?:'s|\s+)(?:pricing|features|security|compliance)/i,
    /^analyze\s+(.+)/i
  ];
  
  for (const trigger of researchTriggers) {
    const match = message.match(trigger);
    if (match) {
      // Determine mode based on keywords
      let mode: ResearchMode = 'standard';
      if (lowerMessage.includes('quick') || lowerMessage.includes('fast')) {
        mode = 'lightning';
      } else if (lowerMessage.includes('deep') || lowerMessage.includes('thorough')) {
        mode = 'deep';
      } else if (lowerMessage.includes('official') || lowerMessage.includes('compliance')) {
        mode = 'compliance';
      }
      
      return {
        isResearchQuery: true,
        query: match[1]?.trim() || message,
        mode
      };
    }
  }
  
  return { isResearchQuery: false };
}
