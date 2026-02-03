import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface EfficiencyStats {
  totalSent: number;
  totalReplies: number;
  totalOpens: number;
  totalMeetings: number;
  totalCredits: number;
  replyRate: number;
  openRate: number;
  conversionRate: number;
  costPerReply: number;
}

export function EfficiencyMetrics() {
  const [stats, setStats] = useState<EfficiencyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      // Fetch all metrics in parallel
      const [
        sentRes,
        repliesRes,
        opensRes,
        meetingsRes,
        creditsRes,
      ] = await Promise.all([
        // Total sent (outbound messages)
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "outbound"),
        // Total replies (inbound messages)
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "inbound"),
        // Total opens
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .eq("direction", "outbound")
          .not("opened_at", "is", null),
        // Total meetings
        supabase
          .from("meetings")
          .select("id", { count: "exact", head: true }),
        // Total credits used
        supabase
          .from("api_cost_tracking")
          .select("credits_used"),
      ]);

      const totalSent = sentRes.count || 0;
      const totalReplies = repliesRes.count || 0;
      const totalOpens = opensRes.count || 0;
      const totalMeetings = meetingsRes.count || 0;
      const totalCredits = creditsRes.data?.reduce((sum, r) => sum + (r.credits_used || 0), 0) || 0;

      const replyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;
      const openRate = totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0;
      const conversionRate = totalSent > 0 ? Math.round((totalMeetings / totalSent) * 100) : 0;
      const costPerReply = totalReplies > 0 ? Math.round(totalCredits / totalReplies) : 0;

      setStats({
        totalSent,
        totalReplies,
        totalOpens,
        totalMeetings,
        totalCredits,
        replyRate,
        openRate,
        conversionRate,
        costPerReply,
      });
    } catch (error) {
      console.error("Error fetching efficiency stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-2">
            <CardContent className="pt-6">
              <div className="flex items-center justify-center h-24">
                <i className="fa-solid fa-spinner fa-spin h-6 w-6 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const metrics = [
    {
      label: "Reply Rate",
      value: `${stats.replyRate}%`,
      sublabel: `${stats.totalReplies} of ${stats.totalSent} sent`,
      iconClass: "fa-solid fa-reply",
      color: "text-forest",
      bgColor: "bg-forest/10",
      trend: stats.replyRate >= 15 ? "good" : stats.replyRate >= 8 ? "ok" : "low",
    },
    {
      label: "Open Rate",
      value: `${stats.openRate}%`,
      sublabel: `${stats.totalOpens} opens tracked`,
      iconClass: "fa-solid fa-eye",
      color: "text-sage",
      bgColor: "bg-sage/10",
      trend: stats.openRate >= 40 ? "good" : stats.openRate >= 20 ? "ok" : "low",
    },
    {
      label: "Conversion Rate",
      value: `${stats.conversionRate}%`,
      sublabel: `${stats.totalMeetings} meetings booked`,
      iconClass: "fa-solid fa-bullseye",
      color: "text-terracotta",
      bgColor: "bg-terracotta/10",
      trend: stats.conversionRate >= 5 ? "good" : stats.conversionRate >= 2 ? "ok" : "low",
    },
    {
      label: "Cost per Reply",
      value: `${stats.costPerReply} cr`,
      sublabel: `${stats.totalCredits.toLocaleString()} total credits`,
      iconClass: "fa-solid fa-coins",
      color: "text-amber-600",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      trend: stats.costPerReply <= 20 ? "good" : stats.costPerReply <= 50 ? "ok" : "low",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {metrics.map((metric) => (
          <Card key={metric.label} className="border-2">
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between mb-2">
                <div className={cn("p-2 rounded-lg", metric.bgColor)}>
                  <i className={cn(metric.iconClass, "h-4 w-4", metric.color)} />
                </div>
                {metric.trend === "good" && (
                  <div className="flex items-center gap-1 text-xs font-medium text-forest">
                    <i className="fa-solid fa-arrow-trend-up h-3 w-3" />
                    Good
                  </div>
                )}
                {metric.trend === "low" && (
                  <div className="flex items-center gap-1 text-xs font-medium text-rust">
                    <i className="fa-solid fa-arrow-trend-down h-3 w-3" />
                    Low
                  </div>
                )}
              </div>
              <p className="text-2xl font-bold">{metric.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{metric.label}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{metric.sublabel}</p>
            </CardContent>
          </Card>
        ))}
    </div>
  );
}
