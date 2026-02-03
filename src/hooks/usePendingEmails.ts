/**
 * usePendingEmails - Hook for managing pending emails in confirm/read_only mode
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface PendingEmail {
  id: string;
  user_id: string;
  lead_id: string;
  conversation_id: string | null;
  to_email: string;
  to_name: string | null;
  subject: string;
  body: string;
  status: 'pending' | 'edited' | 'approved' | 'rejected' | 'sent';
  ai_generated: boolean;
  original_body: string | null;
  created_at: string;
  reviewed_at: string | null;
  sent_at: string | null;
  leads?: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    title: string | null;
  };
}

export function usePendingEmails() {
  const { user } = useAuth();
  const [pendingEmails, setPendingEmails] = useState<PendingEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch pending emails
  const fetchPendingEmails = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const response = await supabase.functions.invoke('manage-pending-email', {
        body: { action: 'list' },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      setPendingEmails(response.data?.pending_emails || []);
    } catch (err) {
      // Silent fail - pending emails may not be set up yet
      if (import.meta.env.DEV) {
        console.error('Error fetching pending emails:', err);
      }
      // Don't set error - just return empty list
      setPendingEmails([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!user) return;

    fetchPendingEmails();

    // Subscribe to changes
    const channel = supabase
      .channel(`pending-emails-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pending_emails',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchPendingEmails();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, fetchPendingEmails]);

  // Approve and send email
  const approveEmail = useCallback(async (
    pendingEmailId: string,
    updates?: { subject?: string; body?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await supabase.functions.invoke('manage-pending-email', {
        body: {
          action: 'approve',
          pending_email_id: pendingEmailId,
          updates,
        },
      });

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      if (!response.data?.success) {
        return { success: false, error: response.data?.error || 'Unknown error' };
      }

      // Refresh the list
      await fetchPendingEmails();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [fetchPendingEmails]);

  // Reject email
  const rejectEmail = useCallback(async (pendingEmailId: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await supabase.functions.invoke('manage-pending-email', {
        body: {
          action: 'reject',
          pending_email_id: pendingEmailId,
        },
      });

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      await fetchPendingEmails();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [fetchPendingEmails]);

  // Update email content
  const updateEmail = useCallback(async (
    pendingEmailId: string,
    updates: { subject?: string; body?: string }
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const response = await supabase.functions.invoke('manage-pending-email', {
        body: {
          action: 'update',
          pending_email_id: pendingEmailId,
          updates,
        },
      });

      if (response.error) {
        return { success: false, error: response.error.message };
      }

      await fetchPendingEmails();
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [fetchPendingEmails]);

  return {
    pendingEmails,
    loading,
    error,
    fetchPendingEmails,
    approveEmail,
    rejectEmail,
    updateEmail,
    pendingCount: pendingEmails.length,
  };
}
