/**
 * useCredits Hook - Credit balance management with real-time updates
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface CreditBalance {
  total: number;
  base: number;
  purchased: number;
  adjustment: number;
  spent: number;
  available: number;
}

export interface CreditPackage {
  id: string;
  name: string;
  description: string;
  credits: number;
  price_cents: number;
  currency: string;
  popular: boolean;
  savings_percent: number | null;
}

export interface UseCreditsReturn {
  balance: CreditBalance | null;
  packages: CreditPackage[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  startCheckout: (packageId: string) => Promise<string | null>;
  hasCredits: (amount: number) => boolean;
}

export function useCredits(): UseCreditsReturn {
  const { session, user } = useAuth();
  const { toast } = useToast();
  
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load credits data
  const loadCredits = useCallback(async () => {
    if (!session?.access_token) {
      setIsLoading(false);
      return;
    }

    try {
      setError(null);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-credits`,
        {
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load credits');
      }

      const data = await response.json();
      setBalance(data.balance);
      setPackages(data.packages || []);
      
    } catch (err) {
      console.error('Error loading credits:', err);
      setError(err instanceof Error ? err.message : 'Failed to load credits');
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token]);

  // Initial load
  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  // Subscribe to real-time credit updates
  useEffect(() => {
    if (!user?.id) return;

    // Subscribe to user_settings changes
    const settingsChannel = supabase
      .channel(`user_credits:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_settings',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Update balance when user_settings changes
          const newData = payload.new as any;
          if (newData.cached_credits !== undefined) {
            setBalance(prev => prev ? {
              ...prev,
              total: newData.cached_credits,
              available: newData.cached_credits,
              purchased: newData.purchased_credits || prev.purchased,
              adjustment: newData.admin_credit_adjustment || prev.adjustment,
            } : null);
          }
        }
      )
      .subscribe();

    // Subscribe to new cost tracking (credit usage)
    const costChannel = supabase
      .channel(`credit_usage:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'api_cost_tracking',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newCost = payload.new as any;
          if (newCost.credits_used) {
            setBalance(prev => prev ? {
              ...prev,
              spent: prev.spent + newCost.credits_used,
              available: prev.available - newCost.credits_used,
              total: prev.total - newCost.credits_used,
            } : null);
          }
        }
      )
      .subscribe();

    // Subscribe to credit transactions (purchases)
    const txChannel = supabase
      .channel(`credit_transactions:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'credit_transactions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const tx = payload.new as any;
          if (tx.type === 'purchase' && tx.amount > 0) {
            // Refresh on purchase
            loadCredits();
            toast({
              title: 'Credits Added!',
              description: `${tx.amount.toLocaleString()} credits have been added to your account.`,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(settingsChannel);
      supabase.removeChannel(costChannel);
      supabase.removeChannel(txChannel);
    };
  }, [user?.id, loadCredits, toast]);

  // Start Stripe checkout
  const startCheckout = useCallback(async (packageId: string): Promise<string | null> => {
    if (!session?.access_token) {
      setError('Not authenticated');
      return null;
    }

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            packageId,
            successUrl: `${window.location.origin}/dashboard?payment=success`,
            cancelUrl: `${window.location.origin}/dashboard?payment=cancelled`,
          }),
        }
      );

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Checkout failed');
      }

      const { url } = await response.json();
      return url;
      
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Checkout failed';
      setError(message);
      toast({
        title: 'Checkout Failed',
        description: message,
        variant: 'destructive',
      });
      return null;
    }
  }, [session?.access_token, toast]);

  // Check if user has enough credits
  const hasCredits = useCallback((amount: number): boolean => {
    return (balance?.available || 0) >= amount;
  }, [balance?.available]);

  return {
    balance,
    packages,
    isLoading,
    error,
    refresh: loadCredits,
    startCheckout,
    hasCredits,
  };
}

export default useCredits;
