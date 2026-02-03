/**
 * CampaignProgress - Perplexity-style task view for campaign progress
 * 
 * Features:
 * - Compact list with checkmarks/spinners
 * - Real-time status updates
 * - Expandable details for each step
 * - Progress bar and counts
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  useCampaignProgress, 
  AgentProgress, 
  AgentType,
  AGENT_INFO,
  AGENT_TYPES,
} from '@/hooks/useCampaignProgress';

interface CampaignProgressProps {
  campaignId: string;
  campaignName?: string;
  className?: string;
  compact?: boolean;
  onViewDetails?: () => void;
}

// Status icon configurations
const STATUS_ICONS = {
  pending: { icon: 'fa-circle', class: 'text-gray-400' },
  running: { icon: 'fa-spinner', class: 'text-blue-500 fa-spin' },
  completed: { icon: 'fa-check-circle', class: 'text-emerald-500' },
  failed: { icon: 'fa-exclamation-circle', class: 'text-red-500' },
  waiting: { icon: 'fa-clock', class: 'text-amber-500' },
};

// Status background colors
const STATUS_BG = {
  pending: 'bg-gray-100 dark:bg-gray-800/50',
  running: 'bg-blue-50 dark:bg-blue-900/20',
  completed: 'bg-emerald-50 dark:bg-emerald-900/20',
  failed: 'bg-red-50 dark:bg-red-900/20',
  waiting: 'bg-amber-50 dark:bg-amber-900/20',
};

/**
 * Individual agent step item
 */
