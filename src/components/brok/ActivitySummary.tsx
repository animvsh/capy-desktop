import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface ActivitySummaryProps {
  className?: string;
}

interface SummaryData {
  sentToday: number;
  repliesReceived: number;
  pendingReview: number;
  nextAction: {
    type: string;
    description: string;
  } | null;
}

export function ActivitySummary({ className }: ActivitySummaryProps) {
  const { user } = useAuth();
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = async () => {
    if (!user) return;

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISO = today.toISOString();

      const { data: conversations } = await supabase
        .from("conversations")
        .select("id")
        .eq("user_id", user.id);

      const conversationIds = conversations?.map(c => c.id) || [];

      let sentToday = 0;
      let repliesReceived = 0;

      if (conversationIds.length > 0) {
        const { count: sentCount } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .in("conversation_id", conversationIds)
          .eq("direction", "outbound")
          .gte("sent_at", todayISO);
        sentToday = sentCount || 0;

        const { count: replyCount } = await supabase
          .from("messages")
          .select("id", { count: "exact" })
          .in("conversation_id", conversationIds)
          .eq("direction", "inbound")
          .gte("sent_at", todayISO);
        repliesReceived = replyCount || 0;
      }

      const { count: pendingCount } = await supabase
        .from("leads")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "pending_review");

      const { count: proposalCount } = await supabase
        .from("meeting_proposals")
        .select("id", { count: "exact" })
        .eq("user_id", user.id)
        .eq("status", "pending");

      let nextAction: SummaryData["nextAction"] = null;

      if ((proposalCount || 0) > 0) {
        nextAction = {
          type: "proposal",
          description: `${proposalCount} proposal${(proposalCount || 0) > 1 ? 's' : ''} pending`,
        };
      } else if ((pendingCount || 0) > 0) {
        nextAction = {
          type: "leads",
          description: `${pendingCount} lead${(pendingCount || 0) > 1 ? 's' : ''} to review`,
        };
      }

      setData({
        sentToday,
        repliesReceived,
        pendingReview: pendingCount || 0,
        nextAction,
      });
    } catch (error) {
      console.error("Failed to fetch activity summary:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000);
    return () => clearInterval(interval);
  }, [user]);

  if (loading || !data) {
    return (
      <div className={cn("flex items-center gap-4 animate-pulse", className)}>
        <div className="h-4 bg-muted/50 rounded-full w-20" />
        <div className="h-4 bg-muted/50 rounded-full w-24" />
      </div>
    );
  }

  const hasActivity = data.sentToday > 0 || data.repliesReceived > 0;

  if (!hasActivity && !data.nextAction) {
    return (
      <div className={cn("flex items-center gap-2 text-sm", className)}>
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ready to work</span>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      {/* Stats pills */}
      {data.sentToday > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/50">
          <i className="fa-solid fa-paper-plane text-[10px] text-emerald-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{data.sentToday}</span> sent
          </span>
        </div>
      )}
      
      {data.repliesReceived > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/50">
          <i className="fa-solid fa-reply text-[10px] text-blue-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">{data.repliesReceived}</span> replies
          </span>
        </div>
      )}
      
      {data.pendingReview > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
          <i className="fa-solid fa-inbox text-[10px] text-amber-500" />
          <span className="text-xs text-muted-foreground">
            <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">{data.pendingReview}</span> to review
          </span>
        </div>
      )}

      {/* Next action hint */}
      {data.nextAction && !data.pendingReview && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
          <i className="fa-solid fa-arrow-right text-[10px]" />
          <span>{data.nextAction.description}</span>
        </div>
      )}
    </div>
  );
}
