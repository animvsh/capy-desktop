/**
 * useCapyConversations - Database-driven conversation fetching with real-time updates
 *
 * This hook fetches Capy-related email conversations from the database instead of
 * polling Gmail directly. It provides real-time updates via Supabase subscriptions.
 *
 * Features:
 * - Fetches conversations with lead info and latest message
 * - Real-time subscription for new messages and conversation updates
 * - Filtering by inbox (has replies), sent, unread, starred
 * - Mark as read, toggle star actions
 * - Get all messages for a conversation thread
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// Types for Capy conversations (database-driven)
export interface CapyConversation {
  id: string;
  user_id: string;
  lead_id: string;
  thread_id: string | null;
  subject: string | null;
  recipient_email: string | null;
  status: string;
  is_read: boolean;
  is_starred: boolean;
  message_count: number;
  last_message_at: string;
  created_at: string;
  lead: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    title: string | null;
  };
  latestMessage: CapyMessage | null;
}

export interface CapyMessage {
  id: string;
  conversation_id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  sent_at: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
  external_id: string | null;
  ai_intent: string | null;
  opened_at: string | null;
  open_count: number;
}

export type FilterTab = 'all' | 'inbox' | 'sent' | 'unread' | 'starred';

export function useCapyConversations() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<CapyConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [error, setError] = useState<string | null>(null);

  // Fetch conversations from database
  const fetchConversations = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setError(null);

      // Fetch conversations with lead info
      const { data: convData, error: convError } = await supabase
        .from('conversations')
        .select(`
          *,
          leads!inner (id, name, email, company, title)
        `)
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false });

      if (convError) {
        if (import.meta.env.DEV) console.error('Error fetching conversations:', convError);
        setError(convError.message);
        setLoading(false);
        return;
      }

      if (!convData || convData.length === 0) {
        setConversations([]);
        setLoading(false);
        return;
      }

      // OPTIMIZATION: Batch fetch latest messages for all conversations in ONE query
      // This eliminates N+1 queries (was: 1 query per conversation)
      const convIds = convData.map(c => c.id);
      
      // Use a CTE-style approach: get latest message per conversation via distinct on
      const { data: latestMessages, error: msgError } = await supabase
        .from('messages')
        .select('*')
        .in('conversation_id', convIds)
        .order('conversation_id')
        .order('sent_at', { ascending: false });

      if (msgError && import.meta.env.DEV) {
        console.error('Error fetching messages:', msgError);
      }

      // Build a map of conversation_id -> latest message
      const latestMessageMap = new Map<string, CapyMessage>();
      if (latestMessages) {
        for (const msg of latestMessages) {
          // Only keep the first (latest) message per conversation
          if (!latestMessageMap.has(msg.conversation_id)) {
            latestMessageMap.set(msg.conversation_id, msg as CapyMessage);
          }
        }
      }

      // Map conversations with their latest messages
      const conversationsWithMessages = convData.map((conv) => ({
        ...conv,
        is_read: conv.is_read ?? true,
        is_starred: conv.is_starred ?? false,
        lead: conv.leads,
        latestMessage: latestMessageMap.get(conv.id) || null,
      } as CapyConversation));

      setConversations(conversationsWithMessages);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error in fetchConversations:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Real-time subscription for conversations and messages
  useEffect(() => {
    if (!user) return;

    // Initial fetch from database
    fetchConversations();

    // Also check Gmail for new emails on initial load
    (async () => {
      try {
        const response = await supabase.functions.invoke('check-inbox', {
          body: { user_id: user.id, manual: true },
        });

        if (response.error) {
          // Silently handle errors - likely Gmail not connected yet
          // Only log in dev mode for debugging
          if (import.meta.env.DEV) {
            const errorMsg = response.error?.message || 'Unknown error';
            // Only log if it's not a common "not connected" error
            if (!errorMsg.includes('not connected') && !errorMsg.includes('No Gmail connection')) {
              console.warn('[useCapyConversations] check-inbox:', errorMsg);
            }
          }
          return;
        }
        
        const results = response.data?.results || [];
        const processed = results.reduce((sum: number, r: any) => sum + (r.processed || 0), 0);
        
        if (processed > 0) {
          // Refetch conversations after processing new emails
          fetchConversations();
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('[useCapyConversations] Initial check error:', err);
      }
    })();

    // Subscribe to conversation changes
    const channel = supabase
      .channel(`capy-conversations-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          // Refetch to get updated data with lead info
          fetchConversations();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        () => {
          // Refetch to update latest message and unread status
          fetchConversations();
        }
      )
      .subscribe();

    // Also poll Gmail periodically for new emails (every 2 minutes)
    const pollInterval = setInterval(async () => {
      try {
        const response = await supabase.functions.invoke('check-inbox', {
          body: { user_id: user.id, manual: true },
        });

        // Silently handle errors during polling
        if (response.error) {
          return;
        }

        const results = response.data?.results || [];
        const processed = results.reduce((sum: number, r: any) => sum + (r.processed || 0), 0);
        if (processed > 0) {
          fetchConversations();
        }
      } catch (err) {
        // Silently ignore - expected when Gmail not connected
        if (import.meta.env.DEV) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (!errorMsg.includes('not connected') && !errorMsg.includes('No Gmail connection')) {
            console.warn('[useCapyConversations] Poll error:', errorMsg);
          }
        }
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [user, fetchConversations]);

  // Filter conversations based on selected tab
  const filteredConversations = conversations.filter((conv) => {
    switch (filter) {
      case 'unread':
        return !conv.is_read;
      case 'starred':
        return conv.is_starred;
      case 'inbox':
        // Inbox = conversations that have at least one inbound message (reply received)
        return conv.latestMessage?.direction === 'inbound';
      case 'sent':
        // Sent = all conversations (all have at least one outbound message)
        // Show conversations where latest message is outbound (awaiting reply)
        return conv.latestMessage?.direction === 'outbound';
      case 'all':
      default:
        return true;
    }
  });

  // Mark conversation as read
  const markAsRead = useCallback(async (conversationId: string) => {
    const { error: updateError } = await supabase
      .from('conversations')
      .update({ is_read: true })
      .eq('id', conversationId);

    if (updateError) {
      if (import.meta.env.DEV) console.error('Error marking as read:', updateError);
      return false;
    }

    // Optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, is_read: true } : c))
    );
    return true;
  }, []);

  // Toggle star status
  const toggleStar = useCallback(async (conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    if (!conv) return false;

    const newStarred = !conv.is_starred;

    const { error: updateError } = await supabase
      .from('conversations')
      .update({ is_starred: newStarred })
      .eq('id', conversationId);

    if (updateError) {
      if (import.meta.env.DEV) console.error('Error toggling star:', updateError);
      return false;
    }

    // Optimistic update
    setConversations((prev) =>
      prev.map((c) => (c.id === conversationId ? { ...c, is_starred: newStarred } : c))
    );
    return true;
  }, [conversations]);

  // Get all messages for a conversation (for thread view)
  const getConversationMessages = useCallback(async (conversationId: string): Promise<CapyMessage[]> => {
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true });

    if (fetchError) {
      if (import.meta.env.DEV) console.error('Error fetching messages:', fetchError);
      return [];
    }

    return (data || []) as CapyMessage[];
  }, []);

  // Search conversations by lead name, email, or subject
  const searchConversations = useCallback((query: string) => {
    if (!query.trim()) {
      return filteredConversations;
    }

    const lowerQuery = query.toLowerCase();
    return filteredConversations.filter((conv) => {
      const leadName = conv.lead?.name?.toLowerCase() || '';
      const leadEmail = conv.lead?.email?.toLowerCase() || '';
      const subject = conv.subject?.toLowerCase() || '';
      const content = conv.latestMessage?.content?.toLowerCase() || '';

      return (
        leadName.includes(lowerQuery) ||
        leadEmail.includes(lowerQuery) ||
        subject.includes(lowerQuery) ||
        content.includes(lowerQuery)
      );
    });
  }, [filteredConversations]);

  // Check for new emails from Gmail and import to database
  const checkForNewEmails = useCallback(async (): Promise<{ processed: number; error?: string }> => {
    if (!user) return { processed: 0, error: 'Not logged in' };

    try {
      const response = await supabase.functions.invoke('check-inbox', {
        body: { user_id: user.id, manual: true },
      });

      if (response.error) {
        console.error('check-inbox error:', response.error);
        return { processed: 0, error: response.error.message };
      }

      const results = response.data?.results || [];
      const processed = results.reduce((sum: number, r: any) => sum + (r.processed || 0), 0);

      // Refetch conversations to show new messages
      if (processed > 0) {
        await fetchConversations();
      }

      return { processed };
    } catch (err) {
      console.error('Error checking for new emails:', err);
      return { processed: 0, error: err instanceof Error ? err.message : 'Unknown error' };
    }
  }, [user, fetchConversations]);

  return {
    conversations: filteredConversations,
    allConversations: conversations,
    loading,
    error,
    filter,
    setFilter,
    fetchConversations,
    checkForNewEmails,
    markAsRead,
    toggleStar,
    getConversationMessages,
    searchConversations,
  };
}
