/**
 * useCampaignProgress - Hook for tracking real-time campaign progress
 * 
 * Provides:
 * - Live agent status updates
 * - Task counts and metrics
 * - SSE or polling-based updates
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, supabaseUntyped } from '@/integrations/supabase/client';

// Agent task types and their order in the pipeline
export const AGENT_TYPES = [
  'scout',
  'verifier',
  'enricher',
  'writer',
  'sender',
  'watcher',
] as const;

export type AgentType = typeof AGENT_TYPES[number];

// Agent display info
export const AGENT_INFO: Record<AgentType, { 
  label: string; 
  icon: string; 
  description: string;
  color: string;
}> = {
  scout: { 
    label: 'Scout', 
    icon: 'fa-magnifying-glass', 
    description: 'Finding target leads',
    color: 'blue',
  },
  verifier: { 
    label: 'Verifier', 
    icon: 'fa-check-circle', 
    description: 'Verifying email addresses',
    color: 'cyan',
  },
  enricher: { 
    label: 'Enricher', 
    icon: 'fa-database', 
    description: 'Gathering lead data',
    color: 'purple',
  },
  writer: { 
    label: 'Writer', 
    icon: 'fa-pen-fancy', 
    description: 'Drafting personalized emails',
    color: 'pink',
  },
  sender: { 
    label: 'Sender', 
    icon: 'fa-paper-plane', 
    description: 'Sending outreach emails',
    color: 'green',
  },
  watcher: { 
    label: 'Watcher', 
    icon: 'fa-eye', 
    description: 'Monitoring for replies',
    color: 'amber',
  },
};

export type AgentStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting';

export interface AgentProgress {
  type: AgentType;
  status: AgentStatus;
  progress: number; // 0-100
  message?: string;
  count?: number; // Results count (e.g., "Found 23 leads")
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface CampaignProgressData {
  campaignId: string;
  campaignName: string;
  status: string;
  agents: AgentProgress[];
  metrics: {
    leadsFound: number;
    leadsVerified: number;
    leadsEnriched: number;
    emailsDrafted: number;
    emailsSent: number;
    emailsOpened: number;
    emailsReplied: number;
  };
  startedAt?: string;
  estimatedCompletion?: string;
  overallProgress: number;
}

interface UseCampaignProgressOptions {
  campaignId: string | null;
  pollInterval?: number; // Default 2000ms
  enabled?: boolean;
}

export function useCampaignProgress({
  campaignId,
  pollInterval = 2000,
  enabled = true,
}: UseCampaignProgressOptions) {
  const [data, setData] = useState<CampaignProgressData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const fetchProgress = useCallback(async () => {
    if (!campaignId || !enabled) {
      setData(null);
      setIsLoading(false);
      return;
    }

    try {
      // Fetch campaign with agents
      const { data: campaign, error: campaignError } = await supabase
        .from('campaigns')
        .select(`
          *,
          campaign_agents (*)
        `)
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;
      if (!campaign || !mountedRef.current) return;

      // Fetch latest agent logs for counts
      const { data: logs } = await supabase
        .from('agent_logs')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .limit(50);

      // Build agent progress from campaign_agents
      const agentProgress: AgentProgress[] = AGENT_TYPES.map(type => {
        const agent = (campaign.campaign_agents || []).find(
          (a: any) => a.agent_type === type
        );
        
        if (!agent) {
          return {
            type,
            status: 'pending' as AgentStatus,
            progress: 0,
          };
        }

        // Parse count from logs or outputs
        let count = 0;
        const agentLogs = (logs || []).filter((l: any) => l.agent_id === agent.id);
        const lastLog = agentLogs[0];
        
        if (lastLog?.metadata?.count) {
          count = lastLog.metadata.count;
        } else if (agent.outputs?.count) {
          count = agent.outputs.count;
        } else if (agent.outputs?.leads?.length) {
          count = agent.outputs.leads.length;
        }

        return {
          type,
          status: agent.status as AgentStatus,
          progress: agent.progress || 0,
          message: agent.task_description || lastLog?.message,
          count,
          startedAt: agent.started_at,
          completedAt: agent.completed_at,
          error: agent.error_message,
        };
      });

      // Calculate overall progress
      const completedAgents = agentProgress.filter(a => a.status === 'completed').length;
      const runningAgents = agentProgress.filter(a => a.status === 'running');
      const runningProgress = runningAgents.reduce((sum, a) => sum + a.progress, 0) / 
        (runningAgents.length || 1);
      const overallProgress = Math.round(
        ((completedAgents + (runningProgress / 100)) / AGENT_TYPES.length) * 100
      );

      // Extract metrics
      const metrics = campaign.metrics || {};

      const progressData: CampaignProgressData = {
        campaignId: campaign.id,
        campaignName: campaign.name,
        status: campaign.status,
        agents: agentProgress,
        metrics: {
          leadsFound: metrics.leads_found || 0,
          leadsVerified: metrics.leads_verified || 0,
          leadsEnriched: metrics.leads_enriched || 0,
          emailsDrafted: metrics.emails_drafted || 0,
          emailsSent: metrics.emails_sent || 0,
          emailsOpened: metrics.emails_opened || 0,
          emailsReplied: metrics.emails_replied || 0,
        },
        startedAt: campaign.started_at,
        overallProgress,
      };

      if (mountedRef.current) {
        setData(progressData);
        setIsLoading(false);
        setError(null);
      }
    } catch (err: any) {
      console.error('[useCampaignProgress] Error:', err);
      if (mountedRef.current) {
        setError(err.message);
        setIsLoading(false);
      }
    }
  }, [campaignId, enabled]);

  // Initial fetch and polling
  useEffect(() => {
    mountedRef.current = true;
    
    if (!campaignId || !enabled) {
      setData(null);
      setIsLoading(false);
      return;
    }

    // Initial fetch
    setIsLoading(true);
    fetchProgress();

    // Start polling
    pollRef.current = setInterval(fetchProgress, pollInterval);

    // Also subscribe to realtime changes
    const channel = supabase
      .channel(`campaign_progress_${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
        () => fetchProgress()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_agents', filter: `campaign_id=eq.${campaignId}` },
        () => fetchProgress()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_logs', filter: `campaign_id=eq.${campaignId}` },
        () => fetchProgress()
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [campaignId, enabled, pollInterval, fetchProgress]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchProgress,
  };
}

/**
 * Hook to track multiple campaigns at once (for dashboard)
 */
