/**
 * useComposio Hook - Wraps existing Composio edge functions for email operations
 *
 * Uses existing infrastructure:
 * - composio-connect (OAuth, status, disconnect)
 * - send-outreach (email sending)
 * - check-inbox (inbox checking)
 * - sync-gmail-thread (thread syncing)
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import { useApp } from '@/contexts/AppContext';

// ============================================
// TYPES
// ============================================

export interface Email {
  id: string;
  threadId: string;
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  bodyPlain?: string;
  date: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  snippet?: string;
  hasAttachments?: boolean;
}

export interface EmailThread {
  id: string;
  subject: string;
  participants: string[];
  messages: Email[];
  lastMessageDate: Date;
  isRead: boolean;
  isStarred: boolean;
  snippet?: string;
  messageCount: number;
}

export interface ComposioStatus {
  emailConnected: boolean;
  calendarConnected: boolean;
  meetConnected: boolean;
  connectedEmail: string | null;
  emailTriggerEnabled?: boolean;
}

export interface UseComposioReturn {
  // Connection status
  status: ComposioStatus;
  isLoading: boolean;
  isConfigured: boolean;

  // Connection management
  checkStatus: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshConnection: () => Promise<void>;
  testConnection: () => Promise<boolean>;

  // Email operations
  fetchEmails: (options?: FetchEmailsOptions) => Promise<Email[]>;
  getEmail: (messageId: string) => Promise<Email | null>;
  getThread: (threadId: string) => Promise<EmailThread | null>;
  sendEmail: (to: string, subject: string, body: string) => Promise<boolean>;
  replyToThread: (threadId: string, body: string) => Promise<boolean>;
  deleteEmail: (messageId: string) => Promise<boolean>;
  starEmail: (messageId: string, starred: boolean) => Promise<boolean>;
  archiveEmail: (messageId: string) => Promise<boolean>;
  markAsRead: (messageId: string, read: boolean) => Promise<boolean>;

  // Error state
  error: string | null;
}

interface FetchEmailsOptions {
  maxResults?: number;
  query?: string;
  labelIds?: string[];
  pageToken?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function parseGmailMessage(msg: any): Email {
  // Handle both Gmail API format and direct/simplified formats
  const headers = msg.payload?.headers || msg.headers || [];
  const getHeader = (name: string) => {
    const header = headers.find((h: any) => 
      (h.name || h.key || '').toLowerCase() === name.toLowerCase()
    );
    return header?.value || header?.v || '';
  };

  // Extract from/to with fallbacks for different formats
  let fromHeader = getHeader('From') || msg.from || msg.sender || msg.fromAddress || '';
  if (typeof fromHeader === 'object') {
    fromHeader = fromHeader.email ? `${fromHeader.name || ''} <${fromHeader.email}>` : '';
  }
  const fromMatch = fromHeader.match(/^(.+?)\s*<(.+?)>$/) || [null, fromHeader, fromHeader];

  let toHeader = getHeader('To') || msg.to || msg.recipient || msg.toAddress || '';
  if (typeof toHeader === 'object') {
    toHeader = toHeader.email ? `${toHeader.name || ''} <${toHeader.email}>` : '';
  }
  const toMatch = toHeader.match(/^(.+?)\s*<(.+?)>$/) || [null, toHeader, toHeader];

  // Get body from multiple possible locations
  let body = '';
  let bodyPlain = '';

  // Try payload body first (base64 encoded)
  if (msg.payload?.body?.data) {
    try {
      body = atob(msg.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      bodyPlain = body;
    } catch (e) {
      console.warn('Failed to decode payload body:', e);
      body = msg.payload.body.data;
    }
  }
  
  // Try parts
  if ((!body || !bodyPlain) && msg.payload?.parts) {
    for (const part of msg.payload.parts) {
      try {
        if (part.mimeType === 'text/html' && part.body?.data) {
          body = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyPlain = atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        }
      } catch (e) {
        console.warn('Failed to decode part body:', e);
      }
    }
  }

  // Fallbacks for direct body fields
  if (!body && !bodyPlain) {
    body = msg.body || msg.messageText || msg.content || msg.text || msg.plainText || '';
    bodyPlain = msg.plainText || msg.text || body;
  }

  // Get labels with fallbacks
  const labelIds = msg.labelIds || msg.labels || ['INBOX'];

  // Parse date with fallbacks
  let date: Date;
  if (msg.internalDate) {
    date = new Date(parseInt(msg.internalDate));
  } else if (msg.date || msg.receivedAt || msg.sentAt) {
    date = new Date(msg.date || msg.receivedAt || msg.sentAt);
  } else {
    date = new Date();
  }

  // Get subject with fallbacks
  const subject = getHeader('Subject') || msg.subject || msg.Subject || '(No subject)';

  return {
    id: msg.id || msg.messageId || `msg-${Date.now()}`,
    threadId: msg.threadId || msg.thread_id || msg.id,
    from: fromMatch[2]?.trim() || fromHeader,
    fromName: fromMatch[1]?.replace(/"/g, '').trim() || fromMatch[2]?.trim() || fromHeader,
    to: toMatch[2]?.trim() || toHeader,
    toName: toMatch[1]?.replace(/"/g, '').trim() || toMatch[2]?.trim() || toHeader,
    subject,
    body: body || bodyPlain || msg.snippet || '',
    bodyPlain,
    date,
    isRead: !labelIds.includes('UNREAD'),
    isStarred: labelIds.includes('STARRED'),
    labels: labelIds,
    snippet: msg.snippet || (body || bodyPlain || '').substring(0, 100),
    hasAttachments: msg.payload?.parts?.some((p: any) => p.filename && p.filename.length > 0) || false,
  };
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useComposio(): UseComposioReturn {
  const { user, session: authSession } = useAuth();
  const { toast } = useToast();
  const { setComposioConfigured } = useApp();

  const [status, setStatus] = useState<ComposioStatus>({
    emailConnected: false,
    calendarConnected: false,
    meetConnected: false,
    connectedEmail: null,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = status.emailConnected;

  // Update app context when status changes
  useEffect(() => {
    setComposioConfigured(status.emailConnected);
  }, [status.emailConnected, setComposioConfigured]);

  // ============================================
  // CONNECTION MANAGEMENT
  // ============================================

  const checkStatus = useCallback(async () => {
    if (!user) return;

    try {
      const response = await supabase.functions.invoke('composio-connect', {
        body: { action: 'status' },
      });

      if (response.error) {
        console.error('Status check error:', response.error);
        return;
      }

      setStatus({
        emailConnected: response.data?.email_connected === true,
        calendarConnected: response.data?.calendar_connected === true,
        meetConnected: response.data?.meet_connected === true,
        connectedEmail: response.data?.connected_email || null,
        emailTriggerEnabled: response.data?.email_trigger_enabled === true,
      });
    } catch (err) {
      console.error('Error checking status:', err);
    }
  }, [user]);

  // Check status on mount
  useEffect(() => {
    if (user) {
      checkStatus();
    }
  }, [user, checkStatus]);

  const connect = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);

    try {
      // First disconnect any failed connections
      await supabase.functions.invoke('composio-connect', {
        body: { action: 'disconnect', type: 'gmail' },
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await supabase.functions.invoke('composio-connect', {
        body: { action: 'connect', type: 'gmail' },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to connect');
      }

      if (response.data?.already_connected) {
        setStatus(prev => ({ ...prev, emailConnected: true }));
        toast({ title: 'Gmail already connected', description: 'Your email is ready to use.' });
        return;
      }

      if (response.data?.redirectUrl) {
        window.location.href = response.data.redirectUrl;
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      setError(message);
      toast({ title: 'Connection failed', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const disconnect = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('composio-connect', {
        body: { action: 'disconnect', type: 'gmail' },
      });

      if (response.error) {
        throw response.error;
      }

      setStatus(prev => ({ ...prev, emailConnected: false, connectedEmail: null }));
      toast({ title: 'Gmail disconnected' });
    } catch (err) {
      toast({ title: 'Disconnect failed', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const refreshConnection = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('composio-connect', {
        body: { action: 'force_reconnect' },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to refresh');
      }

      if (response.data?.redirectUrl) {
        setStatus(prev => ({ ...prev, emailConnected: false, connectedEmail: null }));
        toast({ title: 'Reconnecting...', description: "You'll be redirected to re-authorize Gmail" });
        window.location.href = response.data.redirectUrl;
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Refresh failed';
      toast({ title: 'Refresh failed', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  const testConnection = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('composio-connect', {
        body: { action: 'test_send' },
      });

      if (response.error) {
        console.error('Test send error:', response.error);
        return false;
      }

      if (response.data?.needs_reconnect) {
        toast({
          title: 'Connection Issue',
          description: 'Your Gmail connection needs to be refreshed.',
          variant: 'destructive',
        });
        return false;
      }

      if (response.data?.success) {
        toast({
          title: 'Gmail Working!',
          description: response.data.message || 'Test email sent successfully.',
        });
        return true;
      }

      return false;
    } catch (err) {
      console.error('Test connection error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, toast]);

  // ============================================
  // EMAIL OPERATIONS
  // ============================================

  const fetchEmails = useCallback(async (options: FetchEmailsOptions = {}): Promise<Email[]> => {
    if (!user || !isConfigured) return [];
    setIsLoading(true);
    setError(null);

    try {
      // Use check-inbox function with return_emails flag to get raw Gmail data
      const response = await supabase.functions.invoke('check-inbox', {
        body: {
          user_id: user.id,
          max_results: options.maxResults || 50,
          query: options.query,
          return_emails: true, // Request raw emails for UI display
          manual: true, // This is a manual check from frontend
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch emails');
      }

      // The check-inbox function now returns raw Gmail data in messages array
      console.log('[useComposio] Full response:', JSON.stringify(response.data).substring(0, 500));
      const messages = response.data?.messages || [];
      console.log(`[useComposio] Fetched ${messages.length} emails from check-inbox`);
      if (messages.length === 0) {
        console.log('[useComposio] No emails returned. Check if Gmail is connected and check-inbox is working.');
        console.log('[useComposio] Results from server:', response.data?.results);
      }
      return messages.map(parseGmailMessage);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch emails';
      setError(message);
      console.error('Fetch emails error:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured]);

  const getEmail = useCallback(async (messageId: string): Promise<Email | null> => {
    if (!user || !isConfigured || !authSession?.access_token) return null;
    setIsLoading(true);

    try {
      // Call Composio directly for single message fetch
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'email.view',
            params: { messageId },
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch email');
      }

      const data = await response.json();
      if (data.email) {
        return parseGmailMessage(data.email);
      }
      return null;
    } catch (err) {
      console.error('Get email error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured, authSession?.access_token]);

  const getThread = useCallback(async (threadId: string): Promise<EmailThread | null> => {
    if (!user || !isConfigured) return null;
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('sync-gmail-thread', {
        body: { thread_id: threadId },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to fetch thread');
      }

      const threadData = response.data?.thread;
      if (!threadData) return null;

      const messages = (threadData.messages || []).map(parseGmailMessage);

      return {
        id: threadData.id,
        subject: messages[0]?.subject || '(No subject)',
        participants: [...new Set(messages.flatMap(m => [m.from, m.to]))],
        messages,
        lastMessageDate: messages[messages.length - 1]?.date || new Date(),
        isRead: messages.every(m => m.isRead),
        isStarred: messages.some(m => m.isStarred),
        snippet: messages[messages.length - 1]?.snippet,
        messageCount: messages.length,
      };
    } catch (err) {
      console.error('Get thread error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured]);

  const sendEmail = useCallback(async (to: string, subject: string, body: string): Promise<boolean> => {
    if (!user || !isConfigured) return false;
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('send-outreach', {
        body: {
          to,
          subject,
          body,
          type: 'manual',
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to send email');
      }

      if (response.data?.success) {
        // Log debug info for troubleshooting
        const debug = response.data.debug;
        if (debug) {
          console.log('[Manual Email] Debug info:', debug);
          if (debug.lead_creation_error) {
            console.warn('[Manual Email] Lead creation failed:', debug.lead_creation_error);
          }
        }

        const leadInfo = response.data.lead_id
          ? ` (Lead: ${response.data.lead_email || 'created'})`
          : ' (No lead created)';

        toast({
          title: 'Email sent',
          description: `Email sent to ${to}${response.data.thread_id ? '' : ' - thread ID not captured'}`,
        });
        return true;
      }

      throw new Error(response.data?.error || 'Failed to send email');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send email';
      toast({ title: 'Send failed', description: message, variant: 'destructive' });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured, toast]);

  const replyToThread = useCallback(async (threadId: string, body: string): Promise<boolean> => {
    if (!user || !isConfigured || !authSession?.access_token) return false;
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'email.reply',
            params: { threadId, body },
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to reply');
      }

      const data = await response.json();
      if (data.success) {
        toast({ title: 'Reply sent' });
        return true;
      }

      return false;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reply';
      toast({ title: 'Reply failed', description: message, variant: 'destructive' });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured, authSession?.access_token, toast]);

  const deleteEmail = useCallback(async (messageId: string): Promise<boolean> => {
    if (!user || !isConfigured || !authSession?.access_token) return false;
    setIsLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'email.delete',
            params: { messageId },
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to delete');
      }

      toast({ title: 'Email deleted' });
      return true;
    } catch (err) {
      toast({ title: 'Delete failed', variant: 'destructive' });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user, isConfigured, authSession?.access_token, toast]);

  const starEmail = useCallback(async (messageId: string, starred: boolean): Promise<boolean> => {
    if (!user || !isConfigured || !authSession?.access_token) return false;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'email.star',
            params: { messageId, starred },
          }),
        }
      );

      return response.ok;
    } catch (err) {
      console.error('Star email error:', err);
      return false;
    }
  }, [user, isConfigured, authSession?.access_token]);

  const archiveEmail = useCallback(async (messageId: string): Promise<boolean> => {
    if (!user || !isConfigured || !authSession?.access_token) return false;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'email.archive',
            params: { messageId },
          }),
        }
      );

      if (response.ok) {
        toast({ title: 'Email archived' });
        return true;
      }
      return false;
    } catch (err) {
      console.error('Archive email error:', err);
      return false;
    }
  }, [user, isConfigured, authSession?.access_token, toast]);

  const markAsRead = useCallback(async (messageId: string, read: boolean): Promise<boolean> => {
    if (!user || !isConfigured || !authSession?.access_token) return false;

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/capy-chat`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'email.markRead',
            params: { messageId, read },
          }),
        }
      );

      return response.ok;
    } catch (err) {
      console.error('Mark as read error:', err);
      return false;
    }
  }, [user, isConfigured, authSession?.access_token]);

  return {
    status,
    isLoading,
    isConfigured,
    checkStatus,
    connect,
    disconnect,
    refreshConnection,
    testConnection,
    fetchEmails,
    getEmail,
    getThread,
    sendEmail,
    replyToThread,
    deleteEmail,
    starEmail,
    archiveEmail,
    markAsRead,
    error,
  };
}

export default useComposio;
