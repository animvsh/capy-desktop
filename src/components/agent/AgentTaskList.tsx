/**
 * AgentTaskList - Live task updates for agent execution
 * 
 * Shows:
 * - Active tasks with progress
 * - Completed tasks with results
 * - Error tasks with messages
 * - Queued tasks waiting
 */

import { useAgentStore, AgentTask } from '@/stores/agentStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentTaskListProps {
  sessionId: string;
  className?: string;
  maxVisible?: number;
}

// Source icons
const SOURCE_ICONS: Record<string, string> = {
  apollo: 'fa-rocket',
  clado: 'fa-linkedin',
  rocketreach: 'fa-rocket',
  pdl: 'fa-database',
  hunter: 'fa-crosshairs',
  perplexity: 'fa-brain',
  web_scraper: 'fa-globe',
  cache: 'fa-box',
};

// Status configurations
const STATUS_CONFIG: Record<string, { icon: string; color: string; animate?: boolean }> = {
  pending: { icon: 'fa-circle', color: 'text-gray-400' },
  running: { icon: 'fa-spinner', color: 'text-blue-500', animate: true },
  complete: { icon: 'fa-check-circle', color: 'text-green-500' },
  error: { icon: 'fa-exclamation-circle', color: 'text-red-500' },
  cancelled: { icon: 'fa-ban', color: 'text-orange-500' },
};

function TaskItem({ task }: { task: AgentTask }) {
  const statusConfig = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const sourceIcon = SOURCE_ICONS[task.source] || 'fa-circle';

  const formatDuration = (start?: number, end?: number) => {
    if (!start) return '';
    const duration = (end || Date.now()) - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn(
        'flex items-center gap-3 py-2 px-3 rounded-lg',
        'bg-muted/50 hover:bg-muted transition-colors',
        task.status === 'running' && 'bg-blue-500/10',
        task.status === 'error' && 'bg-red-500/10'
      )}
    >
      {/* Status Icon */}
      <i
        className={cn(
          'fa-solid w-4 text-center',
          statusConfig.icon,
          statusConfig.color,
          statusConfig.animate && 'fa-spin'
        )}
      />

      {/* Source Icon & Name */}
      <div className="flex items-center gap-2 min-w-[100px]">
        <i className={cn('fa-brands', sourceIcon, 'text-muted-foreground text-xs')} />
        <span className="text-sm font-medium capitalize">{task.source}</span>
      </div>

      {/* Progress / Message */}
      <div className="flex-1 min-w-0">
        {task.status === 'running' && task.progress !== undefined ? (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-blue-500"
                initial={{ width: 0 }}
                animate={{ width: `${task.progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{task.progress}%</span>
          </div>
        ) : task.message ? (
          <span className="text-xs text-muted-foreground truncate block">
            {task.message}
          </span>
        ) : task.error ? (
          <span className="text-xs text-red-500 truncate block">
            {task.error}
          </span>
        ) : task.status === 'complete' && task.resultCount !== undefined ? (
          <span className="text-xs text-green-600">
            Found {task.resultCount} results
          </span>
        ) : null}
      </div>

      {/* Duration */}
      {(task.startedAt || task.completedAt) && (
        <span className="text-xs text-muted-foreground font-mono">
          {formatDuration(task.startedAt, task.completedAt)}
        </span>
      )}
    </motion.div>
  );
}

export function AgentTaskList({ sessionId, className, maxVisible = 5 }: AgentTaskListProps) {
  const tasks = useAgentStore((state) => state.agents.get(sessionId)?.tasks || []);

  // Sort tasks: running first, then pending, then completed/error
  const sortedTasks = [...tasks].sort((a, b) => {
    const order = { running: 0, pending: 1, complete: 2, error: 3, cancelled: 4 };
    return (order[a.status] || 5) - (order[b.status] || 5);
  });

  const visibleTasks = sortedTasks.slice(0, maxVisible);
  const hiddenCount = tasks.length - maxVisible;

  if (tasks.length === 0) {
    return null;
  }

  const runningCount = tasks.filter(t => t.status === 'running').length;
  const completeCount = tasks.filter(t => t.status === 'complete').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground">
          Tasks
        </span>
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <span className="text-xs text-blue-500">
              <i className="fa-solid fa-spinner fa-spin mr-1" />
              {runningCount} running
            </span>
          )}
          {completeCount > 0 && (
            <span className="text-xs text-green-500">
              <i className="fa-solid fa-check mr-1" />
              {completeCount}
            </span>
          )}
          {errorCount > 0 && (
            <span className="text-xs text-red-500">
              <i className="fa-solid fa-exclamation mr-1" />
              {errorCount}
            </span>
          )}
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-1">
        <AnimatePresence mode="popLayout">
          {visibleTasks.map((task) => (
            <TaskItem key={task.id} task={task} />
          ))}
        </AnimatePresence>
      </div>

      {/* Hidden count */}
      {hiddenCount > 0 && (
        <div className="text-center">
          <span className="text-xs text-muted-foreground">
            +{hiddenCount} more tasks
          </span>
        </div>
      )}
    </div>
  );
}

// Minimal version for sidebar
export function AgentTaskSummary({ sessionId }: { sessionId: string }) {
  const tasks = useAgentStore((state) => state.agents.get(sessionId)?.tasks || []);

  const running = tasks.filter(t => t.status === 'running').length;
  const complete = tasks.filter(t => t.status === 'complete').length;
  const total = tasks.length;

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      {running > 0 ? (
        <>
          <i className="fa-solid fa-spinner fa-spin text-blue-500" />
          <span>{running}/{total} tasks</span>
        </>
      ) : (
        <>
          <i className="fa-solid fa-check text-green-500" />
          <span>{complete}/{total} complete</span>
        </>
      )}
    </div>
  );
}

export default AgentTaskList;
