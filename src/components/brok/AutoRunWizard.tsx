import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { calculateTotalSpendingFromLogs } from "@/lib/calculateSpending";

type StepStatus = "waiting" | "running" | "done" | "error";

type StepProgress = {
  status: StepStatus;
  message: string;
  details?: string[];
  progress?: { current: number; total: number };
};

type Job = {
  id: string;
  user_id: string;
  test_email: string;
  status: "pending" | "running" | "completed" | "error";
  current_step: string | null;
  steps: Record<string, StepProgress>;
  prospects: any[];
  sent_results: any[];
  icp_data: any;
  error: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_STEPS: Record<string, StepProgress> = {
  loadIcp: { status: "waiting", message: "Load ICP profile" },
  search: { status: "waiting", message: "Search for prospects" },
  enrich: { status: "waiting", message: "Find emails (parallel)" },
  draft: { status: "waiting", message: "Generate personalized emails" },
  send: { status: "waiting", message: "Send test emails" },
  log: { status: "waiting", message: "Log conversations" },
};

const STEP_CONFIG = [
  { key: "loadIcp", label: "Load ICP Profile", iconClass: "fa-solid fa-user" },
  { key: "search", label: "Search Prospects", iconClass: "fa-solid fa-magnifying-glass" },
  { key: "enrich", label: "Find Emails", iconClass: "fa-solid fa-envelope" },
  { key: "draft", label: "Generate Emails", iconClass: "fa-solid fa-wand-magic-sparkles" },
  { key: "send", label: "Send Test Emails", iconClass: "fa-solid fa-paper-plane" },
  { key: "log", label: "Log Conversations", iconClass: "fa-solid fa-comment" },
] as const;

export function AutoRunWizard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [wasResumed, setWasResumed] = useState(false);
  const [emailVerificationEnabled, setEmailVerificationEnabled] = useState(false);
  const [savingVerification, setSavingVerification] = useState(false);

  // Job data from Realtime
  const [status, setStatus] = useState<Job["status"]>("pending");
  const [steps, setSteps] = useState<Record<string, StepProgress>>({ ...DEFAULT_STEPS });
  const [prospects, setProspects] = useState<any[]>([]);
  const [sentResults, setSentResults] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isRunning = status === "running";
  const isComplete = status === "completed";

  // Fetch email verification setting
  useEffect(() => {
    if (!user?.id) return;

    const fetchVerificationSetting = async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("email_verification_enabled")
        .eq("user_id", user.id)
        .single();
      
      if (data) {
        setEmailVerificationEnabled(data.email_verification_enabled ?? false);
      }
    };

    fetchVerificationSetting();
  }, [user?.id]);

  // Check for existing running/recent job on mount
  useEffect(() => {
    if (!user?.id) return;

    const checkExistingJob = async () => {
      // Check for running jobs first
      const { data: runningJob } = await supabase
        .from("auto_run_jobs")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "running")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (runningJob) {
        console.log("[AutoRunWizard] Found running job:", runningJob.id);
        restoreFromJob(runningJob as Job);
        setWasResumed(true);
        return;
      }

      // Check for recent completed/error jobs (within last 10 minutes)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data: recentJob } = await supabase
        .from("auto_run_jobs")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["completed", "error"])
        .gte("updated_at", tenMinutesAgo)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (recentJob) {
        console.log("[AutoRunWizard] Found recent job:", recentJob.id, recentJob.status);
        restoreFromJob(recentJob as Job);
        setWasResumed(true);
      }
    };

    checkExistingJob();
  }, [user?.id]);

  // Restore UI state from a job
  const restoreFromJob = (job: Job) => {
    setJobId(job.id);
    setTestEmail(job.test_email);
    setStatus(job.status);
    setSteps(job.steps || { ...DEFAULT_STEPS });
    setProspects(job.prospects || []);
    setSentResults(job.sent_results || []);
    setError(job.error);
  };

  // Subscribe to job updates via Realtime with polling fallback
  useEffect(() => {
    if (!jobId) return;

    console.log("[AutoRunWizard] Subscribing to job:", jobId);

    // Helper to update state from job
    const updateFromJob = (job: Job, showToasts = true) => {
      setStatus(job.status);
      setSteps(job.steps || { ...DEFAULT_STEPS });
      setProspects(job.prospects || []);
      setSentResults(job.sent_results || []);
      setError(job.error);

      // Show toast on completion
      if (showToasts && job.status === "completed") {
        const successCount = (job.sent_results || []).filter((r: any) => r.success).length;
        toast({
          title: "All done!",
          description: `Sent ${successCount} test emails to ${job.test_email}`,
        });
      } else if (showToasts && job.status === "error" && job.error) {
        toast({
          title: "Error",
          description: job.error,
          variant: "destructive",
        });
      }
    };

    // Realtime subscription
    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "auto_run_jobs",
          filter: `id=eq.${jobId}`,
        },
        (payload) => {
          console.log("[AutoRunWizard] Job update received:", payload.new);
          updateFromJob(payload.new as Job);
        }
      )
      .subscribe((subscriptionStatus) => {
        console.log("[AutoRunWizard] Subscription status:", subscriptionStatus);
      });

    // Polling fallback - poll every 2 seconds while job is running
    const pollInterval = setInterval(async () => {
      // Only poll if job is still running
      if (status !== "running") {
        return;
      }

      try {
        const { data: job, error: fetchError } = await supabase
          .from("auto_run_jobs")
          .select("*")
          .eq("id", jobId)
          .single();

        if (fetchError) {
          console.error("[AutoRunWizard] Polling error:", fetchError);
          return;
        }

        if (job) {
          console.log("[AutoRunWizard] Poll update:", job.current_step, job.status);
          updateFromJob(job as Job, false); // Don't show toasts on poll
        }
      } catch (err) {
        console.error("[AutoRunWizard] Polling exception:", err);
      }
    }, 2000);

    return () => {
      console.log("[AutoRunWizard] Unsubscribing from job:", jobId);
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [jobId, status, toast]);

  // Start a new run
  const startRun = async () => {
    if (!user?.id || !testEmail.includes("@")) {
      toast({
        title: "Invalid email",
        description: "Please enter a valid test email address",
        variant: "destructive",
      });
      return;
    }

    setIsStarting(true);
    setWasResumed(false);

    try {
      // Check user credits before starting (calculate from logs, same as Admin panel)
      const { data: settings, error: creditsError } = await supabase
        .from("user_settings")
        .select("purchased_credits")
        .eq("user_id", user.id)
        .maybeSingle();

      if (creditsError) {
        throw new Error("Failed to check credits");
      }

      const purchasedCredits = settings?.purchased_credits ?? 0;

      // Calculate total spending from logs (same as Admin panel)
      const totalSpending = await calculateTotalSpendingFromLogs(user.id);

      // Calculate credits: 500 + purchased_credits - (total_spending * 100)
      const currentCredits = 500 + purchasedCredits - Math.ceil(totalSpending * 100);

      if (currentCredits <= 0) {
        toast({
          title: "Insufficient Credits",
          description: "You have run out of credits. Please purchase more credits to continue using Capy.",
          variant: "destructive",
        });
        setIsStarting(false);
        return;
      }

      // Create job row in database
      const { data: job, error: insertError } = await supabase
        .from("auto_run_jobs")
        .insert({
          user_id: user.id,
          test_email: testEmail,
          status: "running",
          steps: { ...DEFAULT_STEPS },
          prospects: [],
          sent_results: [],
        })
        .select()
        .single();

      if (insertError || !job) {
        throw new Error(insertError?.message || "Failed to create job");
      }

      console.log("[AutoRunWizard] Created job:", job.id);

      // Update local state
      setJobId(job.id);
      setStatus("running");
      setSteps({ ...DEFAULT_STEPS });
      setProspects([]);
      setSentResults([]);
      setError(null);

      // Invoke edge function (fire and forget)
      supabase.functions.invoke("auto-run-job", {
        body: { jobId: job.id },
      }).then((response) => {
        console.log("[AutoRunWizard] Edge function response:", response);
      }).catch((err) => {
        console.error("[AutoRunWizard] Edge function error:", err);
      });

    } catch (err) {
      console.error("[AutoRunWizard] Start error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start run",
        variant: "destructive",
      });
    } finally {
      setIsStarting(false);
    }
  };

  // Stop the running job
  const stopRun = async () => {
    if (!jobId) return;

    setIsStopping(true);
    try {
      // Update job status to cancelled
      const { error: updateError } = await supabase
        .from("auto_run_jobs")
        .update({ status: "cancelled", error: "Stopped by user" })
        .eq("id", jobId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setStatus("cancelled" as any);
      setError("Stopped by user");

      toast({
        title: "Stopped",
        description: "The auto-run has been stopped",
      });
    } catch (err) {
      console.error("[AutoRunWizard] Stop error:", err);
      toast({
        title: "Error",
        description: "Failed to stop the run",
        variant: "destructive",
      });
    } finally {
      setIsStopping(false);
    }
  };

  // Reset to start fresh
  const reset = () => {
    setJobId(null);
    setStatus("pending");
    setSteps({ ...DEFAULT_STEPS });
    setProspects([]);
    setSentResults([]);
    setError(null);
    setWasResumed(false);
    setIsStopping(false);
  };

  // Calculate overall progress
  const getOverallProgress = () => {
    const stepKeys = STEP_CONFIG.map(s => s.key);
    const doneCount = stepKeys.filter(key => steps[key]?.status === "done").length;
    const runningStep = stepKeys.findIndex(key => steps[key]?.status === "running");

    if (runningStep >= 0) {
      const stepProgress = steps[stepKeys[runningStep]]?.progress;
      if (stepProgress && stepProgress.total > 0) {
        const stepFraction = stepProgress.current / stepProgress.total;
        return ((runningStep + stepFraction) / stepKeys.length) * 100;
      }
      return ((runningStep + 0.5) / stepKeys.length) * 100;
    }

    return (doneCount / stepKeys.length) * 100;
  };

  const successCount = sentResults.filter((r: any) => r.success).length;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <i className="fa-solid fa-wand-magic-sparkles h-7 w-7 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold">Capy Auto-Run</h1>
        <p className="text-muted-foreground">
          Watch Capy find leads and send test emails automatically
        </p>
      </div>

      {/* Resume Banner */}
      {wasResumed && !isComplete && !isRunning && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <i className="fa-solid fa-circle-exclamation h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="font-medium text-blue-900">Session Resumed</p>
              <p className="text-sm text-blue-700">
                {error ? "Previous run encountered an error" : "Showing progress from your previous session"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            className="text-blue-700 hover:text-blue-900 hover:bg-blue-100 shrink-0"
          >
            Start Over
          </Button>
        </div>
      )}

      {/* Live Update Indicator */}
      {isRunning && (
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-3 flex items-center gap-3">
          <div className="relative">
            <div className="h-3 w-3 bg-green-500 rounded-full animate-pulse" />
            <div className="absolute inset-0 h-3 w-3 bg-green-500 rounded-full animate-ping opacity-75" />
          </div>
          <p className="text-sm text-green-800 font-medium">
            Running on server - you can close this tab and come back anytime
          </p>
        </div>
      )}

      {/* Email Input */}
      <div className="space-y-2">
        <label className="text-sm font-medium">Test Email Address</label>
        <Input
          type="email"
          value={testEmail}
          onChange={(e) => setTestEmail(e.target.value)}
          placeholder="your@email.com"
          className="text-lg h-12 rounded-xl"
          disabled={isRunning || isStarting}
        />
        
        <div className="flex items-center justify-between gap-4 p-3 rounded-lg border bg-muted/50">
          <div className="flex items-center gap-3 flex-1">
            <i className="fa-solid fa-shield-check h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Label htmlFor="emailVerification" className="text-sm font-medium cursor-pointer">
                Email Verification
              </Label>
              <p className="text-xs text-muted-foreground">
                Verify emails before accepting (slower but more accurate)
              </p>
            </div>
          </div>
          <Switch
            id="emailVerification"
            checked={emailVerificationEnabled}
            onCheckedChange={async (checked) => {
              setEmailVerificationEnabled(checked);
              setSavingVerification(true);
              try {
                const { error } = await supabase
                  .from("user_settings")
                  .update({ email_verification_enabled: checked })
                  .eq("user_id", user?.id);
                
                if (error) throw error;
                
                toast({
                  title: checked ? "Email verification enabled" : "Email verification disabled",
                  description: checked 
                    ? "Emails will be verified before accepting (slower but more accurate)"
                    : "All found emails will be accepted (faster)",
                });
              } catch (err) {
                console.error("Error updating verification setting:", err);
                toast({
                  title: "Error",
                  description: "Failed to update email verification setting",
                  variant: "destructive",
                });
                setEmailVerificationEnabled(!checked); // Revert on error
              } finally {
                setSavingVerification(false);
              }
            }}
            disabled={savingVerification || isRunning || isStarting}
            className="shrink-0"
          />
        </div>
        
        <p className="text-xs text-muted-foreground">
          All emails will be sent to this address with [TEST] prefix
        </p>
      </div>

      {/* Overall Progress */}
      {(isRunning || isComplete || error) && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">
              {isComplete ? "Complete!" : error ? "Error" : "Progress"}
            </span>
            <span className="text-muted-foreground">
              {Math.round(getOverallProgress())}%
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full transition-all duration-500",
                error ? "bg-red-500" : isComplete ? "bg-green-500" : "bg-primary"
              )}
              style={{ width: `${getOverallProgress()}%` }}
            />
          </div>
        </div>
      )}

      {/* Step Cards */}
      <div className="space-y-3">
        {STEP_CONFIG.map(({ key, label, iconClass }) => {
          const step = steps[key] || { status: "waiting", message: label };
          return (
            <div
              key={key}
              className={cn(
                "p-4 rounded-xl border-2 transition-all duration-300",
                step.status === "waiting" && "border-muted bg-muted/10 opacity-50",
                step.status === "running" && "border-primary bg-primary/5 shadow-sm",
                step.status === "done" && "border-green-500 bg-green-50",
                step.status === "error" && "border-red-500 bg-red-50"
              )}
            >
              <div className="flex items-start gap-3">
                <div className={cn(
                  "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                  step.status === "waiting" && "bg-muted",
                  step.status === "running" && "bg-primary/10",
                  step.status === "done" && "bg-green-100",
                  step.status === "error" && "bg-red-100"
                )}>
                  {step.status === "running" ? (
                    <i className="fa-solid fa-spinner fa-spin h-4 w-4 text-primary" />
                  ) : step.status === "done" ? (
                    <i className="fa-solid fa-circle-check h-4 w-4 text-green-600" />
                  ) : step.status === "error" ? (
                    <i className="fa-solid fa-circle-xmark h-4 w-4 text-red-600" />
                  ) : (
                    <i className={cn(iconClass, "h-4 w-4 text-muted-foreground")} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={cn(
                      "font-medium",
                      step.status === "waiting" && "text-muted-foreground",
                      step.status === "error" && "text-red-700"
                    )}>
                      {step.status === "waiting" ? label : step.message}
                    </p>
                    {step.progress && step.status === "running" && (
                      <span className="text-xs text-muted-foreground">
                        {step.progress.current}/{step.progress.total}
                      </span>
                    )}
                  </div>

                  {step.progress && step.status === "running" && step.progress.total > 0 && (
                    <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(step.progress.current / step.progress.total) * 100}%` }}
                      />
                    </div>
                  )}

                  {step.details && step.details.length > 0 && step.status === "done" && (
                    <ul className="mt-2 space-y-1">
                      {step.details.slice(0, 3).map((detail, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-center gap-1">
                          <i className="fa-solid fa-chevron-right h-3 w-3 shrink-0" />
                          <span className="truncate">{detail}</span>
                        </li>
                      ))}
                      {step.details.length > 3 && (
                        <li className="text-xs text-muted-foreground pl-4">
                          +{step.details.length - 3} more
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Completion Summary */}
      {isComplete && (sentResults.length > 0 || prospects.length > 0) && (
        <div className={cn(
          "rounded-xl border-2 p-4 space-y-4",
          successCount > 0 ? "border-green-500 bg-green-50" : "border-yellow-500 bg-yellow-50"
        )}>
          <div className="flex items-center gap-3">
            {successCount > 0 ? (
              <i className="fa-solid fa-circle-check h-6 w-6 text-green-600" />
            ) : (
              <i className="fa-solid fa-circle-exclamation h-6 w-6 text-yellow-600" />
            )}
            <div>
              <p className={cn(
                "font-semibold",
                successCount > 0 ? "text-green-800" : "text-yellow-800"
              )}>
                {successCount > 0 ? "All Done!" : "Drafts Ready"}
              </p>
              <p className={cn(
                "text-sm",
                successCount > 0 ? "text-green-700" : "text-yellow-700"
              )}>
                {successCount > 0
                  ? `Sent ${successCount} test emails to ${testEmail}`
                  : "Connect Gmail in Settings to send emails automatically"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {sentResults.map((result: any, i: number) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 p-2 rounded-lg",
                  result.success ? "bg-green-100" : result.skipped ? "bg-yellow-100" : "bg-red-100"
                )}
              >
                {result.success ? (
                  <i className="fa-solid fa-circle-check h-4 w-4 text-green-600 shrink-0" />
                ) : result.skipped ? (
                  <i className="fa-solid fa-circle-exclamation h-4 w-4 text-yellow-600 shrink-0" />
                ) : (
                  <i className="fa-solid fa-circle-xmark h-4 w-4 text-red-600 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{result.prospect?.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {result.prospect?.title} @ {result.prospect?.company}
                  </p>
                </div>
                {result.success ? (
                  <span className="text-xs text-green-700 font-medium shrink-0">Sent</span>
                ) : result.skipped ? (
                  <span className="text-xs text-yellow-700 font-medium shrink-0">Draft saved</span>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {isComplete ? (
          <>
            <Button
              variant="outline"
              onClick={() => navigate("/conversations")}
              className="flex-1 rounded-xl font-semibold gap-2"
            >
              <i className="fa-solid fa-arrow-up-right-from-square h-4 w-4" />
              View Conversations
            </Button>
            <Button
              onClick={reset}
              className="flex-1 rounded-xl font-semibold gap-2"
            >
              <i className="fa-solid fa-rotate-left h-4 w-4" />
              Run Again
            </Button>
          </>
        ) : error ? (
          <>
            <Button
              variant="outline"
              onClick={reset}
              className="flex-1 rounded-xl font-semibold gap-2"
            >
              <i className="fa-solid fa-rotate-left h-4 w-4" />
              Reset
            </Button>
            <Button
              onClick={startRun}
              disabled={isStarting}
              className="flex-1 rounded-xl font-semibold gap-2"
            >
              {isStarting ? <i className="fa-solid fa-spinner fa-spin h-4 w-4" /> : null}
              Try Again
            </Button>
          </>
        ) : isRunning ? (
          <div className="flex gap-3 w-full">
            <Button
              variant="destructive"
              onClick={stopRun}
              disabled={isStopping}
              className="flex-1 rounded-xl font-semibold gap-2 h-12 text-base"
            >
              {isStopping ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin h-5 w-5" />
                  Stopping...
                </>
              ) : (
                <>
                  <i className="fa-solid fa-circle-stop h-5 w-5" />
                  Stop
                </>
              )}
            </Button>
            <Button
              disabled
              className="flex-1 rounded-xl font-semibold gap-2 h-12 text-base"
            >
              <i className="fa-solid fa-spinner fa-spin h-5 w-5" />
              Running...
            </Button>
          </div>
        ) : (
          <Button
            onClick={startRun}
            disabled={isStarting || !testEmail.includes("@")}
            className="w-full rounded-xl font-semibold gap-2 h-12 text-base"
          >
            {isStarting ? (
              <>
                <i className="fa-solid fa-spinner fa-spin h-5 w-5" />
                Starting...
              </>
            ) : (
              <>
                <i className="fa-solid fa-wand-magic-sparkles h-5 w-5" />
                Run Capy
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
