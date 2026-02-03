/**
 * Campaign Management Hooks
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, supabaseUntyped } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import type { 
  Campaign, 
  CampaignWithAgents, 
  CampaignAgent, 
  CampaignEvent,
  AgentLog 
} from '@/types/campaign';

/**
 * Hook for managing campaigns list
 */
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignWithAgents[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCampaigns = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabaseUntyped
        .from('campaigns')
        .select(`
          *,
          campaign_agents (*)
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setCampaigns(data || []);
    } catch (error: any) {
      console.error('[useCampaigns] Error:', error);
      toast({
        title: 'Error loading campaigns',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCampaigns();

    // Subscribe to campaign changes
    const channel = supabase
      .channel('campaigns_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns' },
        () => fetchCampaigns()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_agents' },
        () => fetchCampaigns()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCampaigns]);

  return { campaigns, isLoading, refetch: fetchCampaigns };
}

/**
 * Hook for managing a single campaign
 */
export function useCampaign(campaignId: string | null) {
  const [campaign, setCampaign] = useState<CampaignWithAgents | null>(null);
  const [agents, setAgents] = useState<CampaignAgent[]>([]);
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchCampaign = useCallback(async () => {
    if (!campaignId) {
      setCampaign(null);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabaseUntyped
        .from('campaigns')
        .select(`
          *,
          campaign_agents (*),
          sequences (*)
        `)
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      setCampaign(data);
      setAgents(data.campaign_agents || []);
    } catch (error: any) {
      console.error('[useCampaign] Error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [campaignId]);

  const fetchEvents = useCallback(async () => {
    if (!campaignId) return;

    const { data } = await supabaseUntyped
      .from('campaign_events')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: false })
      .limit(50);

    setEvents(data || []);
  }, [campaignId]);

  useEffect(() => {
    fetchCampaign();
    fetchEvents();

    if (!campaignId) return;

    // Subscribe to changes
    const channel = supabase
      .channel(`campaign_${campaignId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaigns', filter: `id=eq.${campaignId}` },
        () => fetchCampaign()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'campaign_agents', filter: `campaign_id=eq.${campaignId}` },
        () => fetchCampaign()
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'campaign_events', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          setEvents(prev => [payload.new as CampaignEvent, ...prev].slice(0, 50));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [campaignId, fetchCampaign, fetchEvents]);

  // Control actions
  const pauseCampaign = useCallback(async () => {
    if (!campaignId) return;
    
    const { error } = await supabaseUntyped
      .from('campaigns')
      .update({ status: 'paused' })
      .eq('id', campaignId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to pause campaign', variant: 'destructive' });
    } else {
      toast({ title: 'Campaign paused' });
    }
  }, [campaignId, toast]);

  const resumeCampaign = useCallback(async () => {
    if (!campaignId) return;
    
    const { error } = await supabaseUntyped
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaignId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to resume campaign', variant: 'destructive' });
    } else {
      toast({ title: 'Campaign resumed' });
    }
  }, [campaignId, toast]);

  const stopCampaign = useCallback(async () => {
    if (!campaignId) return;
    
    const { error } = await supabaseUntyped
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);

    if (!error) {
      await supabaseUntyped
        .from('campaign_agents')
        .update({ status: 'completed' })
        .eq('campaign_id', campaignId);
    }

    if (error) {
      toast({ title: 'Error', description: 'Failed to stop campaign', variant: 'destructive' });
    } else {
      toast({ title: 'Campaign stopped' });
    }
  }, [campaignId, toast]);

  const approveCampaign = useCallback(async () => {
    if (!campaignId || !campaign) return;
    
    // Update guardrails to not require approval and set status to sending
    const newGuardrails = {
      ...(campaign.guardrails || {}),
      require_approval_before_send: false,
    };
    
    const { error } = await supabaseUntyped
      .from('campaigns')
      .update({ 
        status: 'sending',
        guardrails: newGuardrails,
      })
      .eq('id', campaignId);

    if (error) {
      toast({ title: 'Error', description: 'Failed to approve campaign', variant: 'destructive' });
    } else {
      toast({ title: '✅ Campaign approved', description: 'Emails will start sending' });
    }
  }, [campaignId, campaign, toast]);

  return {
    campaign,
    agents,
    events,
    isLoading,
    refetch: fetchCampaign,
    pauseCampaign,
    resumeCampaign,
    stopCampaign,
    approveCampaign,
  };
}

/**
 * Hook for agent logs
 */
export function useAgentLogs(agentId: string | null) {
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!agentId) {
      setLogs([]);
      setIsLoading(false);
      return;
    }

    const fetchLogs = async () => {
      const { data } = await supabaseUntyped
        .from('agent_logs')
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(100);

      setLogs(data || []);
      setIsLoading(false);
    };

    fetchLogs();

    // Subscribe to new logs
    const channel = supabase
      .channel(`agent_logs_${agentId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agent_logs', filter: `agent_id=eq.${agentId}` },
        (payload) => {
          setLogs(prev => [payload.new as AgentLog, ...prev].slice(0, 100));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [agentId]);

  return { logs, isLoading };
}

/**
 * Hook for orchestrator communication
 */
export function useOrchestrator() {
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const sendMessage = useCallback(async (message: string) => {
    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      return await response.json();
    } catch (error: any) {
      console.error('[useOrchestrator] Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const sendCommand = useCallback(async (command: Record<string, any>) => {
    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ command }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      return await response.json();
    } catch (error: any) {
      console.error('[useOrchestrator] Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  const controlCampaign = useCallback(async (campaignId: string, action: 'pause' | 'resume' | 'stop') => {
    setIsProcessing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ campaign_id: campaignId, action }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Request failed');
      }

      const result = await response.json();
      toast({ title: result.message || 'Action completed' });
      return result;
    } catch (error: any) {
      console.error('[useOrchestrator] Error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  }, [toast]);

  return {
    sendMessage,
    sendCommand,
    controlCampaign,
    isProcessing,
  };
}
