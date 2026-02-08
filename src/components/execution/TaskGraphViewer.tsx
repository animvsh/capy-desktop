/**
 * TASK GRAPH VIEWER
 * 
 * Visual representation of the task execution graph.
 * Shows real-time progress of each step.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { useExecution, TaskNode, TaskGraph } from './ExecutionContext';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/progress';

// ============================================
// STATUS ICONS
// ============================================

const statusIcons: Record<string, { icon: string; color: string }> = {
  pending: { icon: 'fa-circle', color: 'text-muted-foreground' },
  ready: { icon: 'fa-circle-dot', color: 'text-blue-500' },
  running: { icon: 'fa-spinner fa-spin', color: 'text-amber-500' },
  completed: { icon: 'fa-circle-check', color: 'text-green-500' },
  failed: { icon: 'fa-circle-xmark', color: 'text-red-500' },
  blocked: { icon: 'fa-circle-pause', color: 'text-purple-500' },
  skipped: { icon: 'fa-circle-minus', color: 'text-muted-foreground' },
};

const taskTypeLabels: Record<string, string> = {
  identify_companies: 'Finding Companies',
  identify_people: 'Finding People',
  find_contact_info: 'Getting Contact Info',
  verify_email: 'Verifying Emails',
  research_company: 'Researching Companies',
  find_personalization: 'Finding Personalization',
  generate_email: 'Writing Emails',
  user_approve: 'Awaiting Approval',
  send_email: 'Sending Emails',
  summarize_results: 'Summarizing Results',
  score_leads: 'Scoring Leads',
  user_review: 'Ready for Review',
};

// ============================================
// TASK NODE COMPONENT
// ============================================

interface TaskNodeProps {
  task: TaskNode;
  index: number;
  isLast: boolean;
}

function TaskNodeComponent({ task, index, isLast }: TaskNodeProps) {
  const status = statusIcons[task.status] || statusIcons.pending;
  const label = taskTypeLabels[task.type] || task.type;
  
  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div 
          className={cn(
            "absolute left-4 top-8 w-0.5 h-8 -ml-px",
            task.status === 'completed' ? 'bg-green-500/50' : 'bg-border'
          )}
        />
      )}
      
      <div className={cn(
        "flex items-start gap-3 p-3 rounded-lg transition-all",
        task.status === 'running' && 'bg-amber-500/10 border border-amber-500/20',
        task.status === 'completed' && 'opacity-60',
        task.status === 'failed' && 'bg-red-500/10 border border-red-500/20',
        task.status === 'blocked' && 'bg-purple-500/10 border border-purple-500/20',
      )}>
        {/* Status icon */}
        <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", status.color)}>
          <i className={cn("fa-solid text-sm", status.icon)} />
        </div>
        
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm">{label}</span>
            <span className="text-xs text-muted-foreground">Step {index + 1}</span>
          </div>
          
          {task.description && task.description !== label && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {task.description}
            </p>
          )}
          
          {/* Progress bar for running tasks */}
          {task.status === 'running' && (
            <div className="mt-2">
              <Progress value={task.progressPercent || 50} className="h-1" />
              {task.currentAction && (
                <p className="text-xs text-amber-600 mt-1">{task.currentAction}</p>
              )}
            </div>
          )}
          
          {/* Output summary for completed tasks */}
          {task.status === 'completed' && task.outputs && (
            <div className="mt-1 text-xs text-green-600">
              {task.outputs.prospects?.length && `Found ${task.outputs.prospects.length} prospects`}
              {task.outputs.emails_sent && `Sent ${task.outputs.emails_sent} emails`}
            </div>
          )}
          
          {/* Error message for failed tasks */}
          {task.status === 'failed' && task.error && (
            <p className="text-xs text-red-500 mt-1">{task.error}</p>
          )}
          
          {/* Blocked message */}
          {task.status === 'blocked' && (
            <p className="text-xs text-purple-500 mt-1">Waiting for your input</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN VIEWER
// ============================================

export function TaskGraphViewer() {
  const { activeGraph, isExecuting, pauseExecution, resumeExecution, stopExecution } = useExecution();
  
  if (!activeGraph) {
    return null;
  }
  
  const progress = activeGraph.totalTasks > 0 
    ? (activeGraph.completedTasks / activeGraph.totalTasks) * 100 
    : 0;
  
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">
              {activeGraph.goal.locked ? 'Executing Task' : 'Compiling Goal'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeGraph.goal.objective}
            </p>
          </div>
          
          {/* Control buttons */}
          <div className="flex items-center gap-2">
            {activeGraph.status === 'running' && (
              <Button variant="ghost" size="sm" onClick={pauseExecution}>
                <i className="fa-solid fa-pause mr-1.5" />
                Pause
              </Button>
            )}
            {activeGraph.status === 'paused' && (
              <Button variant="ghost" size="sm" onClick={resumeExecution}>
                <i className="fa-solid fa-play mr-1.5" />
                Resume
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={stopExecution} className="text-red-500 hover:text-red-600">
              <i className="fa-solid fa-stop mr-1.5" />
              Stop
            </Button>
          </div>
        </div>
        
        {/* Overall progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-muted-foreground">Progress</span>
            <span className="font-medium">{activeGraph.completedTasks}/{activeGraph.totalTasks} steps</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      </div>
      
      {/* Task list */}
      <div className="p-4 space-y-1 max-h-80 overflow-y-auto">
        {activeGraph.tasks.map((task, index) => (
          <TaskNodeComponent 
            key={task.id} 
            task={task} 
            index={index}
            isLast={index === activeGraph.tasks.length - 1}
          />
        ))}
      </div>
      
      {/* Footer with status */}
      <div className="p-3 border-t border-border bg-muted/30">
        <div className="flex items-center justify-between text-xs">
          <span className={cn(
            "font-medium",
            activeGraph.status === 'running' && 'text-amber-500',
            activeGraph.status === 'completed' && 'text-green-500',
            activeGraph.status === 'failed' && 'text-red-500',
            activeGraph.status === 'paused' && 'text-purple-500',
          )}>
            {activeGraph.status === 'running' && '⚡ Running'}
            {activeGraph.status === 'completed' && '✅ Completed'}
            {activeGraph.status === 'failed' && '❌ Failed'}
            {activeGraph.status === 'paused' && '⏸️ Paused'}
            {activeGraph.status === 'compiling' && '🔄 Compiling'}
          </span>
          
          {activeGraph.startedAt && (
            <span className="text-muted-foreground">
              Started {new Date(activeGraph.startedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default TaskGraphViewer;
