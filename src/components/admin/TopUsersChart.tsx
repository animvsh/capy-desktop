import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { Progress } from "@/components/ui/progress";

interface UserSpending {
  email: string;
  credits: number;
  percentage: number;
}

export function TopUsersChart() {
  const [data, setData] = useState<UserSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCredits, setTotalCredits] = useState(0);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Get all credit tracking data grouped by user
      const { data: costData, error: costError } = await supabase
        .from("api_cost_tracking")
        .select("user_id, credits_used");

      if (costError) throw costError;

      // Group by user_id
      const byUser = (costData || []).reduce((acc, row) => {
        acc[row.user_id] = (acc[row.user_id] || 0) + (row.credits_used || 0);
        return acc;
      }, {} as Record<string, number>);

      // Get user emails
      const userIds = Object.keys(byUser);
      if (userIds.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);

      if (profilesError) throw profilesError;

      // Create email map
      const emailMap = (profiles || []).reduce((acc, p) => {
        acc[p.user_id] = p.email || "Unknown";
        return acc;
      }, {} as Record<string, string>);

      // Convert to chart data
      const total = Object.values(byUser).reduce((sum, v) => sum + v, 0);
      setTotalCredits(total);

      const chartData: UserSpending[] = Object.entries(byUser)
        .map(([userId, credits]) => ({
          email: emailMap[userId] || userId.slice(0, 8) + "...",
          credits: Math.round(credits),
          percentage: total > 0 ? (credits / total) * 100 : 0,
        }))
        .sort((a, b) => b.credits - a.credits)
        .slice(0, 10);

      setData(chartData);
    } catch (error) {
      console.error("Error fetching top users:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className="border-3 border-border">
        <CardHeader>
          <CardTitle className="text-lg">Top Users by Spending</CardTitle>
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
          <CardTitle className="text-lg">Top Users by Spending</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No data available yet
          </div>
        </CardContent>
      </Card>
    );
  }

  // Colors for bars (gradient from amber to orange)
  const getBarColor = (index: number) => {
    const colors = [
      "#f59e0b", // amber-500
      "#f97316", // orange-500
      "#fb923c", // orange-400
      "#fdba74", // orange-300
      "#fed7aa", // orange-200
      "#fef3c7", // amber-100
      "#fef3c7",
      "#fef3c7",
      "#fef3c7",
      "#fef3c7",
    ];
    return colors[index] || colors[colors.length - 1];
  };

  return (
    <Card className="border-3 border-border">
      <CardHeader>
        <CardTitle className="text-lg">Top Users by Spending</CardTitle>
        <p className="text-sm text-muted-foreground">
          Top 10 users by credit consumption
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {data.map((user, index) => (
            <div key={user.email} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-5 text-muted-foreground text-xs font-medium">
                    #{index + 1}
                  </span>
                  <span className="text-foreground truncate max-w-[200px]">
                    {user.email}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold">{user.credits.toLocaleString()}</span>
                  <span className="text-muted-foreground text-xs w-12 text-right">
                    {user.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
              <Progress
                value={user.percentage}
                className="h-2"
                style={{
                  // @ts-ignore - custom CSS variable
                  "--progress-background": getBarColor(index),
                }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
