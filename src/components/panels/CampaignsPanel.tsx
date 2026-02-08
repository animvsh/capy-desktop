/**
 * Campaigns Panel
 * Shows all campaigns with real-time agent activity
 */

import React, { useState } from 'react';
import { useCampaigns, useCampaign, useOrchestrator } from '@/hooks/useCampaigns';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CampaignProgress } from '@/components/chat/CampaignProgress';
import { 
  Play, 
  Pause, 
  Square, 
  Copy, 
  Download,
  ChevronRight,
  Zap,
  Users,
  Mail,
  Calendar,
  AlertCircle,
  CheckCircle,
  Clock,
  Bot,
} from 'lucide-react';
import type { 
  Campaign, 
  CampaignWithAgents, 
  CampaignAgent,
  CampaignStatus,
  AgentType,
  CampaignEvent,
} from '@/types/campaign';

// Status display helpers
const statusLabels: Record<CampaignStatus, string> = {
  drafting: 'Drafting',
  sourcing: 'Finding Leads',
  enriching: 'Enriching',
  writing: 'Writing Emails',
  reviewing: 'Awaiting Approval',
  sending: 'Sending',
  paused: 'Paused',
  completed: 'Completed',
  error: 'Error',
};

const statusColors: Record<CampaignStatus, string> = {
  drafting: 'bg-slate-500',
  sourcing: 'bg-blue-500',
  enriching: 'bg-purple-500',
  writing: 'bg-amber-500',
  reviewing: 'bg-orange-500',
  sending: 'bg-green-500',
  paused: 'bg-slate-400',
  completed: 'bg-emerald-600',
  error: 'bg-red-500',
};

const agentTypeLabels: Record<AgentType, string> = {
  scout: '🔍 Scout',
  verifier: '✅ Verifier',
  enricher: '🎯 Enricher',
  writer: '✍️ Writer',
  sender: '📤 Sender',
  watcher: '👀 Watcher',
};

