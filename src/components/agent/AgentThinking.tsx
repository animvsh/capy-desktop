/**
 * AgentThinking - Planning phase visualization
 * 
 * Shows what the agent is thinking about before executing:
 * - Question classification
 * - Source selection reasoning
 * - Stop conditions
 */

import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface AgentThinkingProps {
  sessionId: string;
  className?: string;
}

// Question type icons and colors
const QUESTION_TYPES: Record<string, { icon: string; label: string; color: string }> = {
  discovery: { icon: 'fa-magnifying-glass', label: 'Discovery', color: 'text-blue-500' },
  enrichment: { icon: 'fa-database', label: 'Enrichment', color: 'text-purple-500' },
  validation: { icon: 'fa-check-double', label: 'Validation', color: 'text-green-500' },
  synthesis: { icon: 'fa-brain', label: 'Synthesis', color: 'text-pink-500' },
  factual_lookup: { icon: 'fa-info-circle', label: 'Fact Check', color: 'text-cyan-500' },
};

// Source display info
const SOURCE_INFO: Record<string, { icon: string; name: string }> = {
  apollo: { icon: 'fa-rocket', name: 'Apollo' },
  clado: { icon: 'fa-linkedin', name: 'Clado' },
  rocketreach: { icon: 'fa-rocket', name: 'RocketReach' },
  pdl: { icon: 'fa-database', name: 'People Data Labs' },
  hunter: { icon: 'fa-crosshairs', name: 'Hunter' },
  perplexity: { icon: 'fa-brain', name: 'Perplexity' },
  web_scraper: { icon: 'fa-globe', name: 'Web Scraper' },
};

export function AgentThinking({ sessionId, className }: AgentThinkingProps) {
  const agent = useAgentStore((state) => state.agents.get(sessionId));

  if (!agent || (agent.state !== 'planning' && agent.state !== 'running')) {
    return null;
  }

  const plan = agent.plan;
  const questionType = plan?.questionType ? QUESTION_TYPES[plan.questionType] : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          'rounded-lg border bg-card/50 backdrop-blur-sm overflow-hidden',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <i className="fa-solid fa-brain text-violet-500" />
          </motion.div>
          <span className="text-sm font-medium">
            {agent.state === 'planning' ? 'Planning...' : 'Executing Plan'}
          </span>
        </div>

        <div className="p-4 space-y-4">
          {/* Question Type */}
          {questionType && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-3"
            >
              <div className={cn('w-8 h-8 rounded-lg bg-muted flex items-center justify-center', questionType.color)}>
                <i className={cn('fa-solid', questionType.icon)} />
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Question Type</div>
                <div className="font-medium">{questionType.label}</div>
              </div>
            </motion.div>
          )}

          {/* Sources */}
          {plan?.sources && plan.sources.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="text-xs text-muted-foreground mb-2">Sources (in priority order)</div>
              <div className="flex flex-wrap gap-2">
                {plan.sources.map((source, index) => {
                  const info = SOURCE_INFO[source] || { icon: 'fa-circle', name: source };
                  return (
                    <motion.div
                      key={source}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.2 + index * 0.1 }}
                      className={cn(
                        'flex items-center gap-1.5 px-2 py-1 rounded-full',
                        'bg-muted text-sm',
                        index === 0 && 'ring-2 ring-primary/20'
                      )}
                    >
                      <span className="text-xs text-muted-foreground">{index + 1}.</span>
                      <i className={cn('fa-solid', info.icon, 'text-xs')} />
                      <span>{info.name}</span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Targets */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="grid grid-cols-2 gap-4"
          >
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-bullseye text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Target Results</div>
                <div className="font-medium">{plan?.targetResults || 10}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-chart-line text-muted-foreground" />
              <div>
                <div className="text-xs text-muted-foreground">Stop Confidence</div>
                <div className="font-medium">{plan?.confidenceThreshold || 70}%</div>
              </div>
            </div>
          </motion.div>

          {/* Current Phase Message */}
          {agent.currentMessage && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-2 text-sm text-muted-foreground"
            >
              <i className="fa-solid fa-ellipsis fa-beat-fade" />
              <span>{agent.currentMessage}</span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Compact inline version
export function AgentThinkingBadge({ sessionId }: { sessionId: string }) {
  const agent = useAgentStore((state) => state.agents.get(sessionId));

  if (!agent || agent.state !== 'planning') {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 text-violet-500"
    >
      <motion.i
        className="fa-solid fa-brain text-xs"
        animate={{ scale: [1, 1.2, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span className="text-xs font-medium">Thinking...</span>
    </motion.div>
  );
}

// Full planning breakdown for debugging
export function AgentPlanDebug({ sessionId }: { sessionId: string }) {
  const agent = useAgentStore((state) => state.agents.get(sessionId));
  const eventLog = useAgentStore((state) => state.eventLog);

  if (!agent) return null;

  const agentEvents = eventLog.filter(e => e.agentId === agent.id).slice(0, 10);

  return (
    <div className="space-y-4 p-4 bg-muted rounded-lg font-mono text-xs">
      <div>
        <div className="text-muted-foreground mb-1">Agent State</div>
        <pre className="bg-background p-2 rounded overflow-auto">
          {JSON.stringify({
            id: agent.id,
            state: agent.state,
            confidence: agent.confidence,
            resultCount: agent.resultCount,
            activeTasks: agent.activeTasks,
            queuedTasks: agent.queuedTasks,
          }, null, 2)}
        </pre>
      </div>

      {agent.plan && (
        <div>
          <div className="text-muted-foreground mb-1">Search Plan</div>
          <pre className="bg-background p-2 rounded overflow-auto">
            {JSON.stringify(agent.plan, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <div className="text-muted-foreground mb-1">Recent Events ({agentEvents.length})</div>
        <div className="space-y-1 max-h-[200px] overflow-auto">
          {agentEvents.map((event, i) => (
            <div key={i} className="bg-background p-1 rounded text-[10px]">
              <span className="text-muted-foreground">
                {new Date(event.timestamp).toLocaleTimeString()}
              </span>
              {' '}
              <span className="text-primary">{event.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AgentThinking;
