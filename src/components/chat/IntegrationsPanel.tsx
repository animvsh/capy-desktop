/**
 * IntegrationsPanel - Data source integration toggles
 * 
 * Shows available data sources with checkboxes to enable/disable:
 * - Apollo.io (B2B data)
 * - CapyWeb (our in-house scraper)
 * - Perplexity (AI search)
 * - Sonar (real-time data)
 * 
 * Displays connection status, usage stats, and allows API key configuration.
 */

import React, { useState } from 'react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  Settings2, 
  Check, 
  X, 
  Loader2,
  Database,
  Globe,
  Sparkles,
  Radio,
  ChevronDown,
  Key,
  Clock,
  Trash2,
  RefreshCw
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIntegrations, Integration } from "@/hooks/useIntegrations";
import { cn } from "@/lib/utils";

// Icon mapping for integrations
const INTEGRATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  database: Database,
  globe: Globe,
  sparkles: Sparkles,
  radio: Radio,
};

// Format relative time
function formatRelativeTime(date: Date | null | undefined): string {
  if (!date) return 'Never';
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface IntegrationItemProps {
  integration: Integration;
  onToggle: (enabled: boolean) => void;
  onSaveApiKey: (apiKey: string) => void;
  onRemoveApiKey: () => void;
  isSaving: boolean;
}

function IntegrationItem({ 
  integration, 
  onToggle, 
  onSaveApiKey, 
  onRemoveApiKey,
  isSaving 
}: IntegrationItemProps) {
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  
  const Icon = INTEGRATION_ICONS[integration.icon] || Database;
  const usagePercent = integration.dailyLimit 
    ? Math.min(100, (integration.dailyUsed ?? 0) / integration.dailyLimit * 100)
    : 0;
  const hasUsageStats = integration.dailyLimit !== undefined && integration.dailyUsed !== undefined;
  
  const handleSaveApiKey = async () => {
    if (!apiKeyInput.trim()) return;
    setIsValidating(true);
    try {
      await onSaveApiKey(apiKeyInput.trim());
      setShowApiKeyInput(false);
      setApiKeyInput('');
    } finally {
      setIsValidating(false);
    }
  };
  
  return (
    <div className="p-2 rounded-lg hover:bg-muted/50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={cn("mt-0.5", integration.color)}>
            <Icon className="h-5 w-5" />
          </div>
          
          {/* Content */}
          <div className="space-y-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">
                {integration.name}
              </span>
              
              {/* Status badge */}
              {integration.connected ? (
                <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 h-5 text-[10px]">
                  <Check className="h-2.5 w-2.5 mr-1" />
                  Connected
                </Badge>
              ) : integration.requiresApiKey && !integration.apiKeyConfigured ? (
                <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50 h-5 text-[10px]">
                  <Key className="h-2.5 w-2.5 mr-1" />
                  Needs API Key
                </Badge>
              ) : (
                <Badge variant="outline" className="text-gray-500 border-gray-200 h-5 text-[10px]">
                  <X className="h-2.5 w-2.5 mr-1" />
                  Disconnected
                </Badge>
              )}
            </div>
            
            {/* Description */}
            <p className="text-xs text-muted-foreground">
              {integration.description}
            </p>
            
            {/* Usage Stats */}
            {hasUsageStats && integration.connected && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    Daily usage: {integration.dailyUsed}/{integration.dailyLimit}
                  </span>
                  <span className={cn(
                    usagePercent >= 90 ? "text-red-500" : 
                    usagePercent >= 70 ? "text-amber-500" : 
                    "text-muted-foreground"
                  )}>
                    {Math.round(usagePercent)}%
                  </span>
                </div>
                <Progress 
                  value={usagePercent} 
                  className="h-1"
                />
              </div>
            )}
            
            {/* Last sync time */}
            {integration.lastSyncAt && integration.connected && (
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                <Clock className="h-2.5 w-2.5" />
                Last synced: {formatRelativeTime(integration.lastSyncAt)}
              </div>
            )}
            
            {/* API Key Input */}
            {integration.requiresApiKey && showApiKeyInput && (
              <div className="flex gap-2 mt-2">
                <Input
                  type="password"
                  placeholder="Enter API key..."
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveApiKey();
                    if (e.key === 'Escape') {
                      setShowApiKeyInput(false);
                      setApiKeyInput('');
                    }
                  }}
                />
                <Button 
                  size="sm" 
                  className="h-7 px-2"
                  onClick={handleSaveApiKey}
                  disabled={isValidating || isSaving || !apiKeyInput.trim()}
                >
                  {isValidating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                </Button>
                <Button 
                  size="sm" 
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => {
                    setShowApiKeyInput(false);
                    setApiKeyInput('');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}

            {/* Configure / Remove API Key Buttons */}
            {integration.requiresApiKey && !showApiKeyInput && (
              <div className="flex items-center gap-2 mt-1">
                {!integration.apiKeyConfigured ? (
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-xs"
                    onClick={() => setShowApiKeyInput(true)}
                  >
                    Configure API Key
                  </Button>
                ) : (
                  <>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-muted-foreground"
                            onClick={() => setShowApiKeyInput(true)}
                          >
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Update key
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Replace current API key</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={onRemoveApiKey}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Remove API key</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Toggle Switch */}
        <Switch
          checked={integration.enabled}
          onCheckedChange={onToggle}
          disabled={isSaving || (!integration.connected && integration.id !== 'capyweb')}
          className="ml-2"
        />
      </div>
    </div>
  );
}

export function IntegrationsPanel() {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  
  const {
    integrations,
    isLoading,
    isSaving,
    enabledCount,
    reload,
    toggleIntegration,
    saveApiKey,
    removeApiKey,
  } = useIntegrations();

  const handleToggle = async (integrationId: string, enabled: boolean) => {
    const success = await toggleIntegration(integrationId, enabled);
    if (success) {
      toast({
        title: enabled ? "Integration enabled" : "Integration disabled",
        description: `${integrationId} has been ${enabled ? 'enabled' : 'disabled'}.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to update integration settings.",
        variant: "destructive",
      });
    }
  };

  const handleSaveApiKey = async (integrationId: string, apiKey: string) => {
    const success = await saveApiKey(integrationId, apiKey);
    if (success) {
      toast({
        title: "API key saved",
        description: `${integrationId} is now connected.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to save API key.",
        variant: "destructive",
      });
    }
  };

  const handleRemoveApiKey = async (integrationId: string) => {
    const success = await removeApiKey(integrationId);
    if (success) {
      toast({
        title: "API key removed",
        description: `${integrationId} has been disconnected.`,
      });
    } else {
      toast({
        title: "Error",
        description: "Failed to remove API key.",
        variant: "destructive",
      });
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="gap-2 h-8 px-3"
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Sources</span>
          <Badge variant="secondary" className="ml-1 h-5 px-1.5">
            {enabledCount}
          </Badge>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h4 className="font-semibold text-sm">Data Sources</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Choose which sources to use for lead discovery
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={reload}
            disabled={isLoading}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="p-2 max-h-[400px] overflow-y-auto">
            {integrations.map((integration, index) => (
              <React.Fragment key={integration.id}>
                {index > 0 && <Separator className="my-2" />}
                <IntegrationItem
                  integration={integration}
                  onToggle={(enabled) => handleToggle(integration.id, enabled)}
                  onSaveApiKey={(apiKey) => handleSaveApiKey(integration.id, apiKey)}
                  onRemoveApiKey={() => handleRemoveApiKey(integration.id)}
                  isSaving={isSaving}
                />
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="p-3 border-t bg-muted/30">
          <p className="text-[10px] text-muted-foreground text-center">
            Enabled sources are used when discovering leads
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default IntegrationsPanel;
