import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface FunnelData {
  leads: number;
  contacted: number;
  replied: number;
  meetings: number;
}

export function FunnelChart() {
  const { user } = useAuth();
  const [data, setData] = useState<FunnelData>({
    leads: 0,
    contacted: 0,
    replied: 0,
    meetings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchFunnelData();
    }
  }, [user]);

  const fetchFunnelData = async () => {
    if (!user) return;
    setLoading(true);

    const [leadsRes, contactedRes, repliedRes, meetingsRes] = await Promise.all([
      supabase.from("leads").select("id", { count: "exact" }).eq("user_id", user.id),
      supabase.from("leads").select("id", { count: "exact" }).eq("user_id", user.id).eq("status", "contacted"),
      supabase.from("leads").select("id", { count: "exact" }).eq("user_id", user.id).eq("status", "replied"),
      supabase.from("meetings").select("id", { count: "exact" }).eq("user_id", user.id),
    ]);

    setData({
      leads: leadsRes.count || 0,
      contacted: contactedRes.count || 0,
      replied: repliedRes.count || 0,
      meetings: meetingsRes.count || 0,
    });
    setLoading(false);
  };

  const stages = [
    { label: "Leads", value: data.leads, color: "bg-clay" },
    { label: "Contacted", value: data.contacted, color: "bg-sand" },
    { label: "Replied", value: data.replied, color: "bg-sage" },
    { label: "Meetings", value: data.meetings, color: "bg-forest" },
  ];

  const maxValue = Math.max(...stages.map(s => s.value), 1);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[100, 75, 50, 25].map((w, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className={`h-10 bg-muted rounded-xl`} style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {stages.map((stage, index) => {
        const widthPercent = maxValue > 0 ? Math.max((stage.value / maxValue) * 100, 10) : 10;
        const conversionRate = index > 0 && stages[index - 1].value > 0
          ? Math.round((stage.value / stages[index - 1].value) * 100)
          : null;

        return (
          <div key={stage.label} className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{stage.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-foreground">{stage.value}</span>
                {conversionRate !== null && (
                  <span className="text-xs text-muted-foreground">
                    ({conversionRate}%)
                  </span>
                )}
              </div>
            </div>
            <div className="h-8 bg-secondary/50 rounded-lg overflow-hidden">
              <div
                className={`h-full ${stage.color} rounded-lg transition-all duration-500 ease-out flex items-center justify-end pr-3`}
                style={{ width: `${widthPercent}%` }}
              >
                {stage.value > 0 && widthPercent > 20 && (
                  <span className="text-xs font-bold text-primary-foreground">
                    {stage.value}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
