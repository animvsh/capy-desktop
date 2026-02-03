import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from "recharts";
import { cn } from "@/lib/utils";
import { format, subDays, parseISO, startOfDay } from "date-fns";

type TimePeriod = "7d" | "30d" | "90d";

interface DailyUsage {
  date: string;
  apollo: number;
  clado: number;
  hunter: number;
  ai: number;
  composio: number;
}

const SERVICE_COLORS = {
  apollo: "#3B82F6", // blue
  clado: "#10B981", // green
  hunter: "#F97316", // orange
  ai: "#8B5CF6", // purple
  composio: "#06B6D4", // teal
};

const SERVICE_LABELS: Record<string, string> = {
  apollo: "Apollo",
  clado: "Clado",
  hunter: "Hunter",
  ai: "AI",
  composio: "Composio",
};

export function ApiUsageChart() {
  const [data, setData] = useState<DailyUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<TimePeriod>("30d");

  useEffect(() => {
    fetchUsageData();
  }, [period]);

  const fetchUsageData = async () => {
    setLoading(true);
    try {
      const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const startDate = subDays(new Date(), days);

      const { data: trackingData, error } = await supabase
        .from("api_cost_tracking")
        .select("service, credits_used, created_at")
        .gte("created_at", startDate.toISOString())
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Group by date and service
      const grouped = new Map<string, DailyUsage>();

      // Initialize all dates with zeros
      for (let i = 0; i < days; i++) {
        const date = format(subDays(new Date(), days - 1 - i), "yyyy-MM-dd");
        grouped.set(date, {
          date,
          apollo: 0,
          clado: 0,
          hunter: 0,
          ai: 0,
          composio: 0,
        });
      }

      // Aggregate data
      (trackingData || []).forEach((row) => {
        const date = format(parseISO(row.created_at), "yyyy-MM-dd");
        const entry = grouped.get(date);
        if (entry) {
          const service = row.service?.toLowerCase() || "other";
          if (service === "apollo") entry.apollo += row.credits_used || 0;
          else if (service === "clado") entry.clado += row.credits_used || 0;
          else if (service === "hunter") entry.hunter += row.credits_used || 0;
          else if (service === "ai") entry.ai += row.credits_used || 0;
          else if (service === "composio") entry.composio += row.credits_used || 0;
        }
      });

      // Convert to array and format dates for display
      const chartData = Array.from(grouped.values()).map((entry) => ({
        ...entry,
        date: format(parseISO(entry.date), period === "7d" ? "EEE" : "MMM d"),
      }));

      setData(chartData);
    } catch (error) {
      console.error("Error fetching API usage:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate totals for legend
  const totals = data.reduce(
    (acc, day) => ({
      apollo: acc.apollo + day.apollo,
      clado: acc.clado + day.clado,
      hunter: acc.hunter + day.hunter,
      ai: acc.ai + day.ai,
      composio: acc.composio + day.composio,
    }),
    { apollo: 0, clado: 0, hunter: 0, ai: 0, composio: 0 }
  );

  const grandTotal = totals.apollo + totals.clado + totals.hunter + totals.ai + totals.composio;

  return (
    <Card className="border-2">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <i className="fa-solid fa-chart-simple h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg">API Usage Over Time</CardTitle>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d", "90d"] as TimePeriod[]).map((p) => (
              <Button
                key={p}
                variant={period === p ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs",
                  period === p && "bg-primary text-primary-foreground"
                )}
                onClick={() => setPeriod(p)}
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        {!loading && grandTotal > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {grandTotal.toLocaleString()} total credits used
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <i className="fa-solid fa-spinner fa-spin h-8 w-8 text-muted-foreground" />
          </div>
        ) : data.length === 0 || grandTotal === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <i className="fa-solid fa-chart-simple h-12 w-12 mb-3 opacity-50" />
            <p className="font-medium">No API usage data yet</p>
            <p className="text-sm">Data will appear as APIs are called</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "2px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                  formatter={(value: number, name: string) => [
                    `${value.toLocaleString()} credits`,
                    SERVICE_LABELS[name] || name,
                  ]}
                />
                <Bar dataKey="apollo" stackId="a" fill={SERVICE_COLORS.apollo} radius={[0, 0, 0, 0]} />
                <Bar dataKey="clado" stackId="a" fill={SERVICE_COLORS.clado} radius={[0, 0, 0, 0]} />
                <Bar dataKey="hunter" stackId="a" fill={SERVICE_COLORS.hunter} radius={[0, 0, 0, 0]} />
                <Bar dataKey="ai" stackId="a" fill={SERVICE_COLORS.ai} radius={[0, 0, 0, 0]} />
                <Bar dataKey="composio" stackId="a" fill={SERVICE_COLORS.composio} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>

            {/* Custom Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-3 border-t">
              {Object.entries(SERVICE_COLORS).map(([service, color]) => {
                const total = totals[service as keyof typeof totals];
                if (total === 0) return null;
                return (
                  <div key={service} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-sm"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs font-medium">
                      {SERVICE_LABELS[service]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({total.toLocaleString()})
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
