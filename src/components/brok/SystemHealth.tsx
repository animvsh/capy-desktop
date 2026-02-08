import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { formatDistanceToNow } from "date-fns";

interface SystemHealthProps {
  className?: string;
}

interface EnrichmentService {
  connected: boolean;
  credits?: number;
}

interface HealthStatus {
  gmailConnected: boolean;
  calendarConnected: boolean;
  meetConnected: boolean;
  lastEmailSent: string | null;
  lastReplyReceived: string | null;
  lastInboxCheck: string | null;
  todaySentCount: number;
  dailyLimit: number;
  brokActive: boolean;
  // Enrichment services
  enrichmentServices: {
    // Email finders
    clado: EnrichmentService;
    findymail: EnrichmentService;
    quickenrich: EnrichmentService;
    pdl: EnrichmentService;
    snovio: EnrichmentService;
    tomba: EnrichmentService;
    hunter: EnrichmentService;
    rocketreach: EnrichmentService;
    apollo: EnrichmentService;
    // Verification
    zerobounce: EnrichmentService;
    clearout: EnrichmentService;
    neverbounce: EnrichmentService;
  } | null;
}

type OverallStatus = "healthy" | "warning" | "error";

export function SystemHealth({ className }: SystemHealthProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHealth = async () => {
    if (!user) return;

    try {
      // Get user settings and enrichment services status in parallel
      const [settingsResult, enrichmentResult] = await Promise.all([
        supabase
          .from("user_settings")
          .select("email_connected, calendar_connected, meet_connected, daily_send_limit, brok_active, last_inbox_check")
          .eq("user_id", user.id)
          .maybeSingle(),
        supabase.functions.invoke("discover-leads", {
          body: { action: "check_status" },
        }).catch(() => ({ data: null })),
      ]);

      const settings = settingsResult.data;
      const enrichmentServices = enrichmentResult.data?.status || null;

      // Get today's sent count
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user.id);

      const conversationIds = conversations?.map(c => c.id) || [];

      let todaySent = 0;
      let lastSent: string | null = null;
      let lastReply: string | null = null;

      if (conversationIds.length > 0) {
        // Today's sent count
        const { count } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .in("conversation_id", conversationIds)
          .eq("direction", "outbound")
          .gte("sent_at", todayISO);
        todaySent = count || 0;

        // Last email sent
        const { data: lastSentData } = await supabase
          .from("messages")
          .select("sent_at")
          .in("conversation_id", conversationIds)
          .eq("direction", "outbound")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastSent = lastSentData?.sent_at || null;

        // Last reply received
        const { data: lastReplyData } = await supabase
          .from("messages")
          .select("sent_at")
          .in("conversation_id", conversationIds)
          .eq("direction", "inbound")
          .order("sent_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        lastReply = lastReplyData?.sent_at || null;
      }

      setStatus({
        gmailConnected: settings?.email_connected ?? false,
        calendarConnected: settings?.calendar_connected ?? false,
        meetConnected: settings?.meet_connected ?? false,
        lastEmailSent: lastSent,
        lastReplyReceived: lastReply,
        lastInboxCheck: settings?.last_inbox_check ?? null,
        todaySentCount: todaySent,
        dailyLimit: settings?.daily_send_limit ?? 50,
        brokActive: settings?.brok_active ?? false,
        enrichmentServices: enrichmentServices,
      });
    } catch (error) {
      console.error("Failed to fetch system health:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchHealth();
    setRefreshing(false);
  };

  if (loading || !status) {
    return (
      <div className={cn("rounded-2xl border-2 bg-card p-4 animate-pulse", className)}>
        <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-muted rounded w-2/3"></div>
      </div>
    );
  }

  // Calculate overall status
  const getOverallStatus = (): OverallStatus => {
    if (!status.gmailConnected) return "error";
    if (!status.brokActive) return "warning";

    // Check if inbox hasn't been checked in 24 hours
    if (status.lastInboxCheck) {
      const lastCheck = new Date(status.lastInboxCheck);
      const hoursSinceCheck = (Date.now() - lastCheck.getTime()) / (1000 * 60 * 60);
      if (hoursSinceCheck > 24) return "warning";
    }

    // Check if approaching daily limit
    if (status.todaySentCount >= status.dailyLimit * 0.9) return "warning";

    return "healthy";
  };

  const overallStatus = getOverallStatus();

  const statusConfig = {
    healthy: {
      bg: "bg-forest/10",
      border: "border-forest/30",
      iconClass: "fa-solid fa-circle-check",
      iconColor: "text-forest",
      label: "All systems operational",
      sublabel: status.brokActive ? "Capy is actively working" : "Ready when you are",
    },
    warning: {
      bg: "bg-sand/10",
      border: "border-sand/30",
      iconClass: "fa-solid fa-triangle-exclamation",
      iconColor: "text-sand",
      label: "Needs attention",
      sublabel: status.todaySentCount >= status.dailyLimit * 0.9
        ? "Approaching daily send limit"
        : "Check details below",
    },
    error: {
      bg: "bg-terracotta/10",
      border: "border-terracotta/30",
      iconClass: "fa-solid fa-circle-xmark",
      iconColor: "text-terracotta",
      label: "Action required",
      sublabel: !status.gmailConnected ? "Gmail not connected" : "Check configuration",
    },
  };

  const config = statusConfig[overallStatus];

  return (
    <div className={cn("rounded-2xl border-2 bg-card overflow-hidden", config.border, className)}>
      {/* Header - Always visible */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className={cn(
          "w-full flex items-center justify-between p-4 transition-colors cursor-pointer",
          config.bg,
          "hover:opacity-90"
        )}
      >
        <div className="flex items-center gap-3">
          <i className={cn(config.iconClass, "h-5 w-5", config.iconColor)} />
          <div className="text-left">
            <p className="font-semibold text-sm text-foreground">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation();
              handleRefresh();
            }}
          >
            <i className={cn("fa-solid fa-rotate h-4 w-4", refreshing && "fa-spin")} />
          </Button>
          {expanded ? (
            <i className="fa-solid fa-chevron-up h-4 w-4 text-muted-foreground" />
          ) : (
            <i className="fa-solid fa-chevron-down h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="p-4 space-y-4 border-t border-border">
          {/* Connections */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Connections
            </p>
            <div className="grid grid-cols-3 gap-2">
              <ConnectionBadge
                label="Gmail"
                connected={status.gmailConnected}
                iconClass="fa-solid fa-envelope"
              />
              <ConnectionBadge
                label="Calendar"
                connected={status.calendarConnected}
                iconClass="fa-solid fa-calendar"
              />
              <ConnectionBadge
                label="Meet"
                connected={status.meetConnected}
                iconClass="fa-solid fa-video"
              />
            </div>
          </div>

          {/* Email Enrichment Services */}
          {status.enrichmentServices && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Email Finders ({Object.values(status.enrichmentServices).filter(s => s?.connected).length}/{Object.keys(status.enrichmentServices).length})
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                <ServiceBadge label="Clado" connected={status.enrichmentServices.clado?.connected} />
                <ServiceBadge label="Findymail" connected={status.enrichmentServices.findymail?.connected} />
                <ServiceBadge label="QuickEnrich" connected={status.enrichmentServices.quickenrich?.connected} />
                <ServiceBadge label="PDL" connected={status.enrichmentServices.pdl?.connected} />
                <ServiceBadge label="Snov.io" connected={status.enrichmentServices.snovio?.connected} />
                <ServiceBadge label="Tomba" connected={status.enrichmentServices.tomba?.connected} />
                <ServiceBadge label="Hunter" connected={status.enrichmentServices.hunter?.connected} />
                <ServiceBadge label="RocketReach" connected={status.enrichmentServices.rocketreach?.connected} />
                <ServiceBadge label="Apollo" connected={status.enrichmentServices.apollo?.connected} />
                <ServiceBadge label="ZeroBounce" connected={status.enrichmentServices.zerobounce?.connected} iconClass="fa-solid fa-shield-halved" />
                <ServiceBadge label="Clearout" connected={status.enrichmentServices.clearout?.connected} iconClass="fa-solid fa-shield-halved" />
                <ServiceBadge label="NeverBounce" connected={status.enrichmentServices.neverbounce?.connected} iconClass="fa-solid fa-shield-halved" />
              </div>
            </div>
          )}

          {/* Activity */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Activity
            </p>
            <div className="space-y-2">
              <ActivityRow
                iconClass="fa-solid fa-paper-plane"
                label="Sent today"
                value={`${status.todaySentCount} / ${status.dailyLimit}`}
                warning={status.todaySentCount >= status.dailyLimit * 0.9}
              />
              <ActivityRow
                iconClass="fa-solid fa-clock"
                label="Last email sent"
                value={status.lastEmailSent
                  ? formatDistanceToNow(new Date(status.lastEmailSent), { addSuffix: true })
                  : "No emails sent yet"
                }
              />
              <ActivityRow
                iconClass="fa-solid fa-comment"
                label="Last reply received"
                value={status.lastReplyReceived
                  ? formatDistanceToNow(new Date(status.lastReplyReceived), { addSuffix: true })
                  : "No replies yet"
                }
              />
              {status.lastInboxCheck && (
                <ActivityRow
                  iconClass="fa-solid fa-rotate"
                  label="Inbox last checked"
                  value={formatDistanceToNow(new Date(status.lastInboxCheck), { addSuffix: true })}
                  warning={
                    (Date.now() - new Date(status.lastInboxCheck).getTime()) / (1000 * 60 * 60) > 24
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionBadge({
  label,
  connected,
  iconClass,
}: {
  label: string;
  connected: boolean;
  iconClass: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
        connected
          ? "bg-forest/10 text-forest"
          : "bg-muted text-muted-foreground"
      )}
    >
      <i className={cn(iconClass, "h-3.5 w-3.5")} />
      <span>{label}</span>
      {connected ? (
        <i className="fa-solid fa-circle-check h-3 w-3 ml-auto" />
      ) : (
        <i className="fa-solid fa-circle-xmark h-3 w-3 ml-auto" />
      )}
    </div>
  );
}

function ActivityRow({
  iconClass,
  label,
  value,
  warning = false,
}: {
  iconClass: string;
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <i className={cn(iconClass, "h-3.5 w-3.5")} />
        <span>{label}</span>
      </div>
      <span className={cn("font-medium", warning ? "text-sand" : "text-foreground")}>
        {value}
      </span>
    </div>
  );
}

function ServiceBadge({
  label,
  connected,
  iconClass = "fa-solid fa-database",
}: {
  label: string;
  connected?: boolean;
  iconClass?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium truncate",
        connected
          ? "bg-forest/10 text-forest"
          : "bg-muted/50 text-muted-foreground"
      )}
      title={label}
    >
      <i className={cn(iconClass, "h-2.5 w-2.5 flex-shrink-0")} />
      <span className="truncate">{label}</span>
      {connected ? (
        <i className="fa-solid fa-circle-check h-2 w-2 ml-auto flex-shrink-0" />
      ) : (
        <i className="fa-solid fa-circle-xmark h-2 w-2 ml-auto flex-shrink-0 opacity-50" />
      )}
    </div>
  );
}
