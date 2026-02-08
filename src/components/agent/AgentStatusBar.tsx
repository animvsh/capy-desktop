/**
 * AgentStatusBar - Shows agent runtime, confidence, and stop button
 * 
 * Displays:
 * - Agent state indicator (running/planning/stopped)
 * - Runtime duration
 * - Confidence progress bar
 * - STOP button (immediate cancellation)
 */

import { useState, useEffect } from 'react';
import { useAgentStore, AgentState } from '@/stores/agentStore';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

interface AgentStatusBarProps {
  sessionId: string;
  className?: string;
}

// State indicator colors
const STATE_COLORS: Record<AgentState, { bg: string; text: string; pulse: boolean }> = {
  idle: { bg: 'bg-gray-500', text: 'text-gray-500', pulse: false },
  planning: { bg: 'bg-blue-500', text: 'text-blue-500', pulse: true },
  running: { bg: 'bg-green-500', text: 'text-green-500', pulse: true },
  complete: { bg: 'bg-emerald-500', text: 'text-emerald-500', pulse: false },
  stopped: { bg: 'bg-orange-500', text: 'text-orange-500', pulse: false },
  error: { bg: 'bg-red-500', text: 'text-red-500', pulse: false },
};

const STATE_LABELS: Record<AgentState, string> = {
  idle: 'Idle',
  planning: 'Planning',
  running: 'Running',
  complete: 'Complete',
  stopped: 'Stopped',
  error: 'Error',
};

export function AgentStatusBar({ sessionId, className }: AgentStatusBarProps) {
  const agent = useAgentStore((state) => state.agents.get(sessionId));
  const requestStop = useAgentStore((state) => state.requestStop);
  const [displayRuntime, setDisplayRuntime] = useState(0);
  const [isStopping, setIsStopping] = useState(false);

  // Update runtime display + auto-timeout for stuck states
  useEffect(() => {
    if (!agent || agent.state !== 'running' && agent.state !== 'planning') {
      setDisplayRuntime(agent?.runtimeMs || 0);
      return;
    }

    const interval = setInterval(() => {
      if (agent.startTime > 0) {
        const runtime = Date.now() - agent.startTime;
        setDisplayRuntime(runtime);
        
        // Auto-reset if stuck in 'planning' for > 90 seconds with no progress
        // This handles stuck backend jobs where SSE doesn't error
        const PLANNING_TIMEOUT_MS = 90000; // 90 seconds
        if (agent.state === 'planning' && 
            agent.resultCount === 0 && 
            agent.confidence === 0 &&
            runtime > PLANNING_TIMEOUT_MS) {
          console.warn('[AgentStatusBar] Auto-resetting stuck planning state after 90s');
          requestStop(sessionId);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [agent?.state, agent?.startTime, agent?.resultCount, agent?.confidence, sessionId, requestStop]);

  // Reset stopping state when agent stops
  useEffect(() => {
    if (agent?.state === 'stopped' || agent?.state === 'complete' || agent?.state === 'error') {
      setIsStopping(false);
    }
  }, [agent?.state]);

  if (!agent) return null;

  const stateConfig = STATE_COLORS[agent.state];
  const isActive = agent.state === 'running' || agent.state === 'planning';

  const handleStop = async () => {
    setIsStopping(true);
    await requestStop(sessionId);
  };

  const formatRuntime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div
      className={cn(
        'flex items-center gap-4 px-4 py-2 bg-card border rounded-lg',
        className
      )}
    >
      {/* State Indicator */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full',
              stateConfig.bg,
              stateConfig.pulse && 'animate-pulse'
            )}
          />
          {stateConfig.pulse && (
            <div
              className={cn(
                'absolute inset-0 w-2.5 h-2.5 rounded-full',
                stateConfig.bg,
                'animate-ping opacity-75'
              )}
            />
          )}
        </div>
        <span className={cn('text-sm font-medium', stateConfig.text)}>
          {STATE_LABELS[agent.state]}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Runtime */}
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-clock text-muted-foreground text-xs" />
        <span className="text-sm text-muted-foreground font-mono min-w-[60px]">
          {formatRuntime(displayRuntime)}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Confidence */}
      <div className="flex items-center gap-2 flex-1 max-w-[200px]">
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Confidence:
        </span>
        <div className="flex-1 flex items-center gap-2">
          <Progress 
            value={agent.confidence} 
            className="h-2 flex-1"
          />
          <span className="text-xs font-medium min-w-[35px] text-right">
            {Math.round(agent.confidence)}%
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="w-px h-4 bg-border" />

      {/* Results Count */}
      <div className="flex items-center gap-2">
        <i className="fa-solid fa-users text-muted-foreground text-xs" />
        <span className="text-sm text-muted-foreground">
          {agent.resultCount} results
        </span>
      </div>

      {/* Stop Button */}
      {isActive && (
        <>
          <div className="w-px h-4 bg-border" />
          <Button
            variant="destructive"
            size="sm"
            onClick={handleStop}
            disabled={isStopping}
            className="gap-2"
          >
            {isStopping ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" />
                Stopping...
              </>
            ) : (
              <>
                <i className="fa-solid fa-stop" />
                STOP
              </>
            )}
          </Button>
        </>
      )}

      {/* Current Message */}
      {agent.currentMessage && (
        <div className="flex-1 text-right">
          <span className="text-xs text-muted-foreground truncate max-w-[200px] inline-block">
            {agent.currentMessage}
          </span>
        </div>
      )}
    </div>
  );
}

// Compact version for inline display
export function AgentStatusBadge({ sessionId }: { sessionId: string }) {
  const agent = useAgentStore((state) => state.agents.get(sessionId));
  
  if (!agent) return null;

  const stateConfig = STATE_COLORS[agent.state];
  const isActive = agent.state === 'running' || agent.state === 'planning';

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted">
      <div
        className={cn(
          'w-1.5 h-1.5 rounded-full',
          stateConfig.bg,
          stateConfig.pulse && 'animate-pulse'
        )}
      />
      <span className="text-xs">
        {isActive ? `${Math.round(agent.confidence)}%` : STATE_LABELS[agent.state]}
      </span>
    </div>
  );
}

export default AgentStatusBar;
