/**
 * DashboardPanel - Premium SaaS Dashboard
 * Clean, modern design inspired by Linear, Notion, and Vercel
 */

import { useState, useEffect, Suspense, lazy, useRef } from 'react';
import { MetricCard } from '@/components/brok/MetricCard';
import { BrokStatus } from '@/components/brok/BrokStatus';
import { ActivitySummary } from '@/components/brok/ActivitySummary';
import { FeatureCard } from '@/components/brok/FeatureCard';
import { ActivityFeed } from '@/components/brok/ActivityFeed';
import { useAuth } from '@/hooks/useAuth';
import { useApp } from '@/contexts/AppContext';
import { supabase, supabaseUntyped } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const FunnelChart = lazy(() => import('@/components/brok/FunnelChart').then(module => ({ default: module.FunnelChart })));
const WeeklyChart = lazy(() => import('@/components/brok/WeeklyChart').then(module => ({ default: module.WeeklyChart })));
const ProductAnalyzer = lazy(() => import('@/components/brok/ProductAnalyzer').then(module => ({ default: module.ProductAnalyzer })));

const ChartLoader = () => (
  <div className="flex items-center justify-center h-48">
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <div className="w-8 h-8 rounded-full border-2 border-muted-foreground/20" />
        <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-transparent border-t-primary animate-spin" />
      </div>
      <span className="text-xs text-muted-foreground/50">Loading...</span>
    </div>
  </div>
);

function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): T {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return ((...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  }) as T;
}

