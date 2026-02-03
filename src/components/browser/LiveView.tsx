/**
 * LiveView Component
 * 
 * Displays real-time browser viewport during automation.
 * Features:
 * - Live screenshot streaming
 * - Step progress indicator
 * - Control buttons (pause/stop/approve)
 * - URL bar showing current page
 * 
 * CHAOS-HARDENED: Handles disconnections, rapid state changes,
 * and approval timeouts gracefully.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AutomationStep {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
  requiresApproval?: boolean;
}

interface AutomationRun {
  id: string;
  type: string;
  status: string;
  steps: AutomationStep[];
  currentStepIndex: number;
  target?: { name: string; headline?: string; profileUrl: string };
  message?: string;
  error?: string;
  profileId?: string;
}

interface ApprovalRequest {
  action: string;
  preview: { target: string; content: string };
  runId: string;
  timestamp: number;  // CHAOS FIX: Track when approval was requested
}

interface LiveViewProps {
  profileId: string | null;
  isActive: boolean;
  className?: string;
}

// CHAOS FIX: Approval timeout (5 minutes)
const APPROVAL_TIMEOUT_MS = 300000;

export function LiveView({ profileId, isActive, className }: LiveViewProps) {
  const [frame, setFrame] = useState<string | null>(null);
  const [url, setUrl] = useState<string>('');
  const [title, setTitle] = useState<string>('');
  const [run, setRun] = useState<AutomationRun | null>(null);
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvalTimeLeft, setApprovalTimeLeft] = useState<number | null>(null);
  
  // CHAOS FIX: Track component mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const approvalTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventCleanupRef = useRef<(() => void) | null>(null);

  // CHAOS FIX: Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (approvalTimerRef.current) {
        clearInterval(approvalTimerRef.current);
      }
      if (eventCleanupRef.current) {
        eventCleanupRef.current();
      }
    };
  }, []);

  // Start/stop streaming based on active state
  useEffect(() => {
    if (!profileId || !isActive || !window.playwright) return;

    const startStream = async () => {
      try {
        await window.playwright.startStreaming(profileId, 2);
        if (isMountedRef.current) {
          setIsStreaming(true);
          setError(null);
        }
      } catch (e) {
        if (isMountedRef.current) {
          setError((e as Error).message);
          setIsStreaming(false);
        }
      }
    };

    startStream();

    return () => {
      window.playwright?.stopStreaming().catch(() => {});
      if (isMountedRef.current) {
        setIsStreaming(false);
      }
    };
  }, [profileId, isActive]);

  // Listen for automation events
  useEffect(() => {
    if (!window.playwright) return;

    const handleEvent = (event: any) => {
      if (!isMountedRef.current) return;
      
      switch (event.type) {
        case 'BROWSER_FRAME':
          setFrame(event.data.frameData);
          setUrl(event.data.url || '');
          setTitle(event.data.title || '');
          break;
          
        case 'RUN_UPDATE':
          // CHAOS FIX: Only update if the run matches our profile
          if (!profileId || event.data.run?.profileId === profileId) {
            setRun(event.data.run);
          }
          break;
          
        case 'NEEDS_APPROVAL':
          // CHAOS FIX: Track approval timestamp for timeout display
          setApproval({
            action: event.data.action,
            preview: event.data.preview,
            runId: event.data.runId,
            timestamp: Date.now(),
          });
          break;
          
        case 'STEP_COMPLETED':
        case 'RUN_FINISHED':
          setApproval(null);
          if (approvalTimerRef.current) {
            clearInterval(approvalTimerRef.current);
            approvalTimerRef.current = null;
          }
          setApprovalTimeLeft(null);
          break;
          
        case 'STOP_ACKNOWLEDGED':
        case 'STOPPED':
          setRun(null);
          setApproval(null);
          if (approvalTimerRef.current) {
            clearInterval(approvalTimerRef.current);
            approvalTimerRef.current = null;
          }
          setApprovalTimeLeft(null);
          break;
          
        case 'browser_error':
          setError(event.data.error);
          setIsStreaming(false);
          break;
      }
    };

    const unsubscribe = window.playwright.onEvent(handleEvent);
    eventCleanupRef.current = unsubscribe;

    return () => {
      unsubscribe();
      eventCleanupRef.current = null;
    };
  }, [profileId]);

  // CHAOS FIX: Approval timeout countdown
  useEffect(() => {
    if (!approval) {
      if (approvalTimerRef.current) {
        clearInterval(approvalTimerRef.current);
        approvalTimerRef.current = null;
      }
      setApprovalTimeLeft(null);
      return;
    }

    // Start countdown
    const updateTimeLeft = () => {
      if (!approval || !isMountedRef.current) return;
      const elapsed = Date.now() - approval.timestamp;
      const remaining = Math.max(0, APPROVAL_TIMEOUT_MS - elapsed);
      setApprovalTimeLeft(remaining);
      
      // Auto-reject on timeout
      if (remaining <= 0) {
        handleReject();
      }
    };

    updateTimeLeft();
    approvalTimerRef.current = setInterval(updateTimeLeft, 1000);

    return () => {
      if (approvalTimerRef.current) {
        clearInterval(approvalTimerRef.current);
        approvalTimerRef.current = null;
      }
    };
  }, [approval]);

  const handleApprove = useCallback(async () => {
    if (!approval || !window.playwright) return;
    try {
      await window.playwright.approveAction(approval.runId);
      if (isMountedRef.current) {
        setApproval(null);
        setApprovalTimeLeft(null);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError((e as Error).message);
      }
    }
  }, [approval]);

  const handleReject = useCallback(async () => {
    if (!approval || !window.playwright) return;
    try {
      await window.playwright.rejectAction(approval.runId);
      if (isMountedRef.current) {
        setApproval(null);
        setApprovalTimeLeft(null);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError((e as Error).message);
      }
    }
  }, [approval]);

  const handleStop = useCallback(async () => {
    if (!window.playwright) return;
    try {
      // CHAOS FIX: Stop specific run if we have one, otherwise stop all
      await window.playwright.stopRun(run?.id);
      if (isMountedRef.current) {
        setRun(null);
        setApproval(null);
        setApprovalTimeLeft(null);
        setError(null);
      }
    } catch (e) {
      if (isMountedRef.current) {
        setError((e as Error).message);
      }
    }
  }, [run?.id]);

  // Calculate progress
  const completedSteps = run?.steps.filter(s => s.status === 'complete' || s.status === 'skipped').length || 0;
  const totalSteps = run?.steps.length || 0;
  const progress = totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0;
  
  // Format time left for display
  const formatTimeLeft = (ms: number | null): string => {
    if (ms === null) return '';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  if (!isActive) {
    return (
      <div className={cn("flex items-center justify-center bg-muted/30 rounded-xl", className)}>
        <div className="text-center p-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-primary/10 mb-4">
            <i className="fa-solid fa-tv text-2xl text-primary" />
          </div>
          <h3 className="text-lg font-semibold mb-2">Browser Not Active</h3>
          <p className="text-sm text-muted-foreground">
            Start an automation task to see the live browser view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col bg-card rounded-xl border border-border overflow-hidden", className)}>
      {/* Header - URL Bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-1">
          {isStreaming ? (
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          ) : (
            <span className="flex h-2 w-2 rounded-full bg-muted-foreground" />
          )}
        </div>
        <div className="flex-1 flex items-center bg-background rounded-md px-3 py-1.5 text-xs">
          <i className="fa-solid fa-lock text-emerald-500 mr-2 text-[10px]" />
          <span className="truncate text-muted-foreground">{url || 'about:blank'}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={handleStop}
          title="Stop automation"
          disabled={!run}
        >
          <i className="fa-solid fa-stop text-destructive" />
        </Button>
      </div>

      {/* Browser Viewport */}
      <div className="flex-1 relative bg-black min-h-[300px]">
        {frame ? (
          <img
            src={frame}
            alt="Browser viewport"
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <i className="fa-solid fa-spinner fa-spin text-2xl mb-2" />
              <p className="text-sm">Loading browser...</p>
            </div>
          </div>
        )}

        {/* Approval Overlay */}
        {approval && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="bg-card rounded-xl p-6 max-w-md mx-4 shadow-xl border border-border">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
                  <i className="fa-solid fa-shield-check" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Approval Required</h3>
                  <p className="text-sm text-muted-foreground">{approval.action.replace(/_/g, ' ')}</p>
                </div>
                {/* CHAOS FIX: Show timeout countdown */}
                {approvalTimeLeft !== null && (
                  <div className={cn(
                    "text-sm font-mono",
                    approvalTimeLeft < 60000 ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {formatTimeLeft(approvalTimeLeft)}
                  </div>
                )}
              </div>

              <div className="bg-muted/50 rounded-lg p-3 mb-4">
                <div className="text-xs text-muted-foreground mb-1">To:</div>
                <div className="font-medium">{approval.preview.target}</div>
                <div className="text-xs text-muted-foreground mt-2 mb-1">Content:</div>
                <div className="text-sm whitespace-pre-wrap">{approval.preview.content}</div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleReject}
                >
                  <i className="fa-solid fa-xmark mr-2" />
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleApprove}
                >
                  <i className="fa-solid fa-check mr-2" />
                  Approve & Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step Progress Footer */}
      {run && (
        <div className="px-4 py-3 bg-muted/30 border-t border-border">
          {/* Status badge */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Badge
                variant={run.status === 'running' ? 'default' : run.status === 'complete' ? 'outline' : 'destructive'}
                className={cn(
                  run.status === 'running' && 'bg-blue-500',
                  run.status === 'complete' && 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
                  run.status === 'paused' && 'bg-amber-500',
                  run.status === 'stopped' && 'bg-gray-500',
                  run.status === 'failed' && 'bg-destructive'
                )}
              >
                {run.status === 'running' && <i className="fa-solid fa-spinner fa-spin mr-1.5" />}
                {run.status === 'paused' && <i className="fa-solid fa-pause mr-1.5" />}
                {run.status}
              </Badge>
              {run.target && (
                <span className="text-sm text-muted-foreground truncate">
                  → {run.target.name}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {completedSteps}/{totalSteps} steps
            </span>
          </div>

          {/* Progress bar */}
          <Progress value={progress} className="h-1.5 mb-2" />

          {/* Current step */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground overflow-x-auto">
            {run.steps.map((step, i) => (
              <div
                key={step.id}
                className={cn(
                  "flex items-center gap-1 whitespace-nowrap",
                  step.status === 'running' && "text-primary font-medium",
                  step.status === 'complete' && "text-emerald-500",
                  step.status === 'failed' && "text-destructive"
                )}
              >
                {step.status === 'running' && <i className="fa-solid fa-circle-notch fa-spin text-[8px]" />}
                {step.status === 'complete' && <i className="fa-solid fa-check text-[8px]" />}
                {step.status === 'failed' && <i className="fa-solid fa-xmark text-[8px]" />}
                {step.status === 'pending' && <i className="fa-regular fa-circle text-[8px]" />}
                {step.status === 'skipped' && <i className="fa-solid fa-forward text-[8px]" />}
                <span className="truncate max-w-[100px]">{step.name}</span>
                {i < run.steps.length - 1 && <span className="text-muted-foreground">→</span>}
              </div>
            ))}
          </div>
          
          {/* CHAOS FIX: Show error if present */}
          {run.error && (
            <div className="mt-2 text-xs text-destructive">
              <i className="fa-solid fa-exclamation-triangle mr-1" />
              {run.error}
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error && !run?.error && (
        <div className="px-4 py-2 bg-destructive/10 border-t border-destructive/30 text-destructive text-sm">
          <i className="fa-solid fa-exclamation-triangle mr-2" />
          {error}
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-2 h-5 px-2 text-xs"
            onClick={() => setError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

export default LiveView;