function AgentStep({ 
  agent, 
  isExpanded, 
  onToggle,
  isLast 
}: { 
  agent: AgentProgress; 
  isExpanded: boolean;
  onToggle: () => void;
  isLast: boolean;
}) {
  const info = AGENT_INFO[agent.type];
  const statusConfig = STATUS_ICONS[agent.status];
  
  // Elapsed time calculation
  const [elapsed, setElapsed] = useState('');
  
  useEffect(() => {
    if (agent.status !== 'running' || !agent.startedAt) {
      if (agent.startedAt && agent.completedAt) {
        const start = new Date(agent.startedAt).getTime();
        const end = new Date(agent.completedAt).getTime();
        const seconds = Math.round((end - start) / 1000);
        setElapsed(seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`);
      }
      return;
    }

    const updateElapsed = () => {
      const start = new Date(agent.startedAt!).getTime();
      const seconds = Math.round((Date.now() - start) / 1000);
      setElapsed(seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [agent.status, agent.startedAt, agent.completedAt]);

  // Format count display
  const getCountLabel = () => {
    if (!agent.count) return null;
    
    switch (agent.type) {
      case 'scout':
        return `${agent.count} leads found`;
      case 'verifier':
        return `${agent.count} emails verified`;
      case 'enricher':
        return `${agent.count} profiles enriched`;
      case 'writer':
        return `${agent.count} emails drafted`;
      case 'sender':
        return `${agent.count} emails sent`;
      case 'watcher':
        return `${agent.count} replies detected`;
      default:
        return `${agent.count} items`;
    }
  };

  return (
    <div className="relative">
      {/* Connector line */}
      {!isLast && (
        <div 
          className={cn(
            'absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-16px)]',
            agent.status === 'completed' ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'
          )}
        />
      )}
      
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          'relative rounded-lg transition-all duration-200 cursor-pointer',
          STATUS_BG[agent.status],
          isExpanded && 'ring-1 ring-primary/20'
        )}
        onClick={onToggle}
      >
        {/* Main row */}
        <div className="flex items-center gap-3 p-2.5">
          {/* Status icon */}
          <div className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            agent.status === 'completed' && 'bg-emerald-100 dark:bg-emerald-900/50',
            agent.status === 'running' && 'bg-blue-100 dark:bg-blue-900/50',
            agent.status === 'failed' && 'bg-red-100 dark:bg-red-900/50',
            (agent.status === 'pending' || agent.status === 'waiting') && 'bg-gray-200 dark:bg-gray-700'
          )}>
            <i className={cn('fa-solid text-sm', statusConfig.icon, statusConfig.class)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{info.label}</span>
              {elapsed && (
                <span className="text-xs text-muted-foreground">{elapsed}</span>
              )}
            </div>
            
            {/* Status message or count */}
            <div className="text-xs text-muted-foreground truncate">
              {agent.status === 'running' && agent.message ? (
                agent.message
              ) : agent.status === 'completed' && agent.count ? (
                <span className="text-emerald-600 dark:text-emerald-400">{getCountLabel()}</span>
              ) : agent.status === 'failed' && agent.error ? (
                <span className="text-red-500">{agent.error}</span>
              ) : (
                info.description
              )}
            </div>
          </div>

          {/* Progress or expand icon */}
          <div className="flex items-center gap-2">
            {agent.status === 'running' && agent.progress > 0 && (
              <div className="w-16 flex items-center gap-1">
                <Progress value={agent.progress} className="h-1.5 flex-1" />
                <span className="text-[10px] text-muted-foreground w-6 text-right">
                  {agent.progress}%
                </span>
              </div>
            )}
            
            {agent.count !== undefined && agent.status !== 'running' && (
              <Badge 
                variant="secondary" 
                className={cn(
                  'text-[10px] font-mono',
                  agent.status === 'completed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300'
                )}
              >
                {agent.count}
              </Badge>
            )}

            <i className={cn(
              'fa-solid fa-chevron-down text-xs text-muted-foreground transition-transform',
              isExpanded && 'rotate-180'
            )} />
          </div>
        </div>

        {/* Expanded details */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-2.5 pb-2.5 pt-0">
                <div className="pl-11 space-y-1.5">
                  {agent.message && (
                    <p className="text-xs text-muted-foreground">
                      <i className="fa-solid fa-info-circle mr-1.5" />
                      {agent.message}
                    </p>
                  )}
                  
                  {agent.startedAt && (
                    <p className="text-xs text-muted-foreground">
                      <i className="fa-solid fa-clock mr-1.5" />
                      Started: {new Date(agent.startedAt).toLocaleTimeString()}
                    </p>
                  )}
                  
                  {agent.completedAt && (
                    <p className="text-xs text-muted-foreground">
                      <i className="fa-solid fa-check mr-1.5" />
                      Completed: {new Date(agent.completedAt).toLocaleTimeString()}
                    </p>
                  )}
                  
                  {agent.error && (
                    <p className="text-xs text-red-500">
                      <i className="fa-solid fa-exclamation-triangle mr-1.5" />
                      {agent.error}
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/**
 * Compact metrics bar
 */
function MetricsBar({ metrics }: { metrics: CampaignProgressProps['metrics'] & Record<string, number> }) {
  const items = [
    { icon: 'fa-users', label: 'Leads', value: metrics?.leadsFound || 0, color: 'text-blue-500' },
    { icon: 'fa-envelope-circle-check', label: 'Verified', value: metrics?.leadsVerified || 0, color: 'text-cyan-500' },
    { icon: 'fa-paper-plane', label: 'Sent', value: metrics?.emailsSent || 0, color: 'text-green-500' },
    { icon: 'fa-reply', label: 'Replies', value: metrics?.emailsReplied || 0, color: 'text-purple-500' },
  ];

  return (
    <div className="flex items-center gap-4 py-2 px-3 bg-muted/30 rounded-lg">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <i className={cn('fa-solid text-xs', item.icon, item.color)} />
          <span className="text-sm font-medium">{item.value}</span>
          <span className="text-xs text-muted-foreground hidden sm:inline">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Main CampaignProgress component
 */
export function CampaignProgress({
  campaignId,
  campaignName,
  className,
  compact = false,
  onViewDetails,
}: CampaignProgressProps) {
  const { data, isLoading, error } = useCampaignProgress({ 
    campaignId, 
    enabled: !!campaignId 
  });
  const [expandedAgent, setExpandedAgent] = useState<AgentType | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Auto-expand running agent
  useEffect(() => {
    if (data) {
      const running = data.agents.find(a => a.status === 'running');
      if (running && !expandedAgent) {
        setExpandedAgent(running.type);
      }
    }
  }, [data]);

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border bg-card p-4', className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-1/3" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const isActive = ['sourcing', 'enriching', 'writing', 'sending', 'reviewing'].includes(data.status);
  const isComplete = data.status === 'completed';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'rounded-xl border bg-card overflow-hidden',
        isActive && 'border-primary/30',
        className
      )}
    >
      {/* Header */}
      <div 
        className={cn(
          'flex items-center justify-between px-4 py-3 cursor-pointer',
          isActive && 'bg-gradient-to-r from-primary/5 to-transparent'
        )}
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center',
            isActive && 'bg-primary/10',
            isComplete && 'bg-emerald-100 dark:bg-emerald-900/30'
          )}>
            {isActive ? (
              <i className="fa-solid fa-bolt text-primary text-sm animate-pulse" />
            ) : isComplete ? (
              <i className="fa-solid fa-check text-emerald-500 text-sm" />
            ) : (
              <i className="fa-solid fa-pause text-muted-foreground text-sm" />
            )}
          </div>

          <div>
            <h3 className="font-medium text-sm">
              {campaignName || data.campaignName || 'Campaign'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {isActive ? 'Running' : isComplete ? 'Completed' : data.status}
              {' · '}
              {data.overallProgress}% complete
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Overall progress ring */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 transform -rotate-90" viewBox="0 0 36 36">
              <circle
                className="stroke-muted"
                strokeWidth="3"
                fill="none"
                r="15.9"
                cx="18"
                cy="18"
              />
              <circle
                className={cn(
                  'transition-all duration-500',
                  isActive ? 'stroke-primary' : 'stroke-emerald-500'
                )}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                r="15.9"
                cx="18"
                cy="18"
                strokeDasharray={`${data.overallProgress}, 100`}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium">
              {data.overallProgress}%
            </span>
          </div>

          <i className={cn(
            'fa-solid fa-chevron-down text-muted-foreground text-xs transition-transform',
            isCollapsed && '-rotate-180'
          )} />
        </div>
      </div>

      {/* Collapsible content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3">
              {/* Metrics */}
              <MetricsBar metrics={data.metrics as any} />

              {/* Agent steps */}
              <div className="space-y-2">
                {data.agents.map((agent, index) => (
                  <AgentStep
                    key={agent.type}
                    agent={agent}
                    isExpanded={expandedAgent === agent.type}
                    onToggle={() => setExpandedAgent(
                      expandedAgent === agent.type ? null : agent.type
                    )}
                    isLast={index === data.agents.length - 1}
                  />
                ))}
              </div>

              {/* Actions */}
              {onViewDetails && (
                <div className="flex justify-end pt-2">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails();
                    }}
                  >
                    View Details
                    <i className="fa-solid fa-arrow-right ml-2 text-xs" />
                  </Button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * Inline version for chat messages
 */
export function CampaignProgressInline({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useCampaignProgress({ campaignId, enabled: !!campaignId });

  if (isLoading || !data) return null;

  const completedCount = data.agents.filter(a => a.status === 'completed').length;
  const runningAgent = data.agents.find(a => a.status === 'running');

  return (
    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      {runningAgent ? (
        <>
          <i className="fa-solid fa-spinner fa-spin text-primary" />
          <span>{AGENT_INFO[runningAgent.type].label}: {runningAgent.message || 'Working...'}</span>
        </>
      ) : (
        <>
          <i className="fa-solid fa-check-circle text-emerald-500" />
          <span>{completedCount}/{AGENT_TYPES.length} agents complete</span>
        </>
      )}
    </div>
  );
}

/**
 * Mini badge for sidebar
 */
export function CampaignProgressBadge({ campaignId }: { campaignId: string }) {
  const { data } = useCampaignProgress({ campaignId, enabled: !!campaignId, pollInterval: 5000 });

  if (!data) return null;

  const isActive = ['sourcing', 'enriching', 'writing', 'sending'].includes(data.status);

  return (
    <Badge 
      variant="secondary" 
      className={cn(
        'gap-1',
        isActive && 'bg-primary/10 text-primary'
      )}
    >
      {isActive && <i className="fa-solid fa-circle text-[6px] animate-pulse" />}
      {data.overallProgress}%
    </Badge>
  );
}

export default CampaignProgress;