export function useActiveCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignProgressData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActiveCampaigns = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('campaigns')
          .select(`
            *,
            campaign_agents (*)
          `)
          .eq('user_id', user.id)
          .in('status', ['sourcing', 'enriching', 'writing', 'sending', 'reviewing'])
          .order('updated_at', { ascending: false });

        if (error) throw error;

        // Transform to CampaignProgressData
        const progressData: CampaignProgressData[] = (data || []).map(campaign => {
          const agentProgress: AgentProgress[] = AGENT_TYPES.map(type => {
            const agent = (campaign.campaign_agents || []).find(
              (a: any) => a.agent_type === type
            );
            
            if (!agent) {
              return {
                type,
                status: 'pending' as AgentStatus,
                progress: 0,
              };
            }

            return {
              type,
              status: agent.status as AgentStatus,
              progress: agent.progress || 0,
              count: agent.outputs?.count,
            };
          });

          const completedAgents = agentProgress.filter(a => a.status === 'completed').length;
          const overallProgress = Math.round((completedAgents / AGENT_TYPES.length) * 100);

          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: campaign.status,
            agents: agentProgress,
            metrics: {
              leadsFound: campaign.metrics?.leads_found || 0,
              leadsVerified: campaign.metrics?.leads_verified || 0,
              leadsEnriched: campaign.metrics?.leads_enriched || 0,
              emailsDrafted: campaign.metrics?.emails_drafted || 0,
              emailsSent: campaign.metrics?.emails_sent || 0,
              emailsOpened: campaign.metrics?.emails_opened || 0,
              emailsReplied: campaign.metrics?.emails_replied || 0,
            },
            startedAt: campaign.started_at,
            overallProgress,
          };
        });

        setCampaigns(progressData);
      } catch (err) {
        console.error('[useActiveCampaigns] Error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchActiveCampaigns();

    // Poll every 5 seconds
    const interval = setInterval(fetchActiveCampaigns, 5000);

    return () => clearInterval(interval);
  }, []);

  return { campaigns, isLoading };
}

export default useCampaignProgress;
