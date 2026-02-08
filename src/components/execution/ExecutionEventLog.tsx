/**
 * EXECUTION EVENT LOG
 * 
 * Real-time log of all execution events.
 * Shows tool invocations, failures, retries, etc.
 */

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useExecution, ExecutionEvent } from './ExecutionContext';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/scroll-area';

// ============================================
// EVENT TYPE STYLES
// ============================================

const eventStyles: Record<string, { icon: string; color: string; bg: string }> = {
  goal_created: { icon: 'fa-bullseye', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  goal_locked: { icon: 'fa-lock', color: 'text-blue-600', bg: 'bg-blue-500/10' },
  goal_rejected: { icon: 'fa-circle-xmark', color: 'text-red-500', bg: 'bg-red-500/10' },
  step_started: { icon: 'fa-play', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  step_completed: { icon: 'fa-check', color: 'text-green-500', bg: 'bg-green-500/10' },
  step_failed: { icon: 'fa-xmark', color: 'text-red-500', bg: 'bg-red-500/10' },
  step_retrying: { icon: 'fa-rotate', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  step_blocked: { icon: 'fa-pause', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  tool_invoked: { icon: 'fa-wrench', color: 'text-cyan-500', bg: 'bg-cyan-500/10' },
  tool_succeeded: { icon: 'fa-circle-check', color: 'text-green-500', bg: 'bg-green-500/10' },
  tool_failed: { icon: 'fa-triangle-exclamation', color: 'text-red-500', bg: 'bg-red-500/10' },
  tool_rejected: { icon: 'fa-ban', color: 'text-red-600', bg: 'bg-red-500/10' },
  fallback_used: { icon: 'fa-arrows-rotate', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  task_completed: { icon: 'fa-flag-checkered', color: 'text-green-600', bg: 'bg-green-500/10' },
  task_failed: { icon: 'fa-circle-xmark', color: 'text-red-600', bg: 'bg-red-500/10' },
  task_aborted: { icon: 'fa-stop', color: 'text-red-500', bg: 'bg-red-500/10' },
  context_switch_rejected: { icon: 'fa-ban', color: 'text-purple-500', bg: 'bg-purple-500/10' },
  completion_denied: { icon: 'fa-circle-minus', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  completion_granted: { icon: 'fa-trophy', color: 'text-green-600', bg: 'bg-green-500/10' },
};

const eventLabels: Record<string, string> = {
  goal_created: 'Goal Created',
  goal_locked: 'Goal Locked',
  goal_rejected: 'Goal Rejected',
  step_started: 'Step Started',
  step_completed: 'Step Completed',
  step_failed: 'Step Failed',
  step_retrying: 'Retrying Step',
  step_blocked: 'Step Blocked',
  tool_invoked: 'Tool Invoked',
  tool_succeeded: 'Tool Success',
  tool_failed: 'Tool Failed',
  tool_rejected: 'Tool Rejected',
  fallback_used: 'Using Fallback',
  task_completed: 'Task Completed',
  task_failed: 'Task Failed',
  task_aborted: 'Task Aborted',
  context_switch_rejected: 'Context Switch Blocked',
  completion_denied: 'Completion Denied',
  completion_granted: 'Task Complete!',
};

// ============================================
// EVENT ITEM
// ============================================

interface EventItemProps {
  event: ExecutionEvent;
}

function EventItem({ event }: EventItemProps) {
  const style = eventStyles[event.eventType] || { 
    icon: 'fa-circle', 
    color: 'text-muted-foreground', 
    bg: 'bg-muted' 
  };
  const label = eventLabels[event.eventType] || event.eventType;
  const time = new Date(event.timestamp).toLocaleTimeString();
  
  return (
    <div className={cn(
      "flex items-start gap-2 p-2 rounded-lg text-xs",
      style.bg
    )}>
      <div className={cn("w-5 h-5 rounded flex items-center justify-center shrink-0", style.color)}>
        <i className={cn("fa-solid text-[10px]", style.icon)} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={cn("font-medium", style.color)}>{label}</span>
          <span className="text-[10px] text-muted-foreground">{time}</span>
        </div>
        
        {event.tool && (
          <span className="text-muted-foreground">Tool: {event.tool}</span>
        )}
        
        {event.details && (
          <div className="mt-1 text-muted-foreground">
            {event.details.error && <span className="text-red-500">{event.details.error}</span>}
            {event.details.reason && <span>{event.details.reason}</span>}
            {event.details.type && <span>{event.details.type}: {event.details.description}</span>}
            {event.details.attempt && <span>Attempt {event.details.attempt}</span>}
            {event.details.prospects_found && <span>Found {event.details.prospects_found} prospects</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

interface ExecutionEventLogProps {
  maxHeight?: string;
  compact?: boolean;
}

export function ExecutionEventLog({ maxHeight = '300px', compact = false }: ExecutionEventLogProps) {
  const { events, clearEvents } = useExecution();
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length]);
  
  if (events.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        <i className="fa-solid fa-terminal text-2xl mb-2 opacity-50" />
        <p>No execution events yet</p>
        <p className="text-xs mt-1">Events will appear here when tasks run</p>
      </div>
    );
  }
  
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-terminal text-muted-foreground" />
            <span className="font-medium text-sm">Execution Log</span>
            <span className="text-xs text-muted-foreground">({events.length} events)</span>
          </div>
          <Button variant="ghost" size="sm" onClick={clearEvents} className="h-7 text-xs">
            <i className="fa-solid fa-trash mr-1.5" />
            Clear
          </Button>
        </div>
      )}
      
      {/* Event list */}
      <div 
        ref={scrollRef}
        className="p-2 space-y-1 overflow-y-auto"
        style={{ maxHeight }}
      >
        {events.map((event, index) => (
          <EventItem key={`${event.timestamp}-${index}`} event={event} />
        ))}
      </div>
    </div>
  );
}

export default ExecutionEventLog;
