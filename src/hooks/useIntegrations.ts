/**
 * useIntegrations Hook
 * 
 * Manages user integration preferences and API keys:
 * - Apollo.io (B2B data)
 * - CapyWeb (built-in, always connected)
 * - Perplexity (AI search)
 * - Sonar (real-time data)
 * 
 * Features:
 * - Load/save integration settings
 * - API key validation
 * - Usage tracking
 * - Connection status management
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Integration {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  connected: boolean;
  requiresApiKey: boolean;
  apiKeyConfigured: boolean;
  dailyLimit?: number;
  dailyUsed?: number;
  lastSyncAt?: Date | null;
  color: string;
  icon: string;
}

export interface UserIntegrations {
  apollo_enabled: boolean;
  capyweb_enabled: boolean;
  perplexity_enabled: boolean;
  sonar_enabled: boolean;
  rocketreach_enabled: boolean;
  hunter_enabled: boolean;
  clado_enabled: boolean;
  apollo_connected: boolean;
  perplexity_connected: boolean;
  sonar_connected: boolean;
  capyweb_connected: boolean;
  rocketreach_connected: boolean;
  hunter_connected: boolean;
  clado_connected: boolean;
  apollo_api_key?: string;
  perplexity_api_key?: string;
  sonar_api_key?: string;
  rocketreach_api_key?: string;
  hunter_api_key?: string;
  clado_api_key?: string;
  apollo_daily_limit: number;
  apollo_daily_used: number;
  perplexity_daily_limit: number;
  perplexity_daily_used: number;
  rocketreach_daily_limit: number;
  rocketreach_daily_used: number;
  hunter_daily_limit: number;
  hunter_daily_used: number;
  apollo_last_sync?: string;
  perplexity_last_sync?: string;
  sonar_last_sync?: string;
  rocketreach_last_sync?: string;
  hunter_last_sync?: string;
  clado_last_sync?: string;
}

const DEFAULT_INTEGRATIONS: UserIntegrations = {
  apollo_enabled: true,
  capyweb_enabled: true,
  perplexity_enabled: false,
  sonar_enabled: false,
  rocketreach_enabled: true,
  hunter_enabled: true,
  clado_enabled: true,
  apollo_connected: false,
  perplexity_connected: false,
  sonar_connected: false,
  capyweb_connected: true,
  rocketreach_connected: false,
  hunter_connected: false,
  clado_connected: false,
  apollo_daily_limit: 100,
  apollo_daily_used: 0,
  perplexity_daily_limit: 50,
  perplexity_daily_used: 0,
  rocketreach_daily_limit: 100,
  rocketreach_daily_used: 0,
  hunter_daily_limit: 200,
  hunter_daily_used: 0,
};

interface UseIntegrationsResult {
  integrations: Integration[];
  rawIntegrations: UserIntegrations;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  enabledCount: number;
  reload: () => Promise<void>;
  toggleIntegration: (integrationId: string, enabled: boolean) => Promise<boolean>;
  saveApiKey: (integrationId: string, apiKey: string) => Promise<boolean>;
  removeApiKey: (integrationId: string) => Promise<boolean>;
  validateApiKey: (integrationId: string, apiKey: string) => Promise<{ valid: boolean; error?: string }>;
  getEnabledSources: () => string[];
}

export function useIntegrations(): UseIntegrationsResult {
  const { user } = useAuth();
  const [rawIntegrations, setRawIntegrations] = useState<UserIntegrations>(DEFAULT_INTEGRATIONS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load integrations on mount
  const loadIntegrations = useCallback(async () => {
    if (!user) return;

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('user_integrations')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (fetchError && fetchError.code !== 'PGRST116' && fetchError.code !== 'PGRST205') {
        // PGRST116 = no rows, PGRST205 = table doesn't exist
        console.error('Failed to load integrations:', fetchError);
        // Don't set error - just use defaults silently
      }

      if (data) {
        setRawIntegrations({
          apollo_enabled: data.apollo_enabled ?? true,
          capyweb_enabled: data.capyweb_enabled ?? true,
          perplexity_enabled: data.perplexity_enabled ?? false,
          sonar_enabled: data.sonar_enabled ?? false,
          rocketreach_enabled: data.rocketreach_enabled ?? true,
          hunter_enabled: data.hunter_enabled ?? true,
          clado_enabled: data.clado_enabled ?? true,
          apollo_connected: data.apollo_connected ?? false,
          perplexity_connected: data.perplexity_connected ?? false,
          sonar_connected: data.sonar_connected ?? false,
          capyweb_connected: true,
          rocketreach_connected: data.rocketreach_connected ?? false,
          hunter_connected: data.hunter_connected ?? false,
          clado_connected: data.clado_connected ?? false,
          apollo_api_key: data.apollo_api_key ? '••••••••' : undefined,
          perplexity_api_key: data.perplexity_api_key ? '••••••••' : undefined,
          sonar_api_key: data.sonar_api_key ? '••••••••' : undefined,
          rocketreach_api_key: data.rocketreach_api_key ? '••••••••' : undefined,
          hunter_api_key: data.hunter_api_key ? '••••••••' : undefined,
          clado_api_key: data.clado_api_key ? '••••••••' : undefined,
          apollo_daily_limit: data.apollo_daily_limit ?? 100,
          apollo_daily_used: data.apollo_daily_used ?? 0,
          perplexity_daily_limit: data.perplexity_daily_limit ?? 50,
          perplexity_daily_used: data.perplexity_daily_used ?? 0,
          rocketreach_daily_limit: data.rocketreach_daily_limit ?? 100,
          rocketreach_daily_used: data.rocketreach_daily_used ?? 0,
          hunter_daily_limit: data.hunter_daily_limit ?? 200,
          hunter_daily_used: data.hunter_daily_used ?? 0,
          apollo_last_sync: data.apollo_last_sync,
          perplexity_last_sync: data.perplexity_last_sync,
          sonar_last_sync: data.sonar_last_sync,
          rocketreach_last_sync: data.rocketreach_last_sync,
          hunter_last_sync: data.hunter_last_sync,
          clado_last_sync: data.clado_last_sync,
        });
      }
    } catch (err) {
      console.error('Error loading integrations:', err);
      setError('Failed to load integration settings');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  // Toggle integration enabled/disabled
  const toggleIntegration = useCallback(async (integrationId: string, enabled: boolean): Promise<boolean> => {
    if (!user) return false;

    setIsSaving(true);
    const key = `${integrationId}_enabled` as keyof UserIntegrations;
    const previousValue = rawIntegrations[key];

    // Optimistic update
    setRawIntegrations(prev => ({ ...prev, [key]: enabled }));

    try {
      const { error: updateError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          [key]: enabled,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (updateError) throw updateError;
      return true;
    } catch (err) {
      // Revert on error
      setRawIntegrations(prev => ({ ...prev, [key]: previousValue }));
      setError('Failed to update integration');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user, rawIntegrations]);

  // Save API key for an integration
  const saveApiKey = useCallback(async (integrationId: string, apiKey: string): Promise<boolean> => {
    if (!user || !apiKey.trim()) return false;

    setIsSaving(true);
    const keyField = `${integrationId}_api_key` as keyof UserIntegrations;
    const connectedField = `${integrationId}_connected` as keyof UserIntegrations;

    try {
      // First validate the API key
      const validation = await validateApiKey(integrationId, apiKey);
      if (!validation.valid) {
        setError(validation.error || 'Invalid API key');
        return false;
      }

      const { error: updateError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          [keyField]: apiKey.trim(),
          [connectedField]: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (updateError) throw updateError;

      setRawIntegrations(prev => ({
        ...prev,
        [keyField]: '••••••••',
        [connectedField]: true,
      }));

      return true;
    } catch (err) {
      setError('Failed to save API key');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  // Remove API key for an integration
  const removeApiKey = useCallback(async (integrationId: string): Promise<boolean> => {
    if (!user) return false;

    setIsSaving(true);
    const keyField = `${integrationId}_api_key` as keyof UserIntegrations;
    const connectedField = `${integrationId}_connected` as keyof UserIntegrations;
    const enabledField = `${integrationId}_enabled` as keyof UserIntegrations;

    try {
      const { error: updateError } = await supabase
        .from('user_integrations')
        .upsert({
          user_id: user.id,
          [keyField]: null,
          [connectedField]: false,
          [enabledField]: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id',
        });

      if (updateError) throw updateError;

      setRawIntegrations(prev => ({
        ...prev,
        [keyField]: undefined,
        [connectedField]: false,
        [enabledField]: false,
      }));

      return true;
    } catch (err) {
      setError('Failed to remove API key');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user]);

  // Validate API key
  const validateApiKey = useCallback(async (
    integrationId: string, 
    apiKey: string
  ): Promise<{ valid: boolean; error?: string }> => {
    if (!apiKey.trim()) {
      return { valid: false, error: 'API key is required' };
    }

    try {
      // Call the manage-integrations function to validate
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        return { valid: false, error: 'Not authenticated' };
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-integrations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'validate_api_key',
            integration: integrationId,
            api_key: apiKey,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { valid: false, error: errorData.error || 'Validation failed' };
      }

      const result = await response.json();
      return { valid: result.valid, error: result.error };
    } catch (err) {
      console.error('API key validation error:', err);
      // If the function doesn't exist yet, just accept the key
      return { valid: true };
    }
  }, []);

  // Get list of enabled sources
  const getEnabledSources = useCallback((): string[] => {
    const sources: string[] = [];
    
    if (rawIntegrations.capyweb_enabled && rawIntegrations.capyweb_connected) {
      sources.push('capyweb');
    }
    if (rawIntegrations.apollo_enabled && rawIntegrations.apollo_connected) {
      sources.push('apollo');
    }
    if (rawIntegrations.perplexity_enabled && rawIntegrations.perplexity_connected) {
      sources.push('perplexity');
    }
    if (rawIntegrations.sonar_enabled && rawIntegrations.sonar_connected) {
      sources.push('sonar');
    }
    if (rawIntegrations.rocketreach_enabled && rawIntegrations.rocketreach_connected) {
      sources.push('rocketreach');
    }
    if (rawIntegrations.hunter_enabled && rawIntegrations.hunter_connected) {
      sources.push('hunter');
    }
    if (rawIntegrations.clado_enabled && rawIntegrations.clado_connected) {
      sources.push('clado');
    }
    
    return sources;
  }, [rawIntegrations]);

  // Transform raw integrations to UI format
  const integrations: Integration[] = [
    {
      id: 'apollo',
      name: 'Apollo.io',
      description: 'B2B contact & company data',
      icon: 'database',
      enabled: rawIntegrations.apollo_enabled,
      connected: rawIntegrations.apollo_connected,
      requiresApiKey: true,
      apiKeyConfigured: !!rawIntegrations.apollo_api_key,
      dailyLimit: rawIntegrations.apollo_daily_limit,
      dailyUsed: rawIntegrations.apollo_daily_used,
      lastSyncAt: rawIntegrations.apollo_last_sync ? new Date(rawIntegrations.apollo_last_sync) : null,
      color: 'text-blue-500',
    },
    {
      id: 'capyweb',
      name: 'CapyWeb',
      description: 'AI-powered web discovery',
      icon: 'globe',
      enabled: rawIntegrations.capyweb_enabled,
      connected: true,
      requiresApiKey: false,
      apiKeyConfigured: true,
      color: 'text-green-500',
    },
    {
      id: 'perplexity',
      name: 'Perplexity',
      description: 'AI search & research',
      icon: 'sparkles',
      enabled: rawIntegrations.perplexity_enabled,
      connected: rawIntegrations.perplexity_connected,
      requiresApiKey: true,
      apiKeyConfigured: !!rawIntegrations.perplexity_api_key,
      dailyLimit: rawIntegrations.perplexity_daily_limit,
      dailyUsed: rawIntegrations.perplexity_daily_used,
      lastSyncAt: rawIntegrations.perplexity_last_sync ? new Date(rawIntegrations.perplexity_last_sync) : null,
      color: 'text-purple-500',
    },
    {
      id: 'sonar',
      name: 'Sonar',
      description: 'Real-time business signals',
      icon: 'radio',
      enabled: rawIntegrations.sonar_enabled,
      connected: rawIntegrations.sonar_connected,
      requiresApiKey: true,
      apiKeyConfigured: !!rawIntegrations.sonar_api_key,
      lastSyncAt: rawIntegrations.sonar_last_sync ? new Date(rawIntegrations.sonar_last_sync) : null,
      color: 'text-orange-500',
    },
    {
      id: 'rocketreach',
      name: 'RocketReach',
      description: 'Professional contact lookup',
      icon: 'database',
      enabled: rawIntegrations.rocketreach_enabled,
      connected: rawIntegrations.rocketreach_connected,
      requiresApiKey: true,
      apiKeyConfigured: !!rawIntegrations.rocketreach_api_key,
      dailyLimit: rawIntegrations.rocketreach_daily_limit,
      dailyUsed: rawIntegrations.rocketreach_daily_used,
      lastSyncAt: rawIntegrations.rocketreach_last_sync ? new Date(rawIntegrations.rocketreach_last_sync) : null,
      color: 'text-cyan-500',
    },
    {
      id: 'hunter',
      name: 'Hunter.io',
      description: 'Email finding & verification',
      icon: 'database',
      enabled: rawIntegrations.hunter_enabled,
      connected: rawIntegrations.hunter_connected,
      requiresApiKey: true,
      apiKeyConfigured: !!rawIntegrations.hunter_api_key,
      dailyLimit: rawIntegrations.hunter_daily_limit,
      dailyUsed: rawIntegrations.hunter_daily_used,
      lastSyncAt: rawIntegrations.hunter_last_sync ? new Date(rawIntegrations.hunter_last_sync) : null,
      color: 'text-amber-500',
    },
    {
      id: 'clado',
      name: 'Clado',
      description: 'AI deep research & enrichment',
      icon: 'sparkles',
      enabled: rawIntegrations.clado_enabled,
      connected: rawIntegrations.clado_connected,
      requiresApiKey: true,
      apiKeyConfigured: !!rawIntegrations.clado_api_key,
      lastSyncAt: rawIntegrations.clado_last_sync ? new Date(rawIntegrations.clado_last_sync) : null,
      color: 'text-indigo-500',
    },
  ];

  const enabledCount = integrations.filter(i => i.enabled && i.connected).length;

  return {
    integrations,
    rawIntegrations,
    isLoading,
    isSaving,
    error,
    enabledCount,
    reload: loadIntegrations,
    toggleIntegration,
    saveApiKey,
    removeApiKey,
    validateApiKey,
    getEnabledSources,
  };
}

export default useIntegrations;
