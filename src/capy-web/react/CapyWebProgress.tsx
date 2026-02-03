// ============================================================================
// CAPY WEB - PROGRESS COMPONENT
// Real-time research progress display
// ============================================================================

import React, { useMemo } from 'react';
import { ProgressState, ExecutionStatus, NavigationEventType, TelemetryEvent } from '../types';

// ============================================================================
// PROGRESS BAR
// ============================================================================

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
  showPercentage?: boolean;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export function ProgressBar({
  value,
  max = 100,
  label,
  showPercentage = true,
  color = 'blue',
  size = 'md',
  animated = false
}: ProgressBarProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500'
  };
  
  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-3'
  };
  
  return (
    <div className="w-full">
      {(label || showPercentage) && (
        <div className="flex justify-between mb-1 text-sm">
          {label && <span className="text-gray-600 dark:text-gray-400">{label}</span>}
          {showPercentage && (
            <span className="text-gray-600 dark:text-gray-400">
              {percentage.toFixed(1)}%
            </span>
          )}
        </div>
      )}
      <div className={`w-full bg-gray-200 dark:bg-gray-700 rounded-full ${sizeClasses[size]}`}>
        <div
          className={`${colorClasses[color]} ${sizeClasses[size]} rounded-full transition-all duration-300 ${
            animated ? 'animate-pulse' : ''
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// STATUS BADGE
// ============================================================================

interface StatusBadgeProps {
  status: ExecutionStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusConfig = {
    [ExecutionStatus.IDLE]: { label: 'Idle', color: 'bg-gray-500' },
    [ExecutionStatus.PLANNING]: { label: 'Planning', color: 'bg-blue-500' },
    [ExecutionStatus.EXECUTING]: { label: 'Researching', color: 'bg-green-500' },
    [ExecutionStatus.PAUSED]: { label: 'Paused', color: 'bg-yellow-500' },
    [ExecutionStatus.STOPPING]: { label: 'Stopping', color: 'bg-orange-500' },
    [ExecutionStatus.COMPLETED]: { label: 'Complete', color: 'bg-green-600' },
    [ExecutionStatus.FAILED]: { label: 'Failed', color: 'bg-red-500' }
  };
  
  const config = statusConfig[status] || statusConfig[ExecutionStatus.IDLE];
  
  return (
    <span className={`px-2 py-1 text-xs font-medium text-white rounded-full ${config.color}`}>
      {config.label}
    </span>
  );
}

// ============================================================================
// PROGRESS PANEL
// ============================================================================

interface CapyWebProgressProps {
  progress: ProgressState | null;
  events?: TelemetryEvent[];
  onPause?: () => void;
  onResume?: () => void;
  onStop?: () => void;
  showEvents?: boolean;
  compact?: boolean;
}

export function CapyWebProgress({
  progress,
  events = [],
  onPause,
  onResume,
  onStop,
  showEvents = false,
  compact = false
}: CapyWebProgressProps) {
  if (!progress) {
    return null;
  }
  
  const isActive = progress.status === ExecutionStatus.EXECUTING;
  const isPaused = progress.status === ExecutionStatus.PAUSED;
  
  // Format elapsed time
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0 
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  };
  
  // Recent events
  const recentEvents = useMemo(() => {
    return events
      .filter(e => 
        e.type === NavigationEventType.PAGE_LOAD ||
        e.type === NavigationEventType.CLAIM_FOUND ||
        e.type === NavigationEventType.VERIFICATION
      )
      .slice(-5)
      .reverse();
  }, [events]);
  
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <StatusBadge status={progress.status} />
        <ProgressBar 
          value={progress.confidence * 100} 
          showPercentage={false}
          size="sm"
          color={progress.confidence > 0.7 ? 'green' : 'blue'}
          animated={isActive}
        />
        <span className="text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
          {(progress.confidence * 100).toFixed(0)}%
        </span>
        {onStop && isActive && (
          <button
            onClick={onStop}
            className="px-2 py-1 text-xs text-red-600 hover:text-red-700"
          >
            Stop
          </button>
        )}
      </div>
    );
  }
  
  return (
    <div className="p-4 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusBadge status={progress.status} />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {progress.currentPhase}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {isPaused && onResume && (
            <button
              onClick={onResume}
              className="px-3 py-1 text-sm text-green-600 hover:text-green-700 border border-green-300 rounded"
            >
              Resume
            </button>
          )}
          {isActive && onPause && (
            <button
              onClick={onPause}
              className="px-3 py-1 text-sm text-yellow-600 hover:text-yellow-700 border border-yellow-300 rounded"
            >
              Pause
            </button>
          )}
          {(isActive || isPaused) && onStop && (
            <button
              onClick={onStop}
              className="px-3 py-1 text-sm text-red-600 hover:text-red-700 border border-red-300 rounded"
            >
              Stop
            </button>
          )}
        </div>
      </div>
      
      {/* Confidence Progress */}
      <div>
        <ProgressBar
          value={progress.confidence * 100}
          label="Confidence"
          color={progress.confidence > 0.7 ? 'green' : progress.confidence > 0.4 ? 'blue' : 'yellow'}
          animated={isActive}
        />
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 text-center">
        <div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">
            {progress.pagesVisited}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Pages</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">
            {progress.claimsFound}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Claims</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">
            {progress.activePaths}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Active Paths</div>
        </div>
        <div>
          <div className="text-2xl font-semibold text-gray-900 dark:text-white">
            {formatTime(progress.elapsedMs)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">Elapsed</div>
        </div>
      </div>
      
      {/* Plan Summary */}
      {progress.planSummary && (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded text-sm text-gray-600 dark:text-gray-400">
          {progress.planSummary}
        </div>
      )}
      
      {/* Estimated Time */}
      {progress.estimatedRemainingMs !== undefined && progress.estimatedRemainingMs > 0 && (
        <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Estimated time remaining: {formatTime(progress.estimatedRemainingMs)}
        </div>
      )}
      
      {/* Recent Events */}
      {showEvents && recentEvents.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Recent Activity
          </div>
          <div className="space-y-1">
            {recentEvents.map((event) => (
              <EventItem key={event.id} event={event} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EVENT ITEM
// ============================================================================

interface EventItemProps {
  event: TelemetryEvent;
}

function EventItem({ event }: EventItemProps) {
  const getEventIcon = () => {
    switch (event.type) {
      case NavigationEventType.PAGE_LOAD:
        return '📄';
      case NavigationEventType.EXTRACTION:
        return '📊';
      case NavigationEventType.CLAIM_FOUND:
        return '✅';
      case NavigationEventType.VERIFICATION:
        return '🔍';
      case NavigationEventType.STRATEGY_SHIFT:
        return '🔄';
      case NavigationEventType.ERROR:
        return '❌';
      case NavigationEventType.BLOCKED:
        return '🚫';
      default:
        return '•';
    }
  };
  
  const getEventDescription = () => {
    const data = event.data;
    
    switch (event.type) {
      case NavigationEventType.PAGE_LOAD:
        return `Visited ${(data.url as string)?.replace(/^https?:\/\//, '').slice(0, 40)}...`;
      case NavigationEventType.CLAIM_FOUND:
        return `Found ${data.category} claim (${((data.confidence as number) * 100).toFixed(0)}% conf)`;
      case NavigationEventType.VERIFICATION:
        return `${data.verificationType === 'corroboration' ? 'Corroborated' : 'Contradiction found'}`;
      default:
        return event.type.replace(/_/g, ' ');
    }
  };
  
  return (
    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
      <span>{getEventIcon()}</span>
      <span className="flex-1 truncate">{getEventDescription()}</span>
      <span className="text-gray-400 dark:text-gray-500">
        {new Date(event.timestamp).toLocaleTimeString()}
      </span>
    </div>
  );
}

// ============================================================================
// MINI PROGRESS INDICATOR
// ============================================================================

interface MiniProgressProps {
  progress: ProgressState | null;
  onClick?: () => void;
}

export function MiniProgress({ progress, onClick }: MiniProgressProps) {
  if (!progress) return null;
  
  const isActive = progress.status === ExecutionStatus.EXECUTING;
  
  return (
    <div 
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm
        ${isActive ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-gray-100 dark:bg-gray-800'}
        ${onClick ? 'cursor-pointer hover:opacity-80' : ''}
      `}
      onClick={onClick}
    >
      {isActive && (
        <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
      )}
      <span className="text-gray-700 dark:text-gray-300">
        {isActive ? 'Researching...' : 'Complete'}
      </span>
      <span className="font-medium text-gray-900 dark:text-white">
        {(progress.confidence * 100).toFixed(0)}%
      </span>
    </div>
  );
}
