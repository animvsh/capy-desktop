import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/Badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type Prospect = {
  apollo_id?: string;
  clado_id?: string;
  name: string;
  email: string | null;
  company: string | null;
  title: string | null;
  domain: string | null;
  linkedin_url: string | null;
  email_confidence?: number;
  selected?: boolean;
  source?: string;
};

type ServiceStatus = {
  apollo: { connected: boolean };
  hunter: { connected: boolean; searches_used?: number; searches_available?: number };
  rocketreach: { connected: boolean; lookups_remaining?: number };
  clado: { connected: boolean; credits?: number };
  composio: { connected: boolean; email_connected?: boolean };
};

type Recommendations = {
  titles: string[];
  companySizes: string[];
  industries: string[];
  targetDescription: string;
  idealCustomer: string;
  whoToAvoid: string;
  productDescription: string;
} | null;

type DiscoverLeadsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLeadsImported: () => void;
};

const COMPANY_SIZES = [
  { value: "1,10", label: "1-10" },
  { value: "11,50", label: "11-50" },
  { value: "51,200", label: "51-200" },
  { value: "201,500", label: "201-500" },
  { value: "501,1000", label: "501-1K" },
  { value: "1001,5000", label: "1K-5K" },
  { value: "5001,10000", label: "5K-10K" },
];

