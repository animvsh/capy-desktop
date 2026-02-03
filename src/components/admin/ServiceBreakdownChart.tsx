import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface ServiceData {
  name: string;
  value: number;
  color: string;
}

const SERVICE_COLORS: Record<string, string> = {
  apollo: "#3b82f6", // blue
  clado: "#22c55e", // green
  hunter: "#f97316", // orange
  ai: "#a855f7", // purple
  composio: "#14b8a6", // teal
};

const SERVICE_LABELS: Record<string, string> = {
  apollo: "Apollo",
  clado: "Clado",
  hunter: "Hunter",
  ai: "AI Generation",
  composio: "Composio",
};

export function ServiceBreakdownChart() {
  const [data, setData] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCredits, setTotalCredits] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: costData, error } = await supabase
        .from("api_cost_tracking")
        .select("service, credits_used");

      if (error) throw error;

      // Group by service
      const byService = (costData || []).reduce((acc, row) => {
        const service = row.service || "unknown";
        acc[service] = (acc[service] || 0) + (row.credits_used || 0);
        return acc;
      }, {} as Record<string, number>);

      // Convert to chart data
      const chartData: ServiceData[] = Object.entries(byService)
        .filter(([_, value]) => value > 0)
        .map(([service, value]) => ({
          name: SERVICE_LABELS[service] || service,
          value: Math.round(value),
          color: SERVICE_COLORS[service] || "#6b7280",
        }))
        .sort((a, b) => b.value - a.value);

      setData(chartData);
      setTotalCredits(chartData.reduce((sum, d) => sum + d.value, 0));
    } catch (error) {
      console.error("Error fetching service breakdown:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-3 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card className="border-3 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-3 border-border">
      <CardHeader>
        <CardTitle className="text-lg">Service Breakdown</CardTitle>
        <p className="text-sm text-muted-foreground">
          {totalCredits.toLocaleString()} credits used across all services
        </p>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => [`${value.toLocaleString()} credits`, ""]}
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "2px solid hsl(var(--border))",
                  borderRadius: "8px",
                }}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-sm text-foreground">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Breakdown List */}
        <div className="mt-4 space-y-2">
          {data.map((item) => (
            <div key={item.name} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-foreground">{item.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold">{item.value.toLocaleString()}</span>
                <span className="text-muted-foreground text-xs w-12 text-right">
                  {totalCredits > 0 ? ((item.value / totalCredits) * 100).toFixed(1) : 0}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
