/**
 * StepProgressBar - Shows task execution steps
 * 
 * Displays:
 * - Current step name
 * - Step index (1/6, 2/6, etc.)
 * - Per-step status (pending/running/complete/failed)
 * - Overall progress
 */

import { cn } from '@/lib/utils';
import { CheckCircle, Circle, Loader2, XCircle, Clock } from 'lucide-react';

export interface Step {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
}

interface StepProgressBarProps {
  steps: Step[];
  currentStepIndex: number;
  className?: string;
  compact?: boolean;
}

const STATUS_ICONS: Record<Step['status'], React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-gray-400" />,
  running: <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />,
  complete: <CheckCircle className="w-4 h-4 text-green-500" />,
  failed: <XCircle className="w-4 h-4 text-red-500" />,
  skipped: <Clock className="w-4 h-4 text-gray-400" />,
};

const STATUS_COLORS: Record<Step['status'], string> = {
  pending: 'bg-gray-200',
  running: 'bg-blue-500',
  complete: 'bg-green-500',
  failed: 'bg-red-500',
  skipped: 'bg-gray-300',
};

export function StepProgressBar({ 
  steps, 
  currentStepIndex, 
  className,
  compact = false 
}: StepProgressBarProps) {
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const totalSteps = steps.length;
  const progress = totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0;
  const currentStep = steps[currentStepIndex];

  if (compact) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="text-sm font-medium">
          Step {currentStepIndex + 1}/{totalSteps}
        </span>
        <span className="text-sm text-muted-foreground truncate max-w-[150px]">
          {currentStep?.name || 'Preparing...'}
        </span>
        {currentStep && STATUS_ICONS[currentStep.status]}
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-medium text-gray-600 min-w-[60px]">
          {completedCount}/{totalSteps}
        </span>
      </div>

      {/* Step list */}
      <div className="space-y-1">
        {steps.map((step, index) => (
          <div 
            key={step.id}
            className={cn(
              "flex items-center gap-2 py-1.5 px-2 rounded",
              index === currentStepIndex && "bg-blue-50",
              step.status === 'complete' && "opacity-60"
            )}
          >
            <div className="flex-shrink-0">
              {STATUS_ICONS[step.status]}
            </div>
            <span className={cn(
              "text-sm truncate",
              index === currentStepIndex ? "font-medium" : "text-gray-600"
            )}>
              {step.name}
            </span>
            {step.status === 'running' && (
              <span className="ml-auto text-xs text-blue-500 animate-pulse">
                In progress...
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Mini version for status bar
export function StepProgressMini({ 
  steps, 
  currentStepIndex 
}: { 
  steps: Step[]; 
  currentStepIndex: number;
}) {
  const completedCount = steps.filter(s => s.status === 'complete').length;
  const currentStep = steps[currentStepIndex];
  
  return (
    <div className="flex items-center gap-2">
      {/* Step dots */}
      <div className="flex items-center gap-1">
        {steps.map((step, i) => (
          <div
            key={step.id}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              STATUS_COLORS[step.status],
              i === currentStepIndex && "ring-2 ring-blue-300 ring-offset-1"
            )}
          />
        ))}
      </div>
      
      {/* Current step */}
      <span className="text-xs text-gray-600">
        {currentStep?.name || 'Starting...'}
      </span>
    </div>
  );
}

export default StepProgressBar;