// Section Header Component
function SectionHeader({ 
  icon, 
  title, 
  subtitle 
}: { 
  icon: string; 
  title: string; 
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/50">
        <i className={cn(icon, "text-sm text-muted-foreground/70")} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle && (
          <p className="text-xs text-muted-foreground/60">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

export function DashboardPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { navigateTo } = useApp();
  const [isRunning, setIsRunning] = useState(true);
  const [emailConnected, setEmailConnected] = useState(false);
  const [hasProductProfile, setHasProductProfile] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [stats, setStats] = useState({
    meetings: 0,
    conversations: 0,
    leads: 0,
    replies: 0,
    openRate: 0,
    replyRate: 0,
  });

  const debouncedFetchStatsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (user) {
      fetchStats();
      fetchSettings();
      fetchProductProfile();

      debouncedFetchStatsRef.current = debounce(() => fetchStats(), 2000);

      const conversationsChannel = supabase
        .channel('dashboard-conversations')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${user.id}` },
          () => debouncedFetchStatsRef.current?.()
        )
        .subscribe();

      const messagesChannel = supabase
        .channel('dashboard-messages')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          () => debouncedFetchStatsRef.current?.()
        )
        .subscribe();

      return () => {
        supabase.removeChannel(conversationsChannel);
        supabase.removeChannel(messagesChannel);
      };
    }
  }, [user]);

  const fetchStats = async () => {
    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const { data: userConversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id);

    const conversationIds = userConversations?.map(c => c.id) || [];

    const [meetingsRes, conversationsRes, leadsRes, repliesTodayRes, sentRes, openedRes, conversationsWithRepliesRes, conversationsContactedRes] = await Promise.all([
      supabase.from('meetings').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('conversations').select('id', { count: 'exact' }).eq('user_id', user.id),
      supabase.from('leads').select('id', { count: 'exact' }).eq('user_id', user.id),
      conversationIds.length > 0
        ? supabase.from('messages').select('id', { count: 'exact' }).in('conversation_id', conversationIds).eq('direction', 'inbound').gte('sent_at', todayISO)
        : Promise.resolve({ count: 0 }),
      conversationIds.length > 0
        ? supabase.from('messages').select('id', { count: 'exact' }).in('conversation_id', conversationIds).eq('direction', 'outbound')
        : Promise.resolve({ count: 0 }),
      conversationIds.length > 0
        ? supabase.from('messages').select('id', { count: 'exact' }).in('conversation_id', conversationIds).eq('direction', 'outbound').not('opened_at', 'is', null)
        : Promise.resolve({ count: 0 }),
      conversationIds.length > 0
        ? supabase.from('messages').select('conversation_id', { count: 'exact', head: false }).in('conversation_id', conversationIds).eq('direction', 'inbound')
        : Promise.resolve({ data: [] }),
      conversationIds.length > 0
        ? supabase.from('messages').select('conversation_id', { count: 'exact', head: false }).in('conversation_id', conversationIds).eq('direction', 'outbound')
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

    setStats({
      meetings: meetingsRes.count || 0,
      conversations: conversationsRes.count || 0,
      leads: leadsRes.count || 0,
      replies: repliesTodayRes.count || 0,
      openRate: sent > 0 ? Math.round((opened / sent) * 100) : 0,
      replyRate: conversationsContacted > 0 ? Math.round((conversationsWithReplies / conversationsContacted) * 100) : 0,
    });
  };

  const fetchSettings = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('user_settings')
      .select('brok_active, email_connected')
      .eq('user_id', user.id)
      .maybeSingle();

    if (data) {
      setIsRunning(data.brok_active ?? true);
      setEmailConnected(data.email_connected ?? false);
    }
  };

  const fetchProductProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('product_profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    setHasProductProfile(!!data);
  };

  const toggleCapy = async () => {
    if (!user) return;

    if (!emailConnected && !isRunning) {
      toast({
        title: 'Connect your email first',
        description: 'Go to Settings to connect your Gmail account',
        variant: 'destructive',
      });
      return;
    }

    const newState = !isRunning;
    const { error } = await supabase
      .from('user_settings')
      .update({ brok_active: newState })
      .eq('user_id', user.id);

    if (error) {
      toast({ title: 'Error', description: 'Failed to update status', variant: 'destructive' });
    } else {
      setIsRunning(newState);
      toast({ title: newState ? 'Capy is running' : 'Capy is paused' });
    }
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
      toast({ title: 'Error', description: 'Failed to stop agent', variant: 'destructive' });
    } else {
      setIsRunning(false);
      toast({
        title: 'Capy stopped',
        description: 'Agent stopped and session cleared',
      });
    }
  };

  const handleProductComplete = () => {
    setShowProductModal(false);
    setHasProductProfile(true);
    toast({ title: 'Product profile updated!' });
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-8 max-w-7xl mx-auto animate-fade-in">
      {/* Header - Premium minimal design */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">Dashboard</h1>
          <ActivitySummary className="mt-2" />
        </div>
        <BrokStatus isRunning={isRunning} onToggle={toggleCapy} onStop={stopCapy} />
      </div>

      {/* Setup Alerts - More refined styling */}
      {(!hasProductProfile || !emailConnected) && (
        <div className="space-y-3">
          {!emailConnected && (
            <div className={cn(
              "group flex items-center gap-4 px-4 py-3.5 rounded-xl",
              "bg-gradient-to-r from-amber-500/5 via-amber-500/5 to-transparent",
              "border border-amber-500/10 hover:border-amber-500/20",
              "transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-amber-500/5"
            )}
            onClick={() => navigateTo('settings')}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-amber-600/10">
                <i className="fa-solid fa-envelope text-sm text-amber-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Connect your email</p>
                <p className="text-xs text-muted-foreground/70">Required to start sending outreach</p>
              </div>
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 group-hover:bg-amber-500/20 transition-colors">
                <i className="fa-solid fa-arrow-right text-[10px] text-amber-500" />
              </div>
            </div>
          )}
          {!hasProductProfile && emailConnected && (
            <div className={cn(
              "group flex items-center gap-4 px-4 py-3.5 rounded-xl",
              "bg-gradient-to-r from-primary/5 via-primary/5 to-transparent",
              "border border-primary/10 hover:border-primary/20",
              "transition-all duration-300 cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5"
            )}
            onClick={() => setShowProductModal(true)}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <i className="fa-solid fa-wand-magic-sparkles text-sm text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Teach Capy about your product</p>
                <p className="text-xs text-muted-foreground/70">Get better personalized outreach</p>
              </div>
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                <i className="fa-solid fa-arrow-right text-[10px] text-primary" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stats Grid - Premium card container */}
      <div className="relative">
        <div className={cn(
          "grid gap-px grid-cols-2 sm:grid-cols-3 lg:grid-cols-6",
          "bg-border/30 rounded-2xl overflow-hidden",
          "shadow-sm"
        )}>
          <MetricCard
            title="Meetings"
            value={stats.meetings}
            icon="fa-solid fa-calendar-check"
            variant="forest"
            className="rounded-none first:rounded-tl-2xl sm:first:rounded-tl-2xl lg:first:rounded-l-2xl lg:first:rounded-tr-none"
          />
          <MetricCard
            title="Conversations"
            value={stats.conversations}
            icon="fa-solid fa-comments"
            variant="sage"
            className="rounded-none"
          />
          <MetricCard
            title="Leads"
            value={stats.leads}
            icon="fa-solid fa-users"
            variant="clay"
            className="rounded-none sm:rounded-tr-2xl lg:rounded-none"
          />
          <MetricCard
            title="Replies Today"
            value={stats.replies}
            icon="fa-solid fa-reply"
            variant="sand"
            className="rounded-none sm:rounded-bl-2xl lg:rounded-none"
          />
          <MetricCard
            title="Open Rate"
            value={`${stats.openRate}%`}
            icon="fa-solid fa-eye"
            variant="terracotta"
            className="rounded-none"
          />
          <MetricCard
            title="Reply Rate"
            value={`${stats.replyRate}%`}
            icon="fa-solid fa-chart-line"
            variant="rust"
            className="rounded-none last:rounded-br-2xl sm:last:rounded-br-2xl lg:last:rounded-r-2xl lg:last:rounded-bl-none"
          />
        </div>
      </div>

      {/* Analytics Section */}
      <div className="space-y-5">
        <SectionHeader 
          icon="fa-solid fa-chart-simple" 
          title="Analytics" 
          subtitle="Track your outreach performance"
        />
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Funnel Chart Card */}
          <div className={cn(
            "rounded-xl bg-card/60 backdrop-blur-sm p-5",
            "border border-border/30 hover:border-border/50",
            "transition-all duration-300",
            "hover:shadow-lg hover:shadow-black/5"
          )}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500/20 to-violet-600/10">
                <i className="fa-solid fa-filter text-xs text-violet-500" />
              </div>
              <h3 className="text-sm font-medium text-foreground">Conversion Funnel</h3>
            </div>
            <Suspense fallback={<ChartLoader />}>
              <FunnelChart />
            </Suspense>
          </div>

          {/* Weekly Chart Card */}
          <div className={cn(
            "rounded-xl bg-card/60 backdrop-blur-sm p-5",
            "border border-border/30 hover:border-border/50",
            "transition-all duration-300",
            "hover:shadow-lg hover:shadow-black/5"
          )}>
            <div className="flex items-center gap-2.5 mb-5">
              <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10">
                <i className="fa-solid fa-chart-bar text-xs text-blue-500" />
              </div>
              <h3 className="text-sm font-medium text-foreground">Weekly Activity</h3>
            </div>
            <Suspense fallback={<ChartLoader />}>
              <WeeklyChart />
            </Suspense>
          </div>

          {/* Activity Feed Card */}
          <div className={cn(
            "rounded-xl bg-card/60 backdrop-blur-sm p-5",
            "border border-border/30 hover:border-border/50",
            "transition-all duration-300",
            "hover:shadow-lg hover:shadow-black/5"
          )}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10">
                  <i className="fa-solid fa-bolt text-xs text-emerald-500" />
                </div>
                <h3 className="text-sm font-medium text-foreground">Recent Activity</h3>
              </div>
              <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wide">Live</span>
            </div>
            <div className="max-h-[220px] overflow-y-auto scrollbar-hide">
              <ActivityFeed />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions Section */}
      <div className="space-y-5">
        <SectionHeader 
          icon="fa-solid fa-bolt" 
          title="Quick Actions" 
          subtitle="Common tasks at your fingertips"
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            variant="terracotta"
            icon="fa-solid fa-bullseye"
            number="01"
            title="Add Leads"
            description="Import leads manually or from CSV"
            actionLabel="Add"
            onAction={() => navigateTo('contacts')}
          />
          <FeatureCard
            variant="sage"
            icon="fa-solid fa-comments"
            number="02"
            title="Conversations"
            description="View and manage email threads"
            actionLabel="View"
            onAction={() => navigateTo('conversations')}
          />
          <FeatureCard
            variant="forest"
            icon="fa-solid fa-gear"
            number="03"
            title="Settings"
            description="Update ICP and preferences"
            actionLabel="Edit"
            onAction={() => navigateTo('settings')}
          />
          <FeatureCard
            variant="rust"
            icon="fa-solid fa-wand-magic-sparkles"
            number="04"
            title="Product Profile"
            description={hasProductProfile ? 'Update your product info' : 'Teach Capy your product'}
            actionLabel={hasProductProfile ? 'Edit' : 'Setup'}
            onAction={() => setShowProductModal(true)}
          />
        </div>
      </div>

      {/* Product Analyzer Modal */}
      <Dialog open={showProductModal} onOpenChange={setShowProductModal}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto border-border/50 bg-card/95 backdrop-blur-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10">
                <i className="fa-solid fa-wand-magic-sparkles text-sm text-primary" />
              </div>
              Teach Capy Your Product
            </DialogTitle>
          </DialogHeader>
          <Suspense fallback={
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full border-2 border-muted-foreground/20" />
                  <div className="absolute inset-0 w-10 h-10 rounded-full border-2 border-transparent border-t-primary animate-spin" />
                </div>
                <span className="text-sm text-muted-foreground">Loading...</span>
              </div>
            </div>
          }>
            <ProductAnalyzer showHeader={false} compact={true} onComplete={handleProductComplete} />
          </Suspense>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DashboardPanel;
