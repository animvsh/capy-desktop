/**
 * MetricsBar - Compact horizontal bar with key stats
 * Always visible at top of the Home view
 * 
 * Performance optimizations:
 * - React.memo for MetricPill to prevent re-renders
 * - Debounced fetching on realtime updates
 * - Parallel queries with Promise.all
 */

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase, supabaseUntyped } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Stats {
  meetingsToday: number;
  responsesToday: number;
  openRate: number;
  replyRate: number;
}

// Simple debounce helper
function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// Memoized pill component to prevent re-renders
const MetricPill = memo(function MetricPill({
  icon,
  label,
  value
}: {
  icon: string;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <i className={cn('fa-solid text-[10px] text-muted-foreground', icon)} />
      <span className="text-muted-foreground hidden sm:inline">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
});

export function MetricsBar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isRunning, setIsRunning] = useState(true);
  const [isStopped, setIsStopped] = useState(false);
  const [stats, setStats] = useState<Stats>({
    meetingsToday: 0,
    responsesToday: 0,
    openRate: 0,
    replyRate: 0,
  });

  const debouncedFetchStatsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user) return;

    fetchStats();
    fetchCapyStatus();

    debouncedFetchStatsRef.current = debounce(() => fetchStats(), 2000);

    // Subscribe to messages for real-time updates
    const messagesChannel = supabase
      .channel('metrics-messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => debouncedFetchStatsRef.current?.()
      )
      .subscribe();

    // Subscribe to bookings for meeting updates
    const bookingsChannel = supabase
      .channel('metrics-bookings')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'bookings',
          filter: `host_user_id=eq.${user.id}`,
        },
        () => debouncedFetchStatsRef.current?.()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(bookingsChannel);
    };
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString();

    // Get user's conversations for message queries
    const { data: userConversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id);

    const conversationIds = userConversations?.map(c => c.id) || [];

    const [meetingsRes, responsesRes, sentRes, openedRes, conversationsWithRepliesRes, conversationsContactedRes] = await Promise.all([
      // Meetings today (using meetings table since bookings may not exist)
      supabase
        .from('meetings')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id)
        .gte('scheduled_at', todayISO)
        .lt('scheduled_at', tomorrowISO),

      // Responses today (inbound messages)
      conversationIds.length > 0
        ? supabase
            .from('messages')
            .select('id', { count: 'exact' })
            .in('conversation_id', conversationIds)
            .eq('direction', 'inbound')
            .gte('sent_at', todayISO)
        : Promise.resolve({ count: 0 }),

      // Total sent messages (for open rate calculation)
      conversationIds.length > 0
        ? supabase
            .from('messages')
            .select('id', { count: 'exact' })
            .in('conversation_id', conversationIds)
            .eq('direction', 'outbound')
        : Promise.resolve({ count: 0 }),

      // Opened messages
      conversationIds.length > 0
        ? supabase
            .from('messages')
            .select('id', { count: 'exact' })
            .in('conversation_id', conversationIds)
            .eq('direction', 'outbound')
            .not('opened_at', 'is', null)
        : Promise.resolve({ count: 0 }),

      // Unique conversations with at least one reply (for reply rate)
      conversationIds.length > 0
        ? supabase
            .from('messages')
            .select('conversation_id', { count: 'exact', head: false })
            .in('conversation_id', conversationIds)
            .eq('direction', 'inbound')
        : Promise.resolve({ data: [] }),

      // Unique conversations contacted (with at least one outbound message)
      conversationIds.length > 0
        ? supabase
            .from('messages')
            .select('conversation_id', { count: 'exact', head: false })
            .in('conversation_id', conversationIds)
            .eq('direction', 'outbound')
        : Promise.resolve({ data: [] }),
    ]);

    const sent = sentRes.count || 0;
    const opened = openedRes.count || 0;

    // Get unique conversation IDs for reply rate calculation
    const conversationsWithReplies = new Set(
      conversationsWithRepliesRes.data?.map((m: any) => m.conversation_id) || []
    ).size;
    const conversationsContacted = new Set(
      conversationsContactedRes.data?.map((m: any) => m.conversation_id) || []
    ).size;

    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    const replyRate = conversationsContacted > 0 ? Math.round((conversationsWithReplies / conversationsContacted) * 100) : 0;

    setStats({
      meetingsToday: meetingsRes.count || 0,
      responsesToday: responsesRes.count || 0,
      openRate,
      replyRate,
    });
  };

  const fetchCapyStatus = async () => {
    if (!user) return;

    // Check capy_agent_state first (this is what the cron job uses)
    const { data: agentState } = await supabaseUntyped
      .from('capy_agent_state')
      .select('enabled, state')
      .eq('user_id', user.id)
      .maybeSingle();

    if (agentState) {
      // Determine state:
      // Stopped: enabled=false, state=idle
      // Paused: enabled=false, state=paused
      // Running: enabled=true
      const stopped = !agentState.enabled && agentState.state === 'idle';
      const running = agentState.enabled && agentState.state !== 'paused' && agentState.state !== 'error';

      setIsStopped(stopped);
      setIsRunning(running);
      return;
    }

    // Fallback to user_settings if no agent state exists
    const { data } = await supabase
      .from('user_settings')
      .select('brok_active')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setIsRunning(data.brok_active ?? true);
      setIsStopped(false);
    }
  };

  const toggleCapy = async () => {
    if (!user) return;

    // If stopped, start it (but it won't do anything until instructed)
    // If running, pause it
    // If paused, resume it
    const newState = !isRunning;

    // Update user_settings.brok_active
    const { error: settingsError } = await supabase
      .from('user_settings')
      .update({ brok_active: newState })
      .eq('user_id', user.id);

    if (settingsError) {
      toast({
        title: 'Error',
        description: 'Failed to update Capy status',
        variant: 'destructive',
      });
      return;
    }

    // Also update capy_agent_state to stop/start the cron job
    // Use upsert to create the row if it doesn't exist (fixes new user issue)
    const { data: existingState } = await supabaseUntyped
      .from('capy_agent_state')
      .select('state')
      .eq('user_id', user.id)
      .maybeSingle();

    const { error: agentError } = await supabaseUntyped
      .from('capy_agent_state')
      .upsert({
        user_id: user.id,
        enabled: newState,
        state: newState ? 'idle' : 'paused',
        paused_from_state: newState ? null : existingState?.state || null,
        // Set defaults for new rows
        mode: 'real',
        emails_per_hour_min: 10,
        emails_per_hour_max: 20,
        emails_sent_today: 0,
        prospects_found_today: 0,
        total_emails_sent: 0,
        total_prospects_found: 0,
        total_replies_received: 0,
      }, {
        onConflict: 'user_id',
        ignoreDuplicates: false,
      });

    if (agentError) {
      console.error('Failed to update agent state:', agentError);
      // Don't fail the whole operation, user_settings is already updated
    }

    setIsRunning(newState);
    setIsStopped(false); // No longer stopped
    toast({
      title: newState ? 'Capy is running' : 'Capy is paused',
      description: newState
        ? (isStopped ? 'Started - waiting for instructions' : 'Outreach has resumed')
        : 'All outreach is paused',
    });
  };

  const stopCapy = async () => {
    if (!user) return;

    // Stop the agent and clear the session
    const { error: settingsError } = await supabase
      .from('user_settings')
      .update({ brok_active: false })
      .eq('user_id', user.id);

    // Update capy agent state to stopped
    const { error: agentError } = await supabaseUntyped
      .from('capy_agent_state')
      .upsert({
        user_id: user.id,
        enabled: false,
        state: 'idle',
        paused_from_state: null,
        current_error: null,
      }, {
        onConflict: 'user_id'
      });

    // Clear all active chat sessions
    const { error: sessionError } = await supabaseUntyped
      .from('chat_sessions')
      .update({
        state: 'idle',
        context: {},
        current_lead_id: null,
        current_conversation_id: null,
      })
      .eq('user_id', user.id);

    if (settingsError || agentError || sessionError) {
      console.error('Stop errors:', { settingsError, agentError, sessionError });
      toast({
        title: 'Error',
        description: 'Failed to stop agent',
        variant: 'destructive',
      });
      return;
    }

    setIsRunning(false);
    setIsStopped(true);
    toast({
      title: 'Capy stopped',
      description: 'Agent stopped and session cleared',
    });
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-muted/30 border-b border-border/50 shrink-0">
      {/* Capy Status */}
      <div className="flex items-center gap-2">
        <div className={cn(
          "w-2 h-2 rounded-full",
          isRunning ? "bg-green-500" : isStopped ? "bg-red-500" : "bg-yellow-500"
        )} />
        <span className="text-xs font-medium">
          {isRunning ? "Capy Running" : isStopped ? "Stopped" : "Paused"}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleCapy}
          className="h-6 w-6 p-0"
        >
          <i className={cn(
            "fa-solid text-[10px]",
            isRunning ? "fa-pause" : "fa-play"
          )} />
        </Button>
        {!isStopped && (
          <Button
            variant="ghost"
            size="sm"
            onClick={stopCapy}
            className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
            title="Stop Capy"
          >
            <i className="fa-solid fa-stop text-[10px]" />
          </Button>
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Metrics */}
      <div className="flex items-center gap-4 overflow-x-auto scrollbar-hide">
        <MetricPill icon="fa-calendar" label="Meetings" value={stats.meetingsToday} />
        <MetricPill icon="fa-reply" label="Responses" value={stats.responsesToday} />
        <MetricPill icon="fa-eye" label="Open Rate" value={`${stats.openRate}%`} />
        <MetricPill icon="fa-chart-line" label="Reply Rate" value={`${stats.replyRate}%`} />
      </div>
    </div>
  );
}

export default MetricsBar;