export function DiscoverLeadsModal({ open, onOpenChange, onLeadsImported }: DiscoverLeadsModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<"status" | "search" | "results" | "enriching" | "importing" | "auto-running">("status");
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendations>(null);
  const [hasProfile, setHasProfile] = useState(false);
  const [searchSources, setSearchSources] = useState<string[]>([]);
  const [autoRunJobId, setAutoRunJobId] = useState<string | null>(null);
  const [autoRunStatus, setAutoRunStatus] = useState<"pending" | "running" | "completed" | "error">("pending");
  const [autoRunSteps, setAutoRunSteps] = useState<Record<string, any>>({});

  // Search filters
  const [titles, setTitles] = useState("");
  const [locations, setLocations] = useState("");
  const [companySizes, setCompanySizes] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);

  // Check service status and get recommendations when modal opens
  useEffect(() => {
    if (open) {
      checkServiceStatusAndRecommendations();
    }
  }, [open]);

  const checkServiceStatusAndRecommendations = async () => {
    setCheckingStatus(true);
    try {
      // Run status check and recommendations in parallel
      const [discoverResponse, composioResponse, recommendationsResponse] = await Promise.all([
        supabase.functions.invoke("discover-leads", {
          body: { action: "check_status" },
        }),
        supabase.functions.invoke("composio-connect", {
          body: { action: "status", type: "gmail" },
        }),
        supabase.functions.invoke("discover-leads", {
          body: { action: "get_recommendations" },
        }),
      ]);

      console.log("[DiscoverLeadsModal] Status:", discoverResponse.data?.status);
      console.log("[DiscoverLeadsModal] Recommendations:", recommendationsResponse.data);

      const status: ServiceStatus = {
        apollo: discoverResponse.data?.status?.apollo || { connected: false },
        hunter: discoverResponse.data?.status?.hunter || { connected: false },
        rocketreach: discoverResponse.data?.status?.rocketreach || { connected: false },
        clado: discoverResponse.data?.status?.clado || { connected: false },
        composio: {
          connected: composioResponse.data?.connected || false,
          email_connected: composioResponse.data?.connected || false,
        },
      };

      setServiceStatus(status);

      // Handle recommendations
      if (recommendationsResponse.data?.success && recommendationsResponse.data?.hasProfile) {
        const recs = recommendationsResponse.data.recommendations;
        setRecommendations(recs);
        setHasProfile(true);

        // Pre-fill form with recommendations
        if (recs.titles && recs.titles.length > 0) {
          setTitles(recs.titles.join(", "));
        }
        if (recs.companySizes && recs.companySizes.length > 0) {
          setCompanySizes(recs.companySizes);
        }
      } else {
        setHasProfile(false);
      }

      // If any search provider is connected, proceed to search
      if (status.apollo.connected || status.clado.connected) {
        setStep("search");
      } else {
        setStep("status");
      }
    } catch (error) {
      console.error("Error checking service status:", error);
      setServiceStatus({
        apollo: { connected: false },
        hunter: { connected: false },
        rocketreach: { connected: false },
        clado: { connected: false },
        composio: { connected: false },
      });
      setStep("status");
    } finally {
      setCheckingStatus(false);
    }
  };

  const applyRecommendations = () => {
    if (recommendations) {
      setTitles(recommendations.titles.join(", "));
      setCompanySizes(recommendations.companySizes);
      toast({
        title: "Recommendations applied",
        description: "Search criteria updated based on your product profile",
      });
    }
  };

  const handleSearch = async () => {
    setLoading(true);

    try {
      // Use unified search to search all providers
      const response = await supabase.functions.invoke("discover-leads", {
        body: {
          action: "unified_search",
          titles: titles.split(",").map(t => t.trim()).filter(Boolean),
          locations: locations.split(",").map(l => l.trim()).filter(Boolean),
          companySize: companySizes,
          industries: recommendations?.industries || [],
          limit,
        },
      });

      if (response.data?.success) {
        const prospectResults = (response.data.prospects || []).map((p: Prospect) => ({
          ...p,
          selected: true,
        }));
        setProspects(prospectResults);
        setSearchSources(response.data.sources || []);
        setStep("results");

        const sourceNames = (response.data.sources || []).map((s: string) =>
          s === "apollo" ? "Apollo" : s === "clado" ? "Clado" : s
        ).join(" + ");

        toast({
          title: `Found ${prospectResults.length} prospects`,
          description: `via ${sourceNames} - Review and select which ones to import`,
        });
      } else {
        throw new Error(response.data?.error || "Search failed");
      }
    } catch (error) {
      toast({
        title: "Search failed",
        description: error instanceof Error ? error.message : "Please check your API keys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEnrichAndImport = async () => {
    const selectedProspects = prospects.filter(p => p.selected);
    if (selectedProspects.length === 0) {
      toast({
        title: "No prospects selected",
        description: "Please select at least one prospect to import",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setStep("enriching");

    try {
      // Step 1: Enrich prospects with Hunter/RocketReach/Clado emails (if connected)
      let enrichedProspects = selectedProspects;

      if (serviceStatus?.hunter.connected || serviceStatus?.rocketreach.connected || serviceStatus?.clado.connected) {
        const enrichResponse = await supabase.functions.invoke("discover-leads", {
          body: {
            action: "batch_enrich",
            prospects: selectedProspects,
          },
        });

        if (enrichResponse.data?.success) {
          enrichedProspects = enrichResponse.data.prospects;
        }
      }

      // Step 2: Import leads to database
      setStep("importing");

      const importResponse = await supabase.functions.invoke("discover-leads", {
        body: {
          action: "import_leads",
          prospects: enrichedProspects.filter((p: Prospect) => p.email),
        },
      });

      if (importResponse.data?.success) {
        const importedCount = importResponse.data.imported;
        const withoutEmail = enrichedProspects.filter((p: Prospect) => !p.email).length;

        toast({
          title: `Imported ${importedCount} leads`,
          description: withoutEmail > 0
            ? `${withoutEmail} prospects skipped (no email found)`
            : importedCount > 0
              ? "Leads added to your pipeline"
              : "All prospects already in your leads",
        });
        onLeadsImported();
        resetAndClose();
      } else {
        throw new Error(importResponse.data?.error || "Import failed");
      }
    } catch (error) {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
      setStep("results");
    } finally {
      setLoading(false);
    }
  };

  const toggleProspect = (id: string) => {
    setProspects(prev =>
      prev.map(p => {
        const prospectId = p.apollo_id || p.clado_id || p.name;
        return prospectId === id ? { ...p, selected: !p.selected } : p;
      })
    );
  };

  const toggleAll = (selected: boolean) => {
    setProspects(prev => prev.map(p => ({ ...p, selected })));
  };

  const toggleCompanySize = (size: string) => {
    setCompanySizes(prev =>
      prev.includes(size) ? prev.filter(s => s !== size) : [...prev, size]
    );
  };

  const handleAutoRun = async () => {
    if (!user?.id) {
      toast({
        title: "Not authenticated",
        description: "Please sign in to use auto-run",
        variant: "destructive",
      });
      return;
    }

    if (!hasProfile) {
      toast({
        title: "Product profile required",
        description: "Please set up your product profile in Settings first",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setStep("auto-running");

    try {
      // Create job row in database
      const { data: job, error: insertError } = await supabase
        .from("auto_run_jobs")
        .insert({
          user_id: user.id,
          test_email: "", // Not used for smart discovery
          status: "running",
          steps: {
            loadIcp: { status: "waiting", message: "Load ICP profile" },
            search: { status: "waiting", message: "Search for prospects" },
            enrich: { status: "waiting", message: "Find verified emails" },
            draft: { status: "waiting", message: "Generate personalized emails" },
            send: { status: "waiting", message: "Send emails" },
            log: { status: "waiting", message: "Log conversations" },
          },
          prospects: [],
          sent_results: [],
        })
        .select()
        .single();

      if (insertError || !job) {
        throw new Error(insertError?.message || "Failed to create job");
      }

      setAutoRunJobId(job.id);
      setAutoRunStatus("running");
      setAutoRunSteps(job.steps || {});

      // Subscribe to job updates
      const channel = supabase
        .channel(`job-${job.id}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "auto_run_jobs",
            filter: `id=eq.${job.id}`,
          },
          (payload) => {
            const updatedJob = payload.new as any;
            setAutoRunStatus(updatedJob.status);
            setAutoRunSteps(updatedJob.steps || {});
            
            if (updatedJob.status === "completed") {
              const successCount = (updatedJob.sent_results || []).filter((r: any) => r.success).length;
              toast({
                title: "All done!",
                description: `Sent ${successCount} emails and created conversations`,
              });
              onLeadsImported();
              setTimeout(() => {
                onOpenChange(false);
              }, 2000);
            } else if (updatedJob.status === "error") {
              toast({
                title: "Error",
                description: updatedJob.error || "Pipeline failed",
                variant: "destructive",
              });
            }
          }
        )
        .subscribe();

      // Invoke edge function (fire and forget)
      supabase.functions.invoke("smart-lead-discovery", {
        body: { jobId: job.id },
      }).then((response) => {
        console.log("[DiscoverLeadsModal] Auto-run response:", response);
      }).catch((err) => {
        console.error("[DiscoverLeadsModal] Auto-run error:", err);
        toast({
          title: "Error",
          description: "Failed to start auto-run pipeline",
          variant: "destructive",
        });
        setStep("search");
      });

      // Cleanup subscription on unmount
      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.error("[DiscoverLeadsModal] Auto-run error:", err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to start auto-run",
        variant: "destructive",
      });
      setStep("search");
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setStep("status");
    setProspects([]);
    setTitles("");
    setLocations("");
    setCompanySizes([]);
    setLimit(20);
    setRecommendations(null);
    setSearchSources([]);
    setAutoRunJobId(null);
    setAutoRunStatus("pending");
    setAutoRunSteps({});
    onOpenChange(false);
  };

  const selectedCount = prospects.filter(p => p.selected).length;
  const withEmailCount = prospects.filter(p => p.selected && p.email).length;
  const needsEnrichment = selectedCount - withEmailCount;

  const hasAnySearchProvider = serviceStatus?.apollo.connected || serviceStatus?.clado.connected;
  const connectedProviders = [
    serviceStatus?.apollo.connected && "Apollo",
    serviceStatus?.clado.connected && "Clado",
  ].filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="rounded-2xl max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-extrabold flex items-center gap-2">
            <i className="fa-solid fa-bullseye h-5 w-5 text-primary" />
            Discover Leads
          </DialogTitle>
        </DialogHeader>

        {/* Status Check / Loading */}
        {checkingStatus && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <i className="fa-solid fa-spinner fa-spin h-8 w-8 text-primary" />
            <p className="text-muted-foreground font-medium">Checking services & loading recommendations...</p>
          </div>
        )}

        {/* Service Status Display */}
        {!checkingStatus && step === "status" && serviceStatus && (
          <div className="space-y-4">
            <p className="text-muted-foreground text-sm">
              Connect your lead discovery services to find prospects.
            </p>

            <div className="space-y-3">
              {/* Apollo Status */}
              <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                serviceStatus.apollo.connected ? "border-forest bg-forest/5" : "border-muted"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    serviceStatus.apollo.connected ? "bg-forest text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <i className="fa-solid fa-globe h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold">Apollo.io</p>
                    <p className="text-sm text-muted-foreground">Lead discovery & search</p>
                  </div>
                </div>
                {serviceStatus.apollo.connected ? (
                  <Badge className="bg-forest text-white rounded-full gap-1">
                    <i className="fa-solid fa-circle-check h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full gap-1 text-muted-foreground">
                    Not Connected
                  </Badge>
                )}
              </div>

              {/* Clado Status */}
              <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                serviceStatus.clado.connected ? "border-forest bg-forest/5" : "border-muted"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    serviceStatus.clado.connected ? "bg-forest text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <i className="fa-solid fa-database h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold">Clado</p>
                    <p className="text-sm text-muted-foreground">
                      AI-powered prospect search
                      {serviceStatus.clado.connected && serviceStatus.clado.credits !== undefined && (
                        <span className="ml-2 text-xs">
                          ({serviceStatus.clado.credits} credits remaining)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {serviceStatus.clado.connected ? (
                  <Badge className="bg-forest text-white rounded-full gap-1">
                    <i className="fa-solid fa-circle-check h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full gap-1 text-muted-foreground">
                    Not Connected
                  </Badge>
                )}
              </div>

              {/* Hunter Status */}
              <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                serviceStatus.hunter.connected ? "border-forest bg-forest/5" : "border-muted"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    serviceStatus.hunter.connected ? "bg-forest text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <i className="fa-solid fa-envelope h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold">Hunter.io</p>
                    <p className="text-sm text-muted-foreground">
                      Email finding & verification
                      {serviceStatus.hunter.connected && serviceStatus.hunter.searches_available !== undefined && (
                        <span className="ml-2 text-xs">
                          ({serviceStatus.hunter.searches_used}/{serviceStatus.hunter.searches_available} searches used)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {serviceStatus.hunter.connected ? (
                  <Badge className="bg-forest text-white rounded-full gap-1">
                    <i className="fa-solid fa-circle-check h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full gap-1 text-muted-foreground">
                    Optional
                  </Badge>
                )}
              </div>

              {/* RocketReach Status */}
              <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${
                serviceStatus.rocketreach.connected ? "border-forest bg-forest/5" : "border-muted"
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                    serviceStatus.rocketreach.connected ? "bg-forest text-white" : "bg-muted text-muted-foreground"
                  }`}>
                    <i className="fa-solid fa-rocket h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold">RocketReach</p>
                    <p className="text-sm text-muted-foreground">
                      Email finding (fallback)
                      {serviceStatus.rocketreach.connected && serviceStatus.rocketreach.lookups_remaining !== undefined && (
                        <span className="ml-2 text-xs">
                          ({serviceStatus.rocketreach.lookups_remaining} lookups remaining)
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                {serviceStatus.rocketreach.connected ? (
                  <Badge className="bg-forest text-white rounded-full gap-1">
                    <i className="fa-solid fa-circle-check h-3 w-3" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="rounded-full gap-1 text-muted-foreground">
                    Optional
                  </Badge>
                )}
              </div>
            </div>

            {!hasAnySearchProvider && (
              <Alert variant="destructive" className="rounded-xl">
                <i className="fa-solid fa-circle-exclamation h-4 w-4" />
                <AlertDescription>
                  Either Apollo or Clado API key is required for lead discovery. Please add one in project settings.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={resetAndClose}
                className="rounded-full font-bold"
              >
                Cancel
              </Button>
              <Button
                onClick={() => setStep("search")}
                disabled={!hasAnySearchProvider}
                className="flex-1 rounded-full font-bold gap-2"
              >
                <i className="fa-solid fa-magnifying-glass h-4 w-4" />
                Continue to Search
              </Button>
            </div>
          </div>
        )}

        {/* Search Form */}
        {!checkingStatus && step === "search" && !loading && (
          <div className="space-y-4">
            {/* Recommendations Banner */}
            {hasProfile && recommendations && (
              <Alert className="rounded-xl border-primary/30 bg-primary/5">
                <i className="fa-solid fa-wand-magic-sparkles h-4 w-4 text-primary" />
                <AlertDescription className="text-primary flex items-center justify-between">
                  <span>
                    <strong>Smart recommendations</strong> based on your product profile
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={applyRecommendations}
                    className="rounded-full text-xs gap-1"
                  >
                    <i className="fa-solid fa-lightbulb h-3 w-3" /> Apply
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Connected Services indicator */}
            <div className="flex gap-2 flex-wrap">
              <span className="text-sm text-muted-foreground">Searching:</span>
              {serviceStatus?.apollo.connected && (
                <Badge variant="secondary" className="rounded-full gap-1">
                  <i className="fa-solid fa-globe h-3 w-3" /> Apollo
                </Badge>
              )}
              {serviceStatus?.clado.connected && (
                <Badge variant="secondary" className="rounded-full gap-1">
                  <i className="fa-solid fa-database h-3 w-3" /> Clado
                </Badge>
              )}
              <span className="text-sm text-muted-foreground ml-2">Enriching:</span>
              {serviceStatus?.hunter.connected && (
                <Badge variant="secondary" className="rounded-full gap-1">
                  <i className="fa-solid fa-envelope h-3 w-3" /> Hunter
                </Badge>
              )}
              {serviceStatus?.rocketreach.connected && (
                <Badge variant="secondary" className="rounded-full gap-1">
                  <i className="fa-solid fa-rocket h-3 w-3" /> RocketReach
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Job Titles *</Label>
              <Input
                value={titles}
                onChange={(e) => setTitles(e.target.value)}
                placeholder="CEO, Founder, VP Marketing (comma separated)"
                className="rounded-xl"
              />
              {recommendations?.titles && recommendations.titles.length > 0 && !titles && (
                <p className="text-xs text-muted-foreground">
                  Suggested: {recommendations.titles.slice(0, 4).join(", ")}...
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Locations</Label>
              <Input
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
                placeholder="United States, California, New York (comma separated)"
                className="rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label className="font-semibold">Company Size</Label>
              <div className="flex flex-wrap gap-2">
                {COMPANY_SIZES.map((size) => (
                  <Badge
                    key={size.value}
                    variant={companySizes.includes(size.value) ? "default" : "outline"}
                    className="cursor-pointer rounded-full px-3 py-1"
                    onClick={() => toggleCompanySize(size.value)}
                  >
                    {size.label}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label className="font-semibold">Max Results</Label>
                <Input
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(Math.min(100, Math.max(1, parseInt(e.target.value) || 20)))}
                  min={1}
                  max={100}
                  className="rounded-xl w-24"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep("status")}
                className="rounded-full font-bold"
              >
                Back
              </Button>
              {hasProfile && (
                <Button
                  onClick={handleAutoRun}
                  className="flex-1 rounded-full font-bold gap-2 bg-primary"
                  disabled={loading}
                >
                  <i className="fa-solid fa-play h-4 w-4" />
                  Auto Run (Full Pipeline)
                </Button>
              )}
              <Button
                onClick={handleSearch}
                className="flex-1 rounded-full font-bold gap-2"
                disabled={!titles.trim() || loading}
                variant={hasProfile ? "outline" : "default"}
              >
                <i className="fa-solid fa-magnifying-glass h-4 w-4" />
                Manual Search
              </Button>
            </div>
          </div>
        )}

        {/* Auto-Running Pipeline */}
        {step === "auto-running" && (
          <div className="space-y-4">
            <Alert className="rounded-xl border-primary/30 bg-primary/5">
              <i className="fa-solid fa-wand-magic-sparkles h-4 w-4 text-primary" />
              <AlertDescription className="text-primary">
                <strong>Running full pipeline automatically</strong> - Using your product profile to find leads, enrich emails, generate personalized messages, and send them.
              </AlertDescription>
            </Alert>

            <div className="space-y-3">
              {Object.entries(autoRunSteps).map(([key, stepData]: [string, any]) => (
                <div
                  key={key}
                  className={`p-4 rounded-xl border-2 ${
                    stepData.status === "waiting" ? "border-muted bg-muted/10 opacity-50" :
                    stepData.status === "running" ? "border-primary bg-primary/5 shadow-sm" :
                    stepData.status === "done" ? "border-green-500 bg-green-50" :
                    "border-red-500 bg-red-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {stepData.status === "running" ? (
                      <i className="fa-solid fa-spinner fa-spin h-5 w-5 text-primary" />
                    ) : stepData.status === "done" ? (
                      <i className="fa-solid fa-circle-check h-5 w-5 text-green-600" />
                    ) : stepData.status === "error" ? (
                      <i className="fa-solid fa-circle-xmark h-5 w-5 text-red-600" />
                    ) : (
                      <div className="h-5 w-5 rounded-full border-2 border-muted" />
                    )}
                    <div className="flex-1">
                      <p className={`font-medium ${
                        stepData.status === "error" ? "text-red-700" : ""
                      }`}>
                        {stepData.status === "waiting" ? key : stepData.message}
                      </p>
                      {stepData.progress && stepData.status === "running" && (
                        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${(stepData.progress.current / stepData.progress.total) * 100}%` }}
                          />
                        </div>
                      )}
                      {stepData.details && stepData.details.length > 0 && stepData.status === "done" && (
                        <ul className="mt-2 space-y-1">
                          {stepData.details.slice(0, 2).map((detail: string, i: number) => (
                            <li key={i} className="text-sm text-muted-foreground">
                              {detail}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {autoRunStatus === "completed" && (
              <Alert className="rounded-xl border-green-500 bg-green-50">
                <i className="fa-solid fa-circle-check h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Pipeline completed! Leads have been imported and emails sent.
                </AlertDescription>
              </Alert>
            )}

            {autoRunStatus === "error" && (
              <Alert variant="destructive" className="rounded-xl">
                <i className="fa-solid fa-circle-exclamation h-4 w-4" />
                <AlertDescription>
                  Pipeline encountered an error. Please try again.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Loading States */}
        {loading && step !== "auto-running" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <i className="fa-solid fa-spinner fa-spin h-8 w-8 text-primary" />
            <p className="text-muted-foreground font-medium">
              {step === "search" && "Searching all connected sources..."}
              {step === "enriching" && "Finding emails with Hunter, RocketReach & Clado..."}
              {step === "importing" && "Importing leads to your pipeline..."}
            </p>
            <div className="flex gap-2 mt-2">
              {step === "search" && (
                <>
                  {serviceStatus?.apollo.connected && <Badge variant="secondary" className="rounded-full">Apollo</Badge>}
                  {serviceStatus?.clado.connected && <Badge variant="secondary" className="rounded-full">Clado</Badge>}
                </>
              )}
              {step === "enriching" && (
                <>
                  {serviceStatus?.hunter.connected && <Badge variant="secondary" className="rounded-full">Hunter.io</Badge>}
                  {serviceStatus?.rocketreach.connected && <Badge variant="secondary" className="rounded-full">RocketReach</Badge>}
                  {serviceStatus?.clado.connected && <Badge variant="secondary" className="rounded-full">Clado</Badge>}
                </>
              )}
              {step === "importing" && <Badge variant="secondary" className="rounded-full">Database</Badge>}
            </div>
          </div>
        )}

        {/* Results */}
        {step === "results" && !loading && (
          <>
            <div className="flex items-center justify-between py-2 border-b">
              <div className="flex items-center gap-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleAll(true)}
                  className="text-xs"
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleAll(false)}
                  className="text-xs"
                >
                  Deselect All
                </Button>
                {searchSources.length > 0 && (
                  <div className="flex gap-1">
                    {searchSources.map(source => (
                      <Badge key={source} variant="outline" className="rounded-full text-xs">
                        {source === "apollo" ? "Apollo" : source === "clado" ? "Clado" : source}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm text-muted-foreground">
                  {selectedCount} selected
                </p>
                {withEmailCount > 0 && (
                  <Badge variant="secondary" className="rounded-full text-xs gap-1">
                    <i className="fa-solid fa-envelope h-3 w-3" />
                    {withEmailCount} with email
                  </Badge>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0 max-h-[350px]">
              <div className="space-y-2 pr-4">
                {prospects.map((prospect) => {
                  const prospectId = prospect.apollo_id || prospect.clado_id || prospect.name;
                  return (
                    <div
                      key={prospectId}
                      onClick={() => toggleProspect(prospectId)}
                      className={`
                        p-3 rounded-xl border-2 cursor-pointer transition-all
                        ${prospect.selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`
                          h-5 w-5 rounded-md border-2 flex items-center justify-center mt-0.5
                          ${prospect.selected ? "bg-primary border-primary" : "border-muted-foreground/30"}
                        `}>
                          {prospect.selected && <i className="fa-solid fa-check h-3 w-3 text-primary-foreground" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold truncate">{prospect.name}</span>
                            {prospect.email ? (
                              <Badge variant="secondary" className="rounded-full text-xs gap-1 bg-forest/10 text-forest">
                                <i className="fa-solid fa-envelope h-3 w-3" />
                                {prospect.email_confidence ? `${prospect.email_confidence}%` : "Email found"}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="rounded-full text-xs text-muted-foreground">
                                {(serviceStatus?.hunter.connected || serviceStatus?.rocketreach.connected || serviceStatus?.clado.connected) ? "Will find email" : "No email"}
                              </Badge>
                            )}
                            {prospect.source && (
                              <Badge variant="outline" className="rounded-full text-xs gap-1">
                                {prospect.source === "apollo" ? <i className="fa-solid fa-globe h-3 w-3" /> : <i className="fa-solid fa-database h-3 w-3" />}
                                {prospect.source === "apollo" ? "Apollo" : "Clado"}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                            {prospect.title && (
                              <span className="flex items-center gap-1 truncate">
                                <i className="fa-solid fa-briefcase h-3 w-3" />
                                {prospect.title}
                              </span>
                            )}
                            {prospect.company && (
                              <span className="flex items-center gap-1 truncate">
                                <i className="fa-solid fa-building h-3 w-3" />
                                {prospect.company}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Import summary */}
            {needsEnrichment > 0 && (serviceStatus?.hunter.connected || serviceStatus?.rocketreach.connected || serviceStatus?.clado.connected) && (
              <Alert className="rounded-xl border-forest/30 bg-forest/5">
                <i className="fa-solid fa-envelope h-4 w-4 text-forest" />
                <AlertDescription className="text-forest">
                  {[
                    serviceStatus?.hunter.connected && "Hunter",
                    serviceStatus?.rocketreach.connected && "RocketReach",
                    serviceStatus?.clado.connected && "Clado",
                  ].filter(Boolean).join(" & ")} will find emails for {needsEnrichment} prospect{needsEnrichment > 1 ? 's' : ''} without email addresses.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setStep("search")}
                className="rounded-full font-bold"
              >
                Back
              </Button>
              <Button
                onClick={handleEnrichAndImport}
                disabled={selectedCount === 0}
                className="flex-1 rounded-full font-bold gap-2"
              >
                <i className="fa-solid fa-user-plus h-4 w-4" />
                {(serviceStatus?.hunter.connected || serviceStatus?.rocketreach.connected || serviceStatus?.clado.connected) && needsEnrichment > 0
                  ? `Enrich & Import ${selectedCount} Leads`
                  : `Import ${selectedCount} Leads`
                }
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
