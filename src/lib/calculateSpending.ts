import { supabase } from "@/integrations/supabase/client";

/**
 * New efficient credit calculation from api_cost_tracking table
 * This is much faster than recalculating from activity_logs
 */
export async function getCreditsFromTracking(userId: string): Promise<{
  credits: number;
  totalSpent: number;
  purchased: number;
  adjustment: number;
}> {
  try {
    // Get user settings for purchased credits and adjustment
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("purchased_credits, admin_credit_adjustment")
      .eq("user_id", userId)
      .single();

    if (settingsError && settingsError.code !== "PGRST116") {
      console.error("Error fetching user settings:", settingsError);
    }

    const purchased = settings?.purchased_credits || 0;
    const adjustment = settings?.admin_credit_adjustment || 0;

    // Get total credits spent from api_cost_tracking
    const { data: costData, error: costError } = await supabase
      .from("api_cost_tracking")
      .select("credits_used")
      .eq("user_id", userId);

    if (costError) {
      console.error("Error fetching cost tracking:", costError);
      // Fallback to old method if api_cost_tracking fails
      const oldSpent = await calculateTotalSpendingFromLogs(userId);
      const totalSpent = Math.ceil(oldSpent * 100); // Convert $ to credits
      return {
        credits: 500 + purchased + adjustment - totalSpent,
        totalSpent,
        purchased,
        adjustment,
      };
    }

    const totalSpent = costData?.reduce((sum, row) => sum + (row.credits_used || 0), 0) || 0;

    // Base credits (500) + purchased + adjustment - spent
    const credits = 500 + purchased + adjustment - totalSpent;

    return { credits, totalSpent, purchased, adjustment };
  } catch (error) {
    console.error("Error in getCreditsFromTracking:", error);
    return { credits: 500, totalSpent: 0, purchased: 0, adjustment: 0 };
  }
}

/**
 * Simple function to get credits remaining (convenience wrapper)
 */
export async function getCreditsRemaining(userId: string): Promise<number> {
  const { credits } = await getCreditsFromTracking(userId);
  return credits;
}

interface ActivityLog {
  id: string;
  type: string;
  title: string;
  description: string | null;
  metadata: any;
  created_at: string;
}

interface RunGroup {
  jobId: string;
  startLog: ActivityLog | null;
  completionLog: ActivityLog | null;
  failureLog: ActivityLog | null;
  stepLogs: ActivityLog[];
}

// API Pricing (same as Admin panel)
const API_PRICING = {
  apollo: {
    credit_cost: 0.0016, // $0.0016 per credit (based on annual billing plans)
    person_search: 1, // ~1 credit per person found in search
    email_lookup: 1, // ~1 credit per email lookup (if separate from search)
    phone_lookup: 3, // ~3 credits per phone lookup (mobile costs more)
  },
  clado: {
    search: 0.01, // $0.01 per AI-filtered search result (1 credit)
    enrichment: 0.04, // $0.04 per email enrichment (4 credits)
    phone_enrichment: 0.10, // $0.10 per phone enrichment (10 credits)
    profile_scrape: 0.02, // $0.02 per full profile scrape (2 credits)
  },
  hunter: {
    email_finder: 0.0199, // $0.0199 per search (Business tier - cheapest)
  },
  ai_generation: {
    email: 0.02, // Estimated: $0.02 per email generated (Gemini 2.5 Flash)
  },
  composio: {
    email_send: 0.000249, // $0.249 per 1k calls = $0.000249 per call (Serious Business tier)
  },
  perplexity: {
    email_search: 0.005, // $0.005 per request = 0.5 credits
  },
};

// Group logs by run (same logic as Admin panel)
function groupLogsByRun(logs: ActivityLog[]): RunGroup[] {
  const runs = new Map<string, RunGroup>();

  logs.forEach((log) => {
    const jobId = log.metadata?.job_id || "unknown";
    if (!runs.has(jobId)) {
      runs.set(jobId, {
        jobId,
        startLog: null,
        completionLog: null,
        failureLog: null,
        stepLogs: [],
      });
    }

    const run = runs.get(jobId)!;

    if (log.type === "auto_run_started") {
      run.startLog = log;
    } else if (log.type === "auto_run_completed") {
      run.completionLog = log;
    } else if (log.type === "auto_run_failed") {
      run.failureLog = log;
    } else if (log.type === "auto_run_step") {
      run.stepLogs.push(log);
    }
  });

  return Array.from(runs.values());
}

