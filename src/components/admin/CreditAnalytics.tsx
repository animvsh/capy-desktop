import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { supabase } from "@/integrations/supabase/client";

interface CreditStats {
  totalDistributed: number;
  totalSpent: number;
  totalRemaining: number;
  thisMonthSpending: number;
}

export function CreditAnalytics() {
  const [stats, setStats] = useState<CreditStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      // Get all user settings to calculate distributed credits
      const { data: userSettings, error: settingsError } = await supabase
        .from("user_settings")
        .select("purchased_credits, admin_credit_adjustment");

      if (settingsError) throw settingsError;

      // Get all profiles to count users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id");

      if (profilesError) throw profilesError;

      // Get all credit tracking data
      const { data: costData, error: costError } = await supabase
        .from("api_cost_tracking")
        .select("credits_used, created_at");

      if (costError) throw costError;

      // Calculate totals
      const userCount = profiles?.length || 0;
      const baseCredits = userCount * 500;
      const purchasedCredits = userSettings?.reduce((sum, s) => sum + (s.purchased_credits || 0), 0) || 0;
      const adjustmentCredits = userSettings?.reduce((sum, s) => sum + (s.admin_credit_adjustment || 0), 0) || 0;
      const totalDistributed = baseCredits + purchasedCredits + adjustmentCredits;

      const totalSpent = costData?.reduce((sum, c) => sum + (c.credits_used || 0), 0) || 0;

      // This month's spending
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const thisMonthSpending = costData
        ?.filter((c) => new Date(c.created_at) >= startOfMonth)
        .reduce((sum, c) => sum + (c.credits_used || 0), 0) || 0;

      setStats({
        totalDistributed,
        totalSpent,
        totalRemaining: totalDistributed - totalSpent,
        thisMonthSpending,
      });
    } catch (error) {
      console.error("Error fetching credit stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="border-3 border-border">
            <CardContent className="pt-6">
              <div className="animate-pulse">
                <div className="h-4 bg-muted rounded w-24 mb-2" />
                <div className="h-8 bg-muted rounded w-16" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      <Card className="border-3 border-border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30">
              <i className="fa-solid fa-coins h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Distributed</p>
              <p className="text-3xl font-bold text-foreground">
                {stats?.totalDistributed.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-3 border-border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
              <i className="fa-solid fa-arrow-trend-down h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Spent</p>
              <p className="text-3xl font-bold text-foreground">
                {stats?.totalSpent.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-3 border-border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
              <i className="fa-solid fa-arrow-trend-up h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Credits Remaining</p>
              <p className="text-3xl font-bold text-foreground">
                {stats?.totalRemaining.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-3 border-border">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <i className="fa-solid fa-calendar h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">This Month</p>
              <p className="text-3xl font-bold text-foreground">
                {stats?.thisMonthSpending.toLocaleString()}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
