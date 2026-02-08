import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/Badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ProductProfile {
  url: string;
  one_liner: string;
  target_customer: string;
  core_problem: string;
  core_solution: string;
  not_for: string;
  tone: string;
  safe_phrases: string[];
  avoid_phrases: string[];
  raw_content?: Record<string, string>;
  product_category?: string;
  key_features?: string[];
  use_cases?: string[];
  integrations?: string[];
  pricing_model?: string;
  pricing_tiers?: string[];
  target_company_size?: string[];
  target_industries?: string[];
  key_benefits?: string[];
  social_proof?: string[];
  metrics_claimed?: string[];
  competitors_mentioned?: string[];
  unique_selling_points?: string[];
}

interface ProductAnalyzerProps {
  onComplete?: (profile: ProductProfile) => void;
  showHeader?: boolean;
  compact?: boolean;
}

type AnalysisStep = 'idle' | 'analyzing' | 'extracting' | 'done' | 'error';

const stepMessages: Record<AnalysisStep, string> = {
  idle: '',
  analyzing: 'Analyzing website...',
  extracting: 'Extracting insights...',
  done: 'Analysis complete!',
  error: 'Something went wrong',
};

const STORAGE_KEY = 'product-analyzer-state';

type SavedState = {
  url: string;
  step: AnalysisStep;
  profile: ProductProfile | null;
  error: string | null;
  requestId: string | null;
};

const saveState = (state: SavedState) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('[ProductAnalyzer] Failed to save state:', e);
  }
};

const loadState = (): SavedState | null => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.warn('[ProductAnalyzer] Failed to load state:', e);
    return null;
  }
};

const clearState = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('[ProductAnalyzer] Failed to clear state:', e);
  }
};

// Global request tracking - persists across component remounts
const globalRequests = new Map<string, {
  promise: Promise<any>;
  startTime: number;
  url: string;
}>();

// Track if cleanup interval is running to avoid multiple intervals
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

// Start cleanup interval if not already running
function startCleanupInterval() {
  if (cleanupIntervalId !== null) return;
  cleanupIntervalId = setInterval(() => {
    const now = Date.now();
    for (const [id, req] of globalRequests.entries()) {
      if (now - req.startTime > 5 * 60 * 1000) {
        globalRequests.delete(id);
      }
    }
    // If no more requests, stop the interval
    if (globalRequests.size === 0 && cleanupIntervalId !== null) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
    }
  }, 60000);
}