// Calculate run cost (same logic as Admin panel)
function calculateRunCost(run: RunGroup): number {
  // First, check if cost is already stored in the completion log
  if (run.completionLog?.metadata?.cost_dollars !== undefined) {
    return parseFloat(run.completionLog.metadata.cost_dollars) || 0;
  }

  const breakdown: Record<string, number> = {};
  let total = 0;

  // Calculate costs from step logs (fallback for older logs)
  run.stepLogs.forEach((stepLog) => {
    const metadata = stepLog.metadata || {};
    const step = metadata.step;

    // Step 2: Search Prospects
    if (step === "search") {
      const apisUsed = metadata.apis_used || [];
      const apolloProspects = metadata.apollo_prospects_found || 0;
      const cladoProspects = metadata.clado_prospects_found || 0;

      if (apisUsed.includes("apollo")) {
        const apolloCredits = apolloProspects * API_PRICING.apollo.person_search;
        const apolloCost = apolloCredits * API_PRICING.apollo.credit_cost;
        breakdown.apollo = (breakdown.apollo || 0) + apolloCost;
        total += apolloCost;
      }

      if (apisUsed.includes("clado")) {
        const cladoSearchCost = cladoProspects * API_PRICING.clado.search;
        breakdown.clado = (breakdown.clado || 0) + cladoSearchCost;
        total += cladoSearchCost;
      }
    }

    // Step 3: Email Enrichment
    if (step === "enrich") {
      const apisUsed = metadata.apis_used || [];
      const cladoEmails = metadata.clado_emails || 0;
      const enrichmentAttempts = metadata.enrichment_attempts || 0;
      const perplexityRequests = metadata.perplexity_requests || 0;

      if (apisUsed.includes("clado") && cladoEmails > 0) {
        const cladoEnrichCost = cladoEmails * API_PRICING.clado.enrichment;
        breakdown.clado = (breakdown.clado || 0) + cladoEnrichCost;
        total += cladoEnrichCost;
      }

      if (apisUsed.includes("hunter")) {
        const hunterSearches = enrichmentAttempts;
        const hunterCost = hunterSearches * API_PRICING.hunter.email_finder;
        breakdown.hunter = (breakdown.hunter || 0) + hunterCost;
        total += hunterCost;
      }

      if (apisUsed.includes("perplexity") && perplexityRequests > 0) {
        const perplexityCost = perplexityRequests * API_PRICING.perplexity.email_search;
        breakdown.perplexity = (breakdown.perplexity || 0) + perplexityCost;
        total += perplexityCost;
      }
    }

    // Step 4: Email Generation
    if (step === "draft") {
      const draftsGenerated = metadata.total_drafts_generated || 0;
      if (draftsGenerated > 0) {
        const aiCost = draftsGenerated * API_PRICING.ai_generation.email;
        breakdown.ai_generation = (breakdown.ai_generation || 0) + aiCost;
        total += aiCost;
      }
    }

    // Step 5: Send Emails
    if (step === "send") {
      const successfulSends = metadata.successful_sends || 0;
      if (successfulSends > 0) {
        const composioCost = successfulSends * API_PRICING.composio.email_send;
        breakdown.composio = (breakdown.composio || 0) + composioCost;
        total += composioCost;
      }
    }
  });

  return Math.round(total * 100) / 100; // Round to 2 decimal places
}

// Calculate total spending from logs (same as Admin panel)
export async function calculateTotalSpendingFromLogs(userId: string): Promise<number> {
  try {
    // Fetch all activity logs for the user (same query as Admin panel)
    const { data: logs, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("user_id", userId)
      .in("type", ["auto_run_started", "auto_run_step", "auto_run_completed", "auto_run_failed"])
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching logs for spending calculation:", error);
      return 0;
    }

    if (!logs || logs.length === 0) {
      return 0;
    }

    // Group logs by run and calculate total cost (same logic as Admin panel)
    const runs = groupLogsByRun(logs);
    const totalCost = runs.reduce((sum, run) => sum + calculateRunCost(run), 0);

    return totalCost;
  } catch (error) {
    console.error("Error calculating total spending:", error);
    return 0;
  }
}

