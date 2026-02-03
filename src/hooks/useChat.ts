/**
 * useChat Hook - Central chat session management with SSE streaming
 *
 * Handles:
 * - Session management with persistence
 * - Real-time message subscriptions
 * - SSE streaming for live status updates
 * - Message sending and action execution
 * - Context preservation across messages
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

// ============================================
// TYPES
// ============================================

export interface Artifact {
  type: string;
  id: string;
  data: Record<string, any>;
}

export interface ChatAction {
  label: string;
  action: string;
  params?: Record<string, any>;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  messageType: string;
  intent?: {
    action: string;
    confidence: number;
  };
  artifacts: Artifact[];
  actions: ChatAction[];
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface ChatSession {
  id: string;
  title: string;
  state: string;
  context: Record<string, any>;
  memory: Record<string, any>;
  currentLeadId: string | null;
  currentConversationId: string | null;
  lastIntent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// SSE Status types
export type StatusType = 
  | 'thinking' 
  | 'extracting' 
  | 'resolving' 
  | 'executing' 
  | 'sourcing' 
  | 'drafting' 
  | 'sending' 
  | 'retrying' 
  | 'saving' 
  | 'complete' 
  | 'error';

export interface StatusUpdate {
  type: StatusType;
  message: string;
  timestamp: number;
  metadata?: {
    state?: string;
    progress?: number;
    action?: string;
    retryReason?: string;
  };
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  isConnecting: boolean;
  session: ChatSession | null;
  sessions: ChatSession[];
  context: Record<string, any>;
  currentStatus: StatusUpdate | null;
  sendMessage: (content: string) => Promise<void>;
  executeAction: (action: string, params?: Record<string, any>) => Promise<void>;
  clearSession: () => void;
  switchSession: (sessionId: string) => Promise<void>;
  refreshMessages: () => Promise<void>;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useChat(): UseChatReturn {
  const { user, session: authSession } = useAuth();
  const { toast } = useToast();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(true);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [context, setContext] = useState<Record<string, any>>({});
  const [currentStatus, setCurrentStatus] = useState<StatusUpdate | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isInitializedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isAgentWorkingRef = useRef(false);

  // ============================================
  // SESSION INITIALIZATION
  // ============================================

  const initializeSession = useCallback(async () => {
    if (!user) {
      isInitializedRef.current = false;
      sessionIdRef.current = null;
      setIsConnecting(false);
      return;
    }

    // CRITICAL FIX: Don't re-initialize if already initialized
    // This prevents "Connecting to Capy" from showing on every tab switch
    // AND prevents React StrictMode double-initialization
    if (isInitializedRef.current) {
      console.log('[useChat] Session already initialized, skipping re-init');
      return;
    }

    // CRITICAL: Set flag IMMEDIATELY before any async work
    // This prevents StrictMode double-calls from both running async operations
    isInitializedRef.current = true;

    setIsConnecting(true);
    console.log('[useChat] Initializing session for user:', user.id);

    try {
      const { data: existingSession, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sessionError) {
        console.error('[useChat] Error fetching session:', sessionError);
        throw sessionError;
      }

      let session: ChatSession;

      if (!existingSession) {
        console.log('[useChat] Creating new session...');
        const { data: newSession, error: createError } = await supabase
          .from('chat_sessions')
          .insert({
            user_id: user.id,
            title: 'New Chat',
            state: 'idle',
            context: {},
            memory: {},
          })
          .select()
          .single();

        if (createError) throw createError;
        session = transformSession(newSession);
      } else {
        console.log('[useChat] Found existing session:', existingSession.id);
        session = transformSession(existingSession);
      }

      setChatSession(session);
      setContext(session.context || {});
      sessionIdRef.current = session.id;

      // CRITICAL: Always load messages from database
      // Load most recent 100 messages (descending order), then reverse for display
      console.log('[useChat] Loading messages for session:', session.id);
      const { data: existingMessages, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false }) // Get newest first
        .limit(100);

      if (messagesError) {
        console.error('[useChat] Error loading messages:', messagesError);
        // Don't throw - show welcome message instead
      }

      if (existingMessages && existingMessages.length > 0) {
        console.log(`[useChat] Loaded ${existingMessages.length} messages from database`);
        // Reverse to show oldest to newest in UI
        setMessages(existingMessages.reverse().map(transformMessage));
      } else {
        console.log('[useChat] No existing messages, showing welcome');
        const welcomeMessage: ChatMessage = {
          id: 'welcome',
          sessionId: session.id,
          role: 'assistant',
          content: "Hey! I'm Capy, your AI outreach assistant. I can help you find leads, write personalized emails, and manage campaigns. What would you like to do?",
          messageType: 'text',
          artifacts: [],
          actions: [
            { label: 'Find Leads', action: 'leads.discover' },
            { label: 'Show Dashboard', action: 'analytics.dashboard' },
            { label: 'Check Agent Status', action: 'agent.status' },
          ],
          metadata: {},
          createdAt: new Date(),
        };
        setMessages([welcomeMessage]);
      }

      // Load all sessions
      const { data: allSessions } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(20);

      if (allSessions) {
        setSessions(allSessions.map(transformSession));
      }

      console.log('[useChat] Session initialization complete');

    } catch (error) {
      console.error('[useChat] Session initialization error:', error);
      // Reset flag on failure so user can retry
      isInitializedRef.current = false;
      toast({
        title: 'Connection Error',
        description: 'Failed to initialize chat session. Please refresh the page.',
        variant: 'destructive',
      });
    } finally {
      setIsConnecting(false);
    }
  }, [user]); // Removed toast from dependencies - it's stable from useToast

  // ============================================
  // MESSAGE LOADING
  // ============================================

  const loadMessages = useCallback(async (sessionId: string) => {
    console.log('[useChat] Loading messages for session:', sessionId);
    const { data: messagesData, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false }) // Get newest first
      .limit(100);

    if (error) {
      console.error('[useChat] Error loading messages:', error);
      return;
    }

    if (messagesData && messagesData.length > 0) {
      console.log(`[useChat] Loaded ${messagesData.length} messages (most recent 100)`);
      // Reverse to show oldest to newest in UI
      setMessages(messagesData.reverse().map(transformMessage));
    } else {
      console.log('[useChat] No messages found for this session');
    }
  }, []);

  const refreshMessages = useCallback(async () => {
    if (sessionIdRef.current) {
      console.log('[useChat] Refreshing messages...');
      await loadMessages(sessionIdRef.current);
    }
  }, [loadMessages]);

  // ============================================
  // REAL-TIME SUBSCRIPTION
  // ============================================

  useEffect(() => {
    if (!chatSession?.id) return;

    const channel = supabase
      .channel(`chat_messages:${chatSession.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `session_id=eq.${chatSession.id}`,
        },
        (payload) => {
          const newMessage = transformMessage(payload.new as any);
          setMessages((prev) => {
            // Check for any message with same ID (strict dedup)
            const existingById = prev.find((m) => m.id === newMessage.id);
            if (existingById) {
              // Message already exists, skip
              return prev;
            }
            
            // Check for temp user message to replace (optimistic update)
            const tempUserMatch = prev.find((m) => 
              m.role === 'user' && 
              newMessage.role === 'user' && 
              m.content === newMessage.content && 
              m.id.startsWith('temp_')
            );
            if (tempUserMatch) {
              // Replace temp message with real one
              return prev.map((m) => 
                m.id === tempUserMatch.id ? newMessage : m
              );
            }
            
            // Check for recent duplicate content (within 10 seconds)
            const recentDup = prev.find((m) =>
              m.role === newMessage.role &&
              m.content === newMessage.content &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(newMessage.createdAt).getTime()) < 10000
            );
            if (recentDup) {
              return prev;
            }
            
            return [...prev, newMessage];
          });
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [chatSession?.id]);

  useEffect(() => {
    initializeSession();
  }, [initializeSession]);

  // Reset initialization flag when user changes (logout/login)
  useEffect(() => {
    if (!user) {
      console.log('[useChat] User logged out, resetting session');
      isInitializedRef.current = false;
      sessionIdRef.current = null;
      setChatSession(null);
      setMessages([]);
      setIsConnecting(false);
    }
  }, [user?.id]);

  // Force refresh messages when page becomes visible (tab switching, returning to app)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionIdRef.current) {
        console.log('[useChat] Page visible, refreshing messages...');
        loadMessages(sessionIdRef.current);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadMessages]);

  // Periodic refresh of messages to ensure persistence (every 30 seconds)
  useEffect(() => {
    if (!sessionIdRef.current) return;

    const interval = setInterval(() => {
      if (sessionIdRef.current && !isLoading) {
        console.log('[useChat] Periodic refresh of messages...');
        loadMessages(sessionIdRef.current);
      }
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [isLoading, loadMessages]);

  // ============================================
  // AGENT STATE MONITORING - Show progress while agent works
  // ============================================

  useEffect(() => {
    if (!user) return;

    let agentChannel: ReturnType<typeof supabase.channel> | null = null;
    let queueCheckInterval: NodeJS.Timeout | null = null;

    const setupAgentMonitoring = async () => {
      // Subscribe to agent state changes
      agentChannel = supabase
        .channel(`agent-state-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'capy_agent_state',
            filter: `user_id=eq.${user.id}`,
          },
          async (payload) => {
            const agentState = payload.new as any;

            if (!agentState) return;

            const isWorking = agentState.enabled &&
                            agentState.state !== 'idle' &&
                            agentState.state !== 'cooldown' &&
                            agentState.state !== 'paused';

            isAgentWorkingRef.current = isWorking;

            // Update status based on agent state
            if (isWorking) {
              const stateMessages: Record<string, string> = {
                'enriching': '🔍 Finding email addresses...',
                'generating': '✍️ Writing personalized emails...',
                'sending': '📧 Sending emails...',
                'searching': '🔎 Finding more prospects...',
              };

              const message = stateMessages[agentState.state] || `🤖 Agent working: ${agentState.state}...`;

              setCurrentStatus({
                type: 'sending',
                message,
                timestamp: Date.now(),
                metadata: { state: agentState.state },
              });

              // Check queue to show detailed progress
              const { data: queueData } = await supabase
                .from('capy_agent_queue')
                .select('status')
                .eq('user_id', user.id);

              if (queueData) {
                const counts = queueData.reduce((acc, item) => {
                  acc[item.status] = (acc[item.status] || 0) + 1;
                  return acc;
                }, {} as Record<string, number>);

                const sent = counts['sent'] || 0;
                const ready = counts['ready'] || 0;
                const processing = counts['processing'] || 0;
                const total = queueData.length;

                if (sent > 0 && total > 0) {
                  setCurrentStatus({
                    type: 'sending',
                    message: `📧 Sent ${sent}/${total} emails... ${ready + processing} in queue`,
                    timestamp: Date.now(),
                    metadata: { state: agentState.state, progress: (sent / total) * 100 },
                  });
                }
              }
            } else {
              // Agent stopped or idle - clear status
              if (!isLoading) {
                setCurrentStatus(null);
              }
            }
          }
        )
        .subscribe();

      // Poll queue status while agent is working (every 5 seconds)
      queueCheckInterval = setInterval(async () => {
        const { data: agentState } = await supabase
          .from('capy_agent_state')
          .select('enabled, state')
          .eq('user_id', user.id)
          .single();

        if (!agentState?.enabled || agentState.state === 'idle' || agentState.state === 'cooldown') {
          return;
        }

        // Agent is working, fetch queue progress
        const { data: queueData } = await supabase
          .from('capy_agent_queue')
          .select('status')
          .eq('user_id', user.id);

        if (queueData && queueData.length > 0) {
          const counts = queueData.reduce((acc, item) => {
            acc[item.status] = (acc[item.status] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);

          const sent = counts['sent'] || 0;
          const total = queueData.length;

          if (sent > 0) {
            setCurrentStatus({
              type: 'sending',
              message: `📧 Autonomous agent: ${sent}/${total} emails sent`,
              timestamp: Date.now(),
              metadata: { progress: (sent / total) * 100 },
            });
          }
        }
      }, 5000);
    };

    setupAgentMonitoring();

    return () => {
      if (agentChannel) {
        supabase.removeChannel(agentChannel);
      }
      if (queueCheckInterval) {
        clearInterval(queueCheckInterval);
      }
    };
  }, [user, isLoading]);

  // ============================================
  // SSE STREAMING MESSAGE SEND
  // ============================================

  const sendMessageWithSSE = useCallback(async (
    content: string,
    action?: string,
    params?: Record<string, any>
  ): Promise<void> => {
    if (!authSession?.access_token) return;

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setCurrentStatus({ type: 'thinking', message: 'Thinking...', timestamp: Date.now() });

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://lnfkmfjlbisdikwmjxdy.supabase.co'}/functions/v1/capy-chat?stream=true`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${authSession.access_token}`,
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            message: content || undefined,
            action: action || undefined,
            params: params || undefined,
            sessionId: sessionIdRef.current,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to send message');
      }

      // Check if we got SSE response
      const contentType = response.headers.get('Content-Type') || '';
      
      if (contentType.includes('text/event-stream')) {
        // Handle SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEventType = 'status'; // Track current event type

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEventType = line.slice(7).trim();
              continue;
            }

            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                // Handle status updates (event: status)
                if (currentEventType === 'status' && data.type && typeof data.message === 'string') {
                  setCurrentStatus({
                    type: data.type,
                    message: data.message,
                    timestamp: data.timestamp || Date.now(),
                    metadata: data.metadata,
                  });

                  // Detect agent trigger OR discovery in progress - keep monitoring status
                  if (
                    data.message.includes('autonomous') ||
                    data.message.includes('Starting autonomous') ||
                    data.message.includes('Searching') ||
                    data.message.includes('Importing') ||
                    data.message.includes('Finding') ||
                    data.message.includes('Discovering')
                  ) {
                    isAgentWorkingRef.current = true;
                  }
                }

                // Handle complete response (event: complete)
                if (currentEventType === 'complete' || data.content !== undefined) {
                  if (import.meta.env.DEV) {
                    console.log('[useChat] Received complete response:', {
                      eventType: currentEventType,
                      hasContent: !!data.content,
                      content: data.content?.substring(0, 100),
                    });
                  }
                  handleCompleteResponse(data);
                }
              } catch (parseError) {
                console.error('[useChat] Error parsing SSE data:', parseError);
              }

              // Reset event type after processing data
              currentEventType = 'message';
            }
          }
        }
      } else {
        // Fallback to regular JSON response
        const data = await response.json();
        handleCompleteResponse(data);
      }

    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return; // Request was cancelled
      }

      if (import.meta.env.DEV) console.error('[useChat] Error sending message:', error);

      // Show error status instead of clearing it
      setCurrentStatus({
        type: 'error',
        message: error instanceof Error ? `❌ ${error.message}` : '❌ Request failed. Please try again.',
        timestamp: Date.now(),
      });

      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(), // Use proper UUID
        sessionId: sessionIdRef.current || '',
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Sorry, something went wrong. Please try again.',
        messageType: 'error',
        artifacts: [],
        actions: [{ label: 'Try Again', action: 'followup.retry' }],
        metadata: {},
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);

      toast({
        title: 'Message Failed',
        description: error instanceof Error ? error.message : 'Failed to send message',
        variant: 'destructive',
      });

      // DON'T auto-clear status - error messages now persist in chat history
      // Status updates are saved to database and shown as message bubbles
    } finally {
      setIsLoading(false);
      // Don't clear status if agent is working - let agent state subscription handle it
      // Status is either preserved (agent working) or showing error (will auto-clear)
      abortControllerRef.current = null;
    }
  }, [authSession?.access_token, toast]);

  const handleCompleteResponse = useCallback(async (data: any) => {
    if (data.context) {
      setContext(data.context);
    }

    if (data.content) {
      const assistantMessageId = data.messageId || crypto.randomUUID(); // Use proper UUID

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        sessionId: sessionIdRef.current || '',
        role: 'assistant',
        content: data.content,
        messageType: data.artifacts?.length > 0 ? 'artifact' : 'text',
        intent: data.intent,
        artifacts: data.artifacts || [],
        actions: data.actions || [],
        metadata: {},
        createdAt: new Date(),
      };

      // CRITICAL FIX: Save assistant message to database for persistence
      // Check if message already exists first (backend might have saved it)
      const { data: existingMessage } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('id', assistantMessageId)
        .maybeSingle();

      if (!existingMessage) {
        const { error: saveError } = await supabase
          .from('chat_messages')
          .insert({
            id: assistantMessageId,
            session_id: sessionIdRef.current,
            role: 'assistant',
            content: data.content,
            message_type: data.artifacts?.length > 0 ? 'artifact' : 'text',
            intent: data.intent,
            artifacts: data.artifacts || [],
            actions: data.actions || [],
            metadata: {},
          });

        if (saveError) {
          console.error('[useChat] Error saving assistant message:', saveError);
          // Don't block UI, just log the error
        } else {
          console.log('[useChat] Assistant message saved to database:', assistantMessageId);
        }
      }

      setMessages((prev) => {
        // Strict ID check first
        if (prev.some((m) => m.id === assistantMessage.id)) {
          return prev;
        }

        // Check for duplicate content within recent time window
        const recentDup = prev.find(
          (m) => m.role === 'assistant' &&
                 m.content === assistantMessage.content &&
                 Date.now() - new Date(m.createdAt).getTime() < 10000
        );

        if (recentDup) {
          return prev;
        }

        return [...prev, assistantMessage];
      });
    } else if (!data.success) {
      // Error response without content
      const errorMessage: ChatMessage = {
        id: `error_${Date.now()}`,
        sessionId: sessionIdRef.current || '',
        role: 'assistant',
        content: data.error || 'Something went wrong. Please try again.',
        messageType: 'error',
        artifacts: [],
        actions: [{ label: 'Try Again', action: 'followup.retry' }],
        metadata: {},
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } else if (import.meta.env.DEV) {
      console.warn('[useChat] Complete response has no content:', data);
    }
  }, []);

  // ============================================
  // MESSAGE SENDING
  // ============================================

  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading || !authSession?.access_token) return;

    const trimmedContent = content.trim();
    console.log('[useChat] Sending message:', trimmedContent);

    // Generate ID for the message
    const userMessageId = crypto.randomUUID();

    // CRITICAL FIX: Add to UI FIRST (optimistically), THEN save to database
    // This prevents duplicate messages from race condition between:
    // 1. Optimistic UI update
    // 2. Real-time subscription INSERT event
    // By adding to UI first, the subscription will see it exists and skip.
    const userMessage: ChatMessage = {
      id: userMessageId,
      sessionId: sessionIdRef.current || '',
      role: 'user',
      content: trimmedContent,
      messageType: 'text',
      artifacts: [],
      actions: [],
      metadata: {},
      createdAt: new Date(),
    };

    // Add optimistically to UI FIRST
    setMessages((prev) => {
      // Check if already exists (safety check)
      if (prev.some(m => m.id === userMessageId)) {
        return prev;
      }
      return [...prev, userMessage];
    });

    // Now save to database (real-time subscription will see it already exists)
    const userMessageData = {
      id: userMessageId,
      session_id: sessionIdRef.current,
      role: 'user',
      content: trimmedContent,
      message_type: 'text',
      artifacts: [],
      actions: [],
      metadata: {},
    };

    const { error: saveError } = await supabase
      .from('chat_messages')
      .insert(userMessageData);

    if (saveError) {
      console.error('[useChat] Error saving user message:', saveError);
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter(m => m.id !== userMessageId));
      toast({
        title: 'Message Failed',
        description: 'Could not save message. Please try again.',
        variant: 'destructive',
      });
      return;
    }

    console.log('[useChat] User message saved to database:', userMessageId);

    try {
      // Use SSE streaming to get assistant response
      await sendMessageWithSSE(trimmedContent);
      console.log('[useChat] Message sent successfully');
    } catch (error) {
      console.error('[useChat] Error sending message:', error);

      // User message is already saved, just show error for assistant response
      toast({
        title: 'Response Failed',
        description: 'Your message was saved but the response failed. Try asking again.',
        variant: 'destructive',
      });
    }
  }, [isLoading, authSession?.access_token, sendMessageWithSSE]);

  // ============================================
  // ACTION EXECUTION
  // ============================================

  const executeAction = useCallback(async (action: string, params?: Record<string, any>) => {
    if (isLoading || !authSession?.access_token) return;

    // Use SSE streaming for actions too
    await sendMessageWithSSE('', action, params);
  }, [isLoading, authSession?.access_token, sendMessageWithSSE]);

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  const clearSession = useCallback(() => {
    setMessages([]);
    setContext({});
    setCurrentStatus(null);

    if (user) {
      supabase
        .from('chat_sessions')
        .insert({
          user_id: user.id,
          title: 'New Chat',
          state: 'idle',
          context: {},
          memory: {},
        })
        .select()
        .single()
        .then(({ data }) => {
          if (data) {
            setChatSession(transformSession(data));
            sessionIdRef.current = data.id;

            const welcomeMessage: ChatMessage = {
              id: 'welcome',
              sessionId: data.id,
              role: 'assistant',
              content: "Fresh start! What would you like to do?",
              messageType: 'text',
              artifacts: [],
              actions: [
                { label: 'Find Leads', action: 'leads.discover' },
                { label: 'Show Dashboard', action: 'analytics.dashboard' },
              ],
              metadata: {},
              createdAt: new Date(),
            };
            setMessages([welcomeMessage]);
          }
        });
    }
  }, [user]);

  const switchSession = useCallback(async (sessionId: string) => {
    if (!user) return;

    try {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }

      const { data: sessionData, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .single();

      if (error || !sessionData) {
        toast({
          title: 'Error',
          description: 'Could not load chat session',
          variant: 'destructive',
        });
        return;
      }

      const session = transformSession(sessionData);
      setChatSession(session);
      setContext(session.context || {});
      sessionIdRef.current = session.id;
      setCurrentStatus(null);

      const { data: messagesData } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (messagesData && messagesData.length > 0) {
        setMessages(messagesData.map(transformMessage));
      } else {
        const welcomeMessage: ChatMessage = {
          id: 'welcome-' + sessionId,
          sessionId,
          role: 'assistant',
          content: "Continuing our chat. What would you like to do?",
          messageType: 'text',
          artifacts: [],
          actions: [
            { label: 'Find Leads', action: 'leads.discover' },
            { label: 'Dashboard', action: 'analytics.dashboard' },
          ],
          metadata: {},
          createdAt: new Date(),
        };
        setMessages([welcomeMessage]);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[useChat] Error switching session:', err);
    }
  }, [user, toast]);

  // ============================================
  // HELPERS
  // ============================================

  function transformSession(data: any): ChatSession {
    return {
      id: data.id,
      title: data.title || 'Chat',
      state: data.state || 'idle',
      context: data.context || {},
      memory: data.memory || {},
      currentLeadId: data.current_lead_id,
      currentConversationId: data.current_conversation_id,
      lastIntent: data.last_intent,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }

  function transformMessage(data: any): ChatMessage {
    return {
      id: data.id,
      sessionId: data.session_id,
      role: data.role,
      content: data.content,
      messageType: data.message_type || 'text',
      intent: data.intent,
      artifacts: data.artifacts || [],
      actions: data.actions || [],
      metadata: data.metadata || {},
      createdAt: new Date(data.created_at),
    };
  }

  return {
    messages,
    isLoading,
    isConnecting,
    session: chatSession,
    sessions,
    context,
    currentStatus,
    sendMessage,
    executeAction,
    clearSession,
    switchSession,
    refreshMessages,
  };
}
