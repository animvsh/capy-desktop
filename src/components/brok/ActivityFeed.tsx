import { useState, useEffect, memo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityLog {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: any;
  lead_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

// Premium activity styling with gradients
const activityConfig: Record<string, { 
  iconClass: string; 
  gradient: string;
  textColor: string;
}> = {
  email_sent: { 
    iconClass: "fa-solid fa-paper-plane", 
    gradient: "bg-gradient-to-br from-emerald-500/20 to-emerald-600/10",
    textColor: "text-emerald-500"
  },
  reply_received: { 
    iconClass: "fa-solid fa-reply", 
    gradient: "bg-gradient-to-br from-blue-500/20 to-blue-600/10",
    textColor: "text-blue-500"
  },
  meeting_booked: { 
    iconClass: "fa-solid fa-calendar-check", 
    gradient: "bg-gradient-to-br from-purple-500/20 to-purple-600/10",
    textColor: "text-purple-500"
  },
  lead_discovered: { 
    iconClass: "fa-solid fa-user-plus", 
    gradient: "bg-gradient-to-br from-teal-500/20 to-teal-600/10",
    textColor: "text-teal-500"
  },
  followup_sent: { 
    iconClass: "fa-solid fa-envelope", 
    gradient: "bg-gradient-to-br from-amber-500/20 to-amber-600/10",
    textColor: "text-amber-500"
  },
  error: { 
    iconClass: "fa-solid fa-triangle-exclamation", 
    gradient: "bg-gradient-to-br from-red-500/20 to-red-600/10",
    textColor: "text-red-500"
  },
  cooldown: { 
    iconClass: "fa-solid fa-snowflake", 
    gradient: "bg-gradient-to-br from-slate-400/20 to-slate-500/10",
    textColor: "text-slate-400"
  },
  default: { 
    iconClass: "fa-solid fa-circle", 
    gradient: "bg-muted/50",
    textColor: "text-muted-foreground/60"
  },
};

export function ActivityFeed() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchActivities();
      
      const channel = supabase
        .channel('activity-logs')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'activity_logs',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            setActivities(prev => [payload.new as ActivityLog, ...prev].slice(0, 20));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchActivities = async () => {
    if (!user) return;
    setLoading(true);

    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && data) {
      setActivities(data);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div 
            key={i} 
            className="flex items-center gap-3 animate-pulse py-2"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="h-7 w-7 rounded-lg bg-muted/50" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 rounded bg-muted/50 w-3/4" />
              <div className="h-2 rounded bg-muted/30 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <div className="w-10 h-10 rounded-xl bg-muted/50 flex items-center justify-center mb-3">
          <i className="fa-solid fa-inbox text-muted-foreground/40" />
        </div>
        <p className="text-sm text-muted-foreground/60">No recent activity</p>
        <p className="text-xs text-muted-foreground/40 mt-1">Activity will appear here</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {activities.map((activity, index) => (
        <ActivityItem key={activity.id} activity={activity} index={index} />
      ))}
    </div>
  );
}

// Memoized activity item to prevent re-renders when other items update
const ActivityItem = memo(function ActivityItem({ 
  activity, 
  index 
}: { 
  activity: ActivityLog; 
  index: number 
}) {
  const config = activityConfig[activity.type] || activityConfig.default;

  return (
    <div
      className={cn(
        "group flex items-start gap-3 py-2.5 px-2 -mx-2 rounded-lg",
        "transition-all duration-200 ease-out",
        "hover:bg-muted/30 cursor-default",
        "animate-fade-in"
      )}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {/* Icon with gradient background */}
      <div className={cn(
        "shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
        "transition-transform duration-200 group-hover:scale-105",
        config.gradient
      )}>
        <i className={cn(config.iconClass, "text-[10px]", config.textColor)} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs text-foreground/90 leading-relaxed line-clamp-2 group-hover:text-foreground transition-colors">
          {activity.title}
        </p>
        <p className="text-[10px] text-muted-foreground/50 mt-1 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
          {formatDistanceToNow(new Date(activity.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
});