export function ProductAnalyzer({ onComplete, showHeader = true, compact = false }: ProductAnalyzerProps) {
  const { toast } = useToast();
  
  const savedState = loadState();
  const [url, setUrl] = useState(savedState?.url || '');
  const [step, setStep] = useState<AnalysisStep>(savedState?.step || 'idle');
  const [profile, setProfile] = useState<ProductProfile | null>(savedState?.profile || null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(savedState?.error || null);
  
  const isProcessingRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const requestPromiseRef = useRef<Promise<any> | null>(null);
  const currentRequestIdRef = useRef<string | null>(savedState?.requestId || null);

  // Helper to apply completed result
  const applyResult = (resultProfile: ProductProfile, requestId: string, resultUrl: string) => {
    saveState({
      url: resultUrl,
      step: 'done',
      profile: resultProfile,
      error: null,
      requestId,
    });
    setProfile(resultProfile);
    setStep('done');
    setError(null);
    isProcessingRef.current = false;
  };

  // Helper to apply error
  const applyError = (errorMsg: string, requestId: string, resultUrl: string) => {
    saveState({
      url: resultUrl,
      step: 'error',
      profile: null,
      error: errorMsg,
      requestId,
    });
    setError(errorMsg);
    setStep('error');
    isProcessingRef.current = false;
  };

  // Restore state on mount
  useEffect(() => {
    const currentSavedState = loadState();
    
    if (!currentSavedState?.requestId) return;

    // Restore completed profile
    if (currentSavedState.profile && currentSavedState.step === 'done') {
      setProfile(currentSavedState.profile);
      setStep('done');
      setError(null);
      isProcessingRef.current = false;
      currentRequestIdRef.current = currentSavedState.requestId;
      return;
    }

    // Restore error
    if (currentSavedState.step === 'error' && currentSavedState.error) {
      setError(currentSavedState.error);
      setStep('error');
      isProcessingRef.current = false;
      currentRequestIdRef.current = currentSavedState.requestId;
      return;
    }

    // Re-attach to active request
    const globalRequest = globalRequests.get(currentSavedState.requestId);
    if (globalRequest && currentSavedState.step !== 'done' && currentSavedState.step !== 'error') {
      isProcessingRef.current = true;
      requestPromiseRef.current = globalRequest.promise;
      currentRequestIdRef.current = currentSavedState.requestId;
      startTimeRef.current = globalRequest.startTime;
      setStep(currentSavedState.step || 'analyzing');
      setUrl(currentSavedState.url || '');
      
      globalRequest.promise
        .then((result) => {
          if (result?.profile) {
            const urlToSave = currentSavedState.url || globalRequest.url;
            applyResult(result.profile, currentSavedState.requestId, urlToSave);
            setTimeout(() => globalRequests.delete(currentSavedState.requestId), 1000);
          }
        })
        .catch((err) => {
          const urlToSave = currentSavedState.url || globalRequest.url;
          applyError(err instanceof Error ? err.message : 'Analysis failed', currentSavedState.requestId, urlToSave);
          setTimeout(() => globalRequests.delete(currentSavedState.requestId), 1000);
        });
    } else if (currentSavedState.step !== 'done' && currentSavedState.step !== 'error') {
      clearState();
      setStep('idle');
    }
  }, []);

  // Save state whenever it changes
  useEffect(() => {
    if (step !== 'idle' || profile || error) {
      saveState({
        url,
        step,
        profile,
        error,
        requestId: currentRequestIdRef.current,
      });
    } else {
      clearState();
    }
  }, [url, step, profile, error]);

  // Handle visibility change - check for completed results
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isProcessingRef.current) {
        // Re-check storage for completed results
        const savedState = loadState();
        if (savedState?.profile && savedState.step === 'done' && step !== 'done') {
          setProfile(savedState.profile);
          setStep('done');
          setError(null);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [step]);

  const analyzeUrl = async () => {
    if (!url.trim() || isProcessingRef.current) return;
    
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    currentRequestIdRef.current = requestId;
    isProcessingRef.current = true;
    startTimeRef.current = Date.now();
    
    setStep('analyzing');
    setError(null);

    // Update to extracting step after 2 seconds
    let progressInterval: ReturnType<typeof setInterval> | null = setInterval(() => {
      if (startTimeRef.current && Date.now() - startTimeRef.current > 2000) {
        setStep('extracting');
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
      }
    }, 100);

    const makeRequest = async () => {
      if (currentRequestIdRef.current !== requestId) return null;
      
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError || !session) {
          throw new Error('Not authenticated');
        }
        
        if (currentRequestIdRef.current !== requestId) return null;
        
        const response = await fetch(`${supabaseUrl}/functions/v1/understand-product`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': supabaseKey || '',
          },
          body: JSON.stringify({ action: 'analyze_url', url: url.trim() }),
          keepalive: true,
          cache: 'no-cache',
        });

        if (currentRequestIdRef.current !== requestId) return null;

        if (!response.ok) {
          const errorText = await response.text();
          let errorData;
          try {
            errorData = JSON.parse(errorText);
          } catch {
            throw new Error(errorText || `HTTP ${response.status}`);
          }
          throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
        }

        const data = await response.json();

        if (currentRequestIdRef.current !== requestId) return null;

        if (!data?.success) {
          if (data?.fallback) {
            return { error: data.error, fallback: true };
          }
          throw new Error(data?.error || 'Analysis failed');
        }

        return { profile: data.profile };
      } catch (err) {
        if (currentRequestIdRef.current !== requestId) return null;
        throw err;
      }
    };

    requestPromiseRef.current = makeRequest();
    globalRequests.set(requestId, {
      promise: requestPromiseRef.current,
      startTime: startTimeRef.current!,
      url: url.trim(),
    });
    startCleanupInterval(); // Start cleanup interval when we have requests

    try {
      const result = await requestPromiseRef.current;

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      if (currentRequestIdRef.current !== requestId || result === null) return;

      if (result.error && result.fallback) {
        setError(result.error);
        setStep('error');
        isProcessingRef.current = false;
        return;
      }

      if (result.profile) {
        applyResult(result.profile, requestId, url);
        if (document.hidden) {
          toast({
            title: "Analysis complete!",
            description: "Switch back to see your product profile.",
          });
        }
      }
    } catch (err) {
      if (currentRequestIdRef.current !== requestId) return;
      
      const errorMessage = err instanceof Error ? err.message : 'Analysis failed';
      
      if (errorMessage.includes('429')) {
        setError('Rate limited. Please try again in a moment.');
      } else if (errorMessage.includes('402')) {
        setError('Usage limit reached. Please check your account.');
      } else {
        setError(errorMessage);
      }
      
      setStep('error');
    } finally {
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      
      if (currentRequestIdRef.current === requestId) {
        isProcessingRef.current = false;
        startTimeRef.current = null;
        requestPromiseRef.current = null;
        
        if (step === 'done' || step === 'error') {
          clearState();
          globalRequests.delete(requestId);
        }
      }
    }
  };

  // Clear storage on unmount if not processing
  useEffect(() => {
    return () => {
      if (!isProcessingRef.current) {
        clearState();
      }
    };
  }, []);

  const saveProfile = async () => {
    if (!profile) return;
    
    setSaving(true);
    try {
      const response = await supabase.functions.invoke('understand-product', {
        body: { action: 'save_profile', profile },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to save');
      }

      toast({
        title: "Product profile saved!",
        description: "Capy now understands your product.",
      });

      if (onComplete) {
        onComplete(profile);
      }
    } catch (err) {
      toast({
        title: "Failed to save",
        description: err instanceof Error ? err.message : 'Please try again',
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateProfile = (field: keyof ProductProfile, value: string | string[]) => {
    if (!profile) return;
    setProfile({ ...profile, [field]: value });
  };

  // URL Input Step
  if (step === 'idle' || step === 'error') {
    return (
      <div className={compact ? "space-y-4" : "space-y-6"}>
        {showHeader && (
          <div className="text-center">
            <h2 className="text-xl font-bold text-foreground">Paste your website</h2>
            <p className="text-muted-foreground mt-1">Capy will learn what you do and start outbound for you.</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <i className="fa-solid fa-globe absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="yourcompany.com"
                className="pl-10 h-12 rounded-xl border-2 text-base"
                onKeyDown={(e) => e.key === 'Enter' && analyzeUrl()}
              />
            </div>
            <Button 
              onClick={analyzeUrl} 
              disabled={!url.trim()}
              className="h-12 px-6 rounded-xl font-bold"
            >
              Analyze
            </Button>
          </div>
          
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <i className="fa-solid fa-circle-exclamation h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p>{error}</p>
                <button 
                  onClick={() => { setStep('idle'); setError(null); }}
                  className="underline mt-1"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Loading Step
  if (step === 'analyzing' || step === 'extracting') {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="relative">
          <i className="fa-solid fa-spinner fa-spin h-12 w-12 text-primary" />
          <i className="fa-solid fa-wand-magic-sparkles absolute -top-1 -right-1 h-5 w-5 text-primary animate-pulse" />
        </div>
        <div className="text-center">
          <p className="font-semibold text-foreground">{stepMessages[step]}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {document.hidden 
              ? "Processing in background - you can switch tabs" 
              : "This may take a moment"}
          </p>
        </div>
      </div>
    );
  }

  // Profile Review Step
  if (step === 'done' && profile) {
    return (
      <div className="space-y-6">
        {showHeader && (
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary/10 text-primary rounded-full text-sm font-medium mb-3">
              <i className="fa-solid fa-check h-4 w-4" />
              Analysis complete
            </div>
            <h2 className="text-xl font-bold text-foreground">Here's what I understand about your product</h2>
            <p className="text-muted-foreground mt-1">Review and edit if needed</p>
          </div>
        )}

        <div className="rounded-2xl border-2 border-border bg-card p-5 space-y-5">
          {/* One-liner */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">What you do (one-liner)</Label>
            {isEditing ? (
              <Textarea
                value={profile.one_liner}
                onChange={(e) => updateProfile('one_liner', e.target.value)}
                className="rounded-xl"
              />
            ) : (
              <p className="text-foreground">{profile.one_liner}</p>
            )}
          </div>

          {/* Target Customer */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Who it's for</Label>
            {isEditing ? (
              <Input
                value={profile.target_customer}
                onChange={(e) => updateProfile('target_customer', e.target.value)}
                className="rounded-xl"
              />
            ) : (
              <p className="text-foreground">{profile.target_customer}</p>
            )}
          </div>

          {/* Core Problem */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Problem you solve</Label>
            {isEditing ? (
              <Textarea
                value={profile.core_problem}
                onChange={(e) => updateProfile('core_problem', e.target.value)}
                className="rounded-xl"
              />
            ) : (
              <p className="text-foreground">{profile.core_problem}</p>
            )}
          </div>

          {/* Core Solution */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">How you solve it</Label>
            {isEditing ? (
              <Textarea
                value={profile.core_solution}
                onChange={(e) => updateProfile('core_solution', e.target.value)}
                className="rounded-xl"
              />
            ) : (
              <p className="text-foreground">{profile.core_solution}</p>
            )}
          </div>

          {/* Not For */}
          {(profile.not_for || isEditing) && (
            <div className="space-y-2">
              <Label className="font-semibold text-sm">Not for</Label>
              {isEditing ? (
                <Input
                  value={profile.not_for}
                  onChange={(e) => updateProfile('not_for', e.target.value)}
                  placeholder="Who should NOT use this product?"
                  className="rounded-xl"
                />
              ) : (
                <p className="text-foreground">{profile.not_for || 'Not specified'}</p>
              )}
            </div>
          )}

          {/* Tone */}
          <div className="space-y-2">
            <Label className="font-semibold text-sm">Detected tone</Label>
            <p className="text-foreground capitalize">{profile.tone}</p>
          </div>

          {/* Enhanced Information - Collapsible */}
          {(profile.key_features?.length || profile.use_cases?.length || profile.integrations?.length ||
            profile.target_industries?.length || profile.social_proof?.length) && (
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline w-full py-2">
                <i className="fa-solid fa-chevron-down h-4 w-4" />
                View more extracted details
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                {/* Product Category */}
                {profile.product_category && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-2">
                      <i className="fa-solid fa-bullseye h-4 w-4 text-muted-foreground" />
                      Product Category
                    </Label>
                    <Badge variant="secondary">{profile.product_category}</Badge>
                  </div>
                )}

                {/* Key Features */}
                {profile.key_features && profile.key_features.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-2">
                      <i className="fa-solid fa-bolt h-4 w-4 text-muted-foreground" />
                      Key Features
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.key_features.map((feature, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{feature}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Use Cases */}
                {profile.use_cases && profile.use_cases.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Use Cases</Label>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {profile.use_cases.map((useCase, i) => (
                        <li key={i}>{useCase}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Integrations */}
                {profile.integrations && profile.integrations.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Integrations</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.integrations.map((integration, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{integration}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Industries */}
                {profile.target_industries && profile.target_industries.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-2">
                      <i className="fa-solid fa-users h-4 w-4 text-muted-foreground" />
                      Target Industries
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.target_industries.map((industry, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{industry}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Company Size */}
                {profile.target_company_size && profile.target_company_size.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Target Company Size</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.target_company_size.map((size, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{size}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pricing */}
                {(profile.pricing_model || (profile.pricing_tiers && profile.pricing_tiers.length > 0)) && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-2">
                      <i className="fa-solid fa-dollar-sign h-4 w-4 text-muted-foreground" />
                      Pricing
                    </Label>
                    {profile.pricing_model && (
                      <p className="text-sm text-muted-foreground capitalize">{profile.pricing_model}</p>
                    )}
                    {profile.pricing_tiers && profile.pricing_tiers.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {profile.pricing_tiers.map((tier, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{tier}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Key Benefits */}
                {profile.key_benefits && profile.key_benefits.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-2">
                      <i className="fa-solid fa-arrow-trend-up h-4 w-4 text-muted-foreground" />
                      Key Benefits
                    </Label>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {profile.key_benefits.map((benefit, i) => (
                        <li key={i}>{benefit}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Social Proof */}
                {profile.social_proof && profile.social_proof.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm flex items-center gap-2">
                      <i className="fa-solid fa-quote-left h-4 w-4 text-muted-foreground" />
                      Social Proof
                    </Label>
                    <ul className="space-y-2">
                      {profile.social_proof.slice(0, 3).map((proof, i) => (
                        <li key={i} className="text-sm text-muted-foreground italic border-l-2 border-primary/20 pl-3">
                          "{proof}"
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Metrics */}
                {profile.metrics_claimed && profile.metrics_claimed.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Metrics Claimed</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.metrics_claimed.map((metric, i) => (
                        <Badge key={i} className="text-xs bg-green-500/10 text-green-700 border-green-500/20">{metric}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Unique Selling Points */}
                {profile.unique_selling_points && profile.unique_selling_points.length > 0 && (
                  <div className="space-y-2">
                    <Label className="font-semibold text-sm">Unique Selling Points</Label>
                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                      {profile.unique_selling_points.map((usp, i) => (
                        <li key={i}>{usp}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setIsEditing(!isEditing)}
            className="rounded-xl font-semibold gap-2"
          >
            <i className="fa-solid fa-pen-to-square h-4 w-4" />
            {isEditing ? 'Done editing' : 'Edit'}
          </Button>

          <Button
            onClick={saveProfile}
            disabled={saving}
            className="rounded-xl font-bold gap-2"
          >
            {saving ? (
              <i className="fa-solid fa-spinner fa-spin h-4 w-4" />
            ) : (
              <i className="fa-solid fa-check h-4 w-4" />
            )}
            {saving ? 'Saving...' : 'Looks good'}
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