export function CampaignsPanel() {
  const { campaigns, isLoading } = useCampaigns();
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const activeCampaigns = campaigns.filter(c => 
    !['completed', 'error'].includes(c.status)
  );
  const completedCampaigns = campaigns.filter(c => 
    ['completed', 'error'].includes(c.status)
  );

  return (
    <div className="flex h-full">
      {/* Campaign List */}
      <div className="w-1/3 border-r">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Campaigns</h2>
          <p className="text-sm text-muted-foreground">
            {activeCampaigns.length} active, {completedCampaigns.length} completed
          </p>
        </div>
        
        <ScrollArea className="h-[calc(100%-80px)]">
          {activeCampaigns.length > 0 && (
            <div className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Active</h3>
              {activeCampaigns.map(campaign => (
                <CampaignListItem
                  key={campaign.id}
                  campaign={campaign}
                  isSelected={selectedCampaignId === campaign.id}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                />
              ))}
            </div>
          )}
          
          {completedCampaigns.length > 0 && (
            <div className="p-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-2">Completed</h3>
              {completedCampaigns.map(campaign => (
                <CampaignListItem
                  key={campaign.id}
                  campaign={campaign}
                  isSelected={selectedCampaignId === campaign.id}
                  onClick={() => setSelectedCampaignId(campaign.id)}
                />
              ))}
            </div>
          )}

          {campaigns.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No campaigns yet</p>
              <p className="text-sm mt-1">
                Start a campaign by saying "Start a campaign to..."
              </p>
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Campaign Detail */}
      <div className="flex-1">
        {selectedCampaignId ? (
          <CampaignDetail campaignId={selectedCampaignId} />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Select a campaign to view details
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Campaign list item
 */
function CampaignListItem({ 
  campaign, 
  isSelected, 
  onClick 
}: { 
  campaign: CampaignWithAgents; 
  isSelected: boolean;
  onClick: () => void;
}) {
  const runningAgents = campaign.campaign_agents?.filter(a => a.status === 'running').length || 0;
  
  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg cursor-pointer transition-colors mb-2 ${
        isSelected 
          ? 'bg-primary/10 border border-primary/20' 
          : 'hover:bg-accent'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium truncate">{campaign.name}</h4>
            <Badge 
              variant="secondary" 
              className={`${statusColors[campaign.status]} text-white text-xs`}
            >
              {statusLabels[campaign.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {campaign.metrics?.leads_found || 0}
            </span>
            <span className="flex items-center gap-1">
              <Mail className="h-3 w-3" />
              {campaign.metrics?.emails_sent || 0}
            </span>
            {runningAgents > 0 && (
              <span className="flex items-center gap-1 text-blue-500">
                <Bot className="h-3 w-3 animate-pulse" />
                {runningAgents} running
              </span>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  );
}

/**
 * Campaign detail view
 */
function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { campaign, agents, events, pauseCampaign, resumeCampaign, stopCampaign, approveCampaign } = useCampaign(campaignId);
  const { controlCampaign, isProcessing } = useOrchestrator();

  if (!campaign) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const isPaused = campaign.status === 'paused';
  const isReviewing = campaign.status === 'reviewing';
  const isActive = !['completed', 'error', 'paused'].includes(campaign.status);
  const runningAgents = agents.filter(a => a.status === 'running');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold">{campaign.name}</h2>
              <Badge className={`${statusColors[campaign.status]} text-white`}>
                {statusLabels[campaign.status]}
              </Badge>
            </div>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Bot className="h-4 w-4" />
                {runningAgents.length} agents running
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Started {new Date(campaign.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
          
          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Approve button for campaigns awaiting approval */}
            {isReviewing && (
              <Button
                size="sm"
                onClick={() => approveCampaign()}
                disabled={isProcessing}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Approve & Send
              </Button>
            )}
            
            {isPaused ? (
              <Button
                size="sm"
                onClick={() => controlCampaign(campaignId, 'resume')}
                disabled={isProcessing}
              >
                <Play className="h-4 w-4 mr-1" />
                Resume
              </Button>
            ) : isActive && !isReviewing ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => controlCampaign(campaignId, 'pause')}
                disabled={isProcessing}
              >
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </Button>
            ) : null}
            
            {(isActive || isPaused) && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => controlCampaign(campaignId, 'stop')}
                disabled={isProcessing}
              >
                <Square className="h-4 w-4 mr-1" />
                Stop
              </Button>
            )}
            
            <Button size="sm" variant="outline">
              <Copy className="h-4 w-4 mr-1" />
              Duplicate
            </Button>
            
            <Button size="sm" variant="outline">
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden flex">
        {/* Left: Metrics & Targeting */}
        <div className="w-1/3 border-r overflow-auto p-4">
          {/* Metrics */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">Metrics</h3>
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="Leads Found"
                value={campaign.metrics?.leads_found || 0}
                icon={<Users className="h-4 w-4" />}
              />
              <MetricCard
                label="Verified"
                value={campaign.metrics?.leads_verified || 0}
                icon={<CheckCircle className="h-4 w-4" />}
              />
              <MetricCard
                label="Emails Sent"
                value={campaign.metrics?.emails_sent || 0}
                icon={<Mail className="h-4 w-4" />}
              />
              <MetricCard
                label="Replies"
                value={campaign.metrics?.emails_replied || 0}
                icon={<Mail className="h-4 w-4" />}
              />
              <MetricCard
                label="Opens"
                value={campaign.metrics?.emails_opened || 0}
                icon={<Mail className="h-4 w-4" />}
              />
              <MetricCard
                label="Meetings"
                value={campaign.metrics?.meetings_booked || 0}
                icon={<Calendar className="h-4 w-4" />}
              />
            </div>
          </div>

          <Separator className="my-4" />

          {/* Targeting */}
          <div className="mb-6">
            <h3 className="font-medium mb-3">Targeting</h3>
            <div className="space-y-2 text-sm">
              {campaign.targeting?.roles?.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Roles:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {campaign.targeting.roles.map((role, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {campaign.targeting?.industries?.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Industries:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {campaign.targeting.industries.map((ind, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {ind}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {campaign.targeting?.locations?.length > 0 && (
                <div>
                  <span className="text-muted-foreground">Locations:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {campaign.targeting.locations.map((loc, i) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {loc}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {campaign.targeting?.business_type && (
                <div>
                  <span className="text-muted-foreground">Business Type:</span>
                  <Badge variant="secondary" className="ml-2 text-xs">
                    {campaign.targeting.business_type}
                  </Badge>
                </div>
              )}
            </div>
          </div>

          <Separator className="my-4" />

          {/* Guardrails */}
          <div>
            <h3 className="font-medium mb-3">Guardrails</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Send Limit</span>
                <span>{campaign.guardrails?.max_per_day || 50}/day</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Warmup Mode</span>
                <span>{campaign.guardrails?.warmup_mode ? 'On' : 'Off'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Require Approval</span>
                <span>{campaign.guardrails?.require_approval_before_send ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Agents & Activity */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Agent Progress - Perplexity-style task view */}
          <div className="p-4 border-b">
            <CampaignProgress 
              campaignId={campaignId}
              campaignName={campaign.name}
              compact={false}
            />
          </div>

          {/* Activity Feed */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="p-4 border-b">
              <h3 className="font-medium">Activity Feed</h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-2">
                {events.map(event => (
                  <EventItem key={event.id} event={event} />
                ))}
                {events.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">
                    No activity yet
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Metric card
 */
function MetricCard({ 
  label, 
  value, 
  icon 
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-accent/50 rounded-lg p-3">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        {icon}
        {label}
      </div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}

/**
 * Agent card
 */
function AgentCard({ agent }: { agent: CampaignAgent }) {
  const isRunning = agent.status === 'running';
  const isFailed = agent.status === 'failed';
  const isCompleted = agent.status === 'completed';

  return (
    <div className={`p-3 rounded-lg border ${
      isRunning ? 'border-blue-500/50 bg-blue-500/5' :
      isFailed ? 'border-red-500/50 bg-red-500/5' :
      isCompleted ? 'border-green-500/50 bg-green-500/5' :
      'border-border'
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {agentTypeLabels[agent.agent_type]}
        </span>
        {isRunning && (
          <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
        )}
        {isCompleted && (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
        {isFailed && (
          <AlertCircle className="h-4 w-4 text-red-500" />
        )}
      </div>
      {isRunning && (
        <Progress value={agent.progress} className="h-1 mt-2" />
      )}
      {agent.task_description && (
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {agent.task_description}
        </p>
      )}
    </div>
  );
}

/**
 * Event item
 */
function EventItem({ event }: { event: CampaignEvent }) {
  const time = new Date(event.created_at).toLocaleTimeString();
  
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        {time}
      </span>
      <span>{event.display_message || event.event_type}</span>
    </div>
  );
}

export default CampaignsPanel;
