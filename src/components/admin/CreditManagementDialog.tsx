import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getCreditsFromTracking } from "@/lib/calculateSpending";

interface CreditManagementDialogProps {
  user: {
    user_id: string;
    email: string | null;
    full_name: string | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  adminEmail?: string;
}

export function CreditManagementDialog({
  user,
  open,
  onOpenChange,
  onSuccess,
  adminEmail,
}: CreditManagementDialogProps) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [creditInfo, setCreditInfo] = useState<{
    credits: number;
    totalSpent: number;
    purchased: number;
    adjustment: number;
  } | null>(null);
  const [loadingCredits, setLoadingCredits] = useState(false);

  useEffect(() => {
    if (open && user) {
      fetchUserCredits();
      setAmount("");
      setReason("");
    }
  }, [open, user]);

  const fetchUserCredits = async () => {
    if (!user) return;
    setLoadingCredits(true);
    try {
      const data = await getCreditsFromTracking(user.user_id);
      setCreditInfo(data);
    } catch (error) {
      console.error("Error fetching credits:", error);
    } finally {
      setLoadingCredits(false);
    }
  };

  const handleApplyCredits = async (isAdd: boolean) => {
    if (!user || !amount) return;

    const creditAmount = parseInt(amount);
    if (isNaN(creditAmount) || creditAmount <= 0) {
      toast.error("Please enter a valid positive number");
      return;
    }

    const adjustmentAmount = isAdd ? creditAmount : -creditAmount;

    setLoading(true);
    try {
      // Get current adjustment
      const { data: settings, error: fetchError } = await supabase
        .from("user_settings")
        .select("admin_credit_adjustment")
        .eq("user_id", user.user_id)
        .single();

      if (fetchError && fetchError.code !== "PGRST116") {
        throw fetchError;
      }

      const currentAdjustment = settings?.admin_credit_adjustment || 0;
      const newAdjustment = currentAdjustment + adjustmentAmount;

      // Upsert user_settings
      const { error: updateError } = await supabase
        .from("user_settings")
        .upsert(
          {
            user_id: user.user_id,
            admin_credit_adjustment: newAdjustment,
          },
          { onConflict: "user_id" }
        );

      if (updateError) throw updateError;

      // Log the adjustment in activity_logs
      await supabase.from("activity_logs").insert({
        user_id: user.user_id,
        type: "admin_credit_adjustment",
        title: isAdd ? "Credits Added by Admin" : "Credits Removed by Admin",
        description: `${creditAmount} credits ${isAdd ? "added" : "removed"}${reason ? `: ${reason}` : ""}`,
        metadata: {
          amount: adjustmentAmount,
          reason: reason || null,
          admin_email: adminEmail || "unknown",
          previous_adjustment: currentAdjustment,
          new_adjustment: newAdjustment,
        },
      });

      toast.success(
        `${creditAmount} credits ${isAdd ? "added to" : "removed from"} ${user.email || "user"}`
      );

      // Refresh credit info
      await fetchUserCredits();

      // Clear inputs
      setAmount("");
      setReason("");

      // Callback
      onSuccess?.();
    } catch (error) {
      console.error("Error applying credits:", error);
      toast.error("Failed to apply credit adjustment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <i className="fa-solid fa-coins h-5 w-5 text-amber-500" />
            Manage Credits
          </DialogTitle>
          <DialogDescription>
            Add or remove credits for {user?.email || "this user"}
          </DialogDescription>
        </DialogHeader>

        {user && (
          <div className="space-y-6">
            {/* Current Balance */}
            <div className="p-4 bg-muted/50 rounded-lg border-2 border-border">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-muted-foreground">Current Balance</span>
                {loadingCredits ? (
                  <i className="fa-solid fa-spinner fa-spin h-4 w-4" />
                ) : (
                  <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {creditInfo?.credits.toLocaleString() || 0}
                  </span>
                )}
              </div>

              {creditInfo && (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Base credits</span>
                    <span>500</span>
                  </div>
                  {creditInfo.purchased > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Purchased</span>
                      <span className="text-green-600">+{creditInfo.purchased.toLocaleString()}</span>
                    </div>
                  )}
                  {creditInfo.adjustment !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Admin adjustments</span>
                      <span className={creditInfo.adjustment > 0 ? "text-green-600" : "text-red-600"}>
                        {creditInfo.adjustment > 0 ? "+" : ""}{creditInfo.adjustment.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Used</span>
                    <span className="text-red-600">-{creditInfo.totalSpent.toLocaleString()}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Amount Input */}
            <div className="space-y-2">
              <Label htmlFor="amount">Credit Amount</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                placeholder="Enter amount (e.g., 100)"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="border-2"
              />
            </div>

            {/* Reason Input */}
            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                placeholder="Why are you adjusting credits? (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="border-2 resize-none"
                rows={2}
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 gap-2 border-2 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900/30"
                onClick={() => handleApplyCredits(true)}
                disabled={loading || !amount}
              >
                {loading ? (
                  <i className="fa-solid fa-spinner fa-spin h-4 w-4" />
                ) : (
                  <i className="fa-solid fa-plus h-4 w-4" />
                )}
                Add Credits
              </Button>
              <Button
                variant="outline"
                className="flex-1 gap-2 border-2 border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30"
                onClick={() => handleApplyCredits(false)}
                disabled={loading || !amount}
              >
                {loading ? (
                  <i className="fa-solid fa-spinner fa-spin h-4 w-4" />
                ) : (
                  <i className="fa-solid fa-minus h-4 w-4" />
                )}
                Remove Credits
              </Button>
            </div>

            {/* Quick Add Buttons */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Quick Add</Label>
              <div className="flex gap-2 flex-wrap">
                {[100, 500, 1000, 5000].map((quickAmount) => (
                  <Badge
                    key={quickAmount}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted transition-colors border-2 px-3 py-1"
                    onClick={() => setAmount(quickAmount.toString())}
                  >
                    +{quickAmount.toLocaleString()}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
