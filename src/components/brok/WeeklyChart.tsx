import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { startOfWeek, subWeeks, format, endOfWeek } from "date-fns";

interface WeekData {
  week: string;
  emails: number;
  meetings: number;
}

export function WeeklyChart() {
  const { user } = useAuth();
  const [data, setData] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchWeeklyData();
    }
  }, [user]);

  const fetchWeeklyData = async () => {
    if (!user) return;
    setLoading(true);

    const weeks: WeekData[] = [];
    const now = new Date();

    // Get user's conversations for message filtering
    const { data: userConvs } = await supabase
      .from("conversations")
      .select("id")
      .eq("user_id", user.id);
    
    const convIds = userConvs?.map(c => c.id) || [];

    for (let i = 3; i >= 0; i--) {
      const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });

      const [emailsRes, meetingsRes] = await Promise.all([
        convIds.length > 0
          ? supabase
              .from("messages")
              .select("id", { count: "exact" })
              .eq("direction", "outbound")
              .gte("sent_at", weekStart.toISOString())
              .lte("sent_at", weekEnd.toISOString())
              .in("conversation_id", convIds)
          : Promise.resolve({ count: 0 }),
        supabase
          .from("meetings")
          .select("id", { count: "exact" })
          .eq("user_id", user.id)
          .gte("created_at", weekStart.toISOString())
          .lte("created_at", weekEnd.toISOString()),
      ]);

      weeks.push({
        week: format(weekStart, "MMM d"),
        emails: emailsRes.count || 0,
        meetings: meetingsRes.count || 0,
      });
    }

    setData(weeks);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="h-[200px] flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const maxEmails = Math.max(...data.map(d => d.emails), 1);
  const maxMeetings = Math.max(...data.map(d => d.meetings), 1);

  return (
    <div className="space-y-4">
      {/* Simple bar visualization */}
      <div className="grid grid-cols-4 gap-2">
        {data.map((week) => (
          <div key={week.week} className="space-y-2">
            <div className="h-24 flex items-end gap-1">
              <div
                className="flex-1 bg-sand rounded-t-md transition-all"
                style={{ height: `${(week.emails / maxEmails) * 100}%`, minHeight: week.emails > 0 ? '8px' : '2px' }}
                title={`${week.emails} emails`}
              />
              <div
                className="flex-1 bg-forest rounded-t-md transition-all"
                style={{ height: `${(week.meetings / maxMeetings) * 100}%`, minHeight: week.meetings > 0 ? '8px' : '2px' }}
                title={`${week.meetings} meetings`}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground font-medium">
              {week.week}
            </p>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-sand" />
          <span className="text-muted-foreground">Emails Sent</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded bg-forest" />
          <span className="text-muted-foreground">Meetings</span>
        </div>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-lg font-bold text-foreground">
            {data.reduce((sum, d) => sum + d.emails, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Total Emails</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-lg font-bold text-foreground">
            {data.reduce((sum, d) => sum + d.meetings, 0)}
          </p>
          <p className="text-xs text-muted-foreground">Total Meetings</p>
        </div>
      </div>
    </div>
  );
}
