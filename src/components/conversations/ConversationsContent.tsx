/**
 * ConversationsContent - Simplified email UI with cleaner design
 * Reduced visual noise, clearer layout
 * 
 * UI Updates:
 * - Floating FAB compose button (Gmail-style) for all screen sizes
 * - Search bar inline with filter tabs
 * - Prominent stats section
 * - Agent pause/run button moved lower
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useComposio, Email, EmailThread } from '@/hooks/useComposio';
import { useCapyConversations, CapyConversation, CapyMessage, FilterTab } from '@/hooks/useCapyConversations';
import { usePendingEmails } from '@/hooks/usePendingEmails';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { EmailList } from './EmailList';
import { EmailDetail } from './EmailDetail';
import { EmailCompose } from './EmailCompose';
import { SetupWizard } from './SetupWizard';
import { PendingEmailsQueue } from '@/components/pending/PendingEmailsQueue';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type ViewMode = 'list' | 'compose';

// Convert CapyMessage to Email format
function messageToEmail(msg: CapyMessage, lead: CapyConversation['lead']): Email {
  const isInbound = msg.direction === 'inbound';
  return {
    id: msg.id,
    threadId: msg.conversation_id,
    from: isInbound ? (msg.sender_email || lead.email) : 'you@example.com',
    fromName: isInbound ? (msg.sender_name || lead.name) : 'You',
    to: isInbound ? 'you@example.com' : lead.email,
    toName: isInbound ? 'You' : lead.name,
    subject: msg.subject || '',
    body: msg.content,
    bodyPlain: msg.content,
    date: new Date(msg.sent_at),
    isRead: true,
    isStarred: false,
    labels: isInbound ? ['INBOX'] : ['SENT'],
    snippet: msg.content.substring(0, 100),
    hasAttachments: false,
  };
}

// Convert CapyConversation to Email format
function conversationToEmail(conv: CapyConversation): Email {
  const latestMsg = conv.latestMessage;
  const isInbound = latestMsg?.direction === 'inbound';

  return {
    id: conv.id,
    threadId: conv.id,
    from: isInbound ? (conv.lead?.email || '') : 'you@example.com',
    fromName: isInbound ? (conv.lead?.name || 'Unknown') : 'You',
    to: isInbound ? 'you@example.com' : (conv.lead?.email || ''),
    toName: isInbound ? 'You' : (conv.lead?.name || 'Unknown'),
    subject: conv.subject || `Conversation with ${conv.lead?.name || 'Unknown'}`,
    body: latestMsg?.content || '',
    bodyPlain: latestMsg?.content || '',
    date: new Date(conv.last_message_at),
    isRead: conv.is_read,
    isStarred: conv.is_starred,
    labels: isInbound ? ['INBOX'] : ['SENT'],
    snippet: latestMsg?.content?.substring(0, 100) || '',
    hasAttachments: false,
  };
}

interface ConversationsContentProps {
  showHeader?: boolean;
}

export function ConversationsContent({ showHeader = true }: ConversationsContentProps) {
  const { status, isConfigured } = useComposio();
  const {
    conversations,
    loading,
    filter,
    setFilter,
    fetchConversations,
    checkForNewEmails,
    markAsRead,
    toggleStar,
    getConversationMessages,
    searchConversations,
  } = useCapyConversations();

  const { pendingEmails, pendingCount } = usePendingEmails();
  const { selectedItem, setSelectedItem, searchState, setSearchState } = useApp();

  const [showPending, setShowPending] = useState(false);
  const [selectedConversation, setSelectedConversation] = useState<CapyConversation | null>(null);
  const [selectedMessages, setSelectedMessages] = useState<CapyMessage[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [replyTo, setReplyTo] = useState<Email | undefined>(undefined);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Handle search from chat
  useEffect(() => {
    if (searchState?.panel === 'conversations' && searchState.query) {
      setSearchQuery(searchState.query);
      setSearchState(null);
    }
  }, [searchState, setSearchState]);

  // Convert conversations to Email format
  const emails = useMemo(() => {
    if (searchQuery) {
      return searchConversations(searchQuery).map(conversationToEmail);
    }
    return conversations.map(conversationToEmail);
  }, [conversations, searchQuery, searchConversations]);

  // Build thread from selected conversation
  const selectedThread: EmailThread | null = useMemo(() => {
    if (!selectedConversation || selectedMessages.length === 0) return null;

    return {
      id: selectedConversation.id,
      subject: selectedConversation.subject || `Conversation with ${selectedConversation.lead?.name || 'Unknown'}`,
      participants: [selectedConversation.lead?.email || '', 'you@example.com'].filter(Boolean),
      messages: selectedMessages.map(msg => messageToEmail(msg, selectedConversation.lead)),
      lastMessageDate: new Date(selectedConversation.last_message_at),
      isRead: selectedConversation.is_read,
      isStarred: selectedConversation.is_starred,
      snippet: selectedConversation.latestMessage?.content?.substring(0, 100) || '',
      messageCount: selectedMessages.length,
    };
  }, [selectedConversation, selectedMessages]);

  const handleSelectEmail = async (email: Email) => {
    const conv = conversations.find(c => c.id === email.id);
    if (!conv) return;

    setSelectedItem({
      type: 'email',
      id: conv.id,
      data: {
        subject: conv.subject,
        from: conv.lead?.name || conv.lead?.email,
        snippet: conv.latestMessage?.content?.substring(0, 100),
      },
    });

    if (!conv.is_read) await markAsRead(conv.id);

    const messages = await getConversationMessages(conv.id);
    setSelectedMessages(messages);
    setSelectedConversation(conv);
    setViewMode('list');
  };

  const handleStar = async (email: Email) => {
    await toggleStar(email.id);
    if (selectedConversation?.id === email.id) {
      setSelectedConversation(prev => prev ? { ...prev, is_starred: !prev.is_starred } : null);
    }
  };

  const handleClose = () => {
    setSelectedConversation(null);
    setSelectedMessages([]);
    setSelectedItem({ type: null, id: null, data: null });
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await checkForNewEmails();
    setIsRefreshing(false);
  };

  const handleCompose = () => {
    setReplyTo(undefined);
    setViewMode('compose');
    setSelectedConversation(null);
    setSelectedMessages([]);
  };

  const handleReply = () => {
    if (selectedThread && selectedThread.messages.length > 0) {
      setReplyTo(selectedThread.messages[selectedThread.messages.length - 1]);
      setViewMode('compose');
    }
  };

  const handleCloseCompose = () => {
    setViewMode('list');
    setReplyTo(undefined);
  };

  const handleEmailSent = () => {
    setViewMode('list');
    setReplyTo(undefined);
    fetchConversations();
  };

  const { user } = useAuth();
  
  // Agent running state
  const [isAgentRunning, setIsAgentRunning] = useState(true);
  
  // Fetch agent status
  useEffect(() => {
    if (user) {
      supabase
        .from('user_settings')
        .select('brok_active')
        .eq('user_id', user.id)
        .maybeSingle()
        .then(({ data }) => {
          if (data) setIsAgentRunning(data.brok_active ?? true);
        });
    }
  }, [user]);

  const toggleAgent = async () => {
    if (!user) return;
    const newState = !isAgentRunning;
    const { error } = await supabase
      .from('user_settings')
      .update({ brok_active: newState })
      .eq('user_id', user.id);
    
    if (!error) {
      setIsAgentRunning(newState);
      toast(newState ? 'Capy agent resumed' : 'Capy agent paused');
    }
  };

  // Calculate stats
  const stats = useMemo(() => {
    const responses = conversations.filter(c => 
      c.latestMessage?.direction === 'inbound'
    ).length;
    const total = conversations.length;
    const openRate = total > 0 ? Math.round((conversations.filter(c => c.is_read).length / total) * 100) : 0;
    const replyRate = total > 0 ? Math.round((responses / total) * 100) : 0;
    return { meetingsToday: 0, responses, openRate, replyRate };
  }, [conversations]);

  // Show setup wizard if not configured
  if (!isConfigured) return <SetupWizard />;

  // Filter tabs
  const tabs: { id: FilterTab | 'pending'; label: string; icon?: string; count?: number }[] = [
    { id: 'all', label: 'All' },
    { id: 'inbox', label: 'Inbox', icon: 'fa-inbox' },
    { id: 'sent', label: 'Sent', icon: 'fa-paper-plane' },
    { id: 'starred', label: 'Starred', icon: 'fa-star' },
    { id: 'pending', label: 'Pending', icon: 'fa-clock', count: pendingCount },
  ];

  return (
    <div className="flex flex-col h-full bg-background relative">
      {/* Header with title and connected email */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          {showHeader && <h2 className="text-lg font-semibold">Inbox</h2>}
          {status.connectedEmail && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-2 py-1 bg-muted/40 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {status.connectedEmail}
            </div>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={isRefreshing || loading}
          className="h-8 w-8"
        >
          <i className={cn('fa-solid fa-rotate-right text-xs', (isRefreshing || loading) && 'animate-spin')} />
        </Button>
      </div>

      {/* Filter tabs + Search (inline) */}
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => tab.id === 'pending' ? setShowPending(true) : (setShowPending(false), setFilter(tab.id as FilterTab))}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap',
                (showPending ? tab.id === 'pending' : filter === tab.id)
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              {tab.icon && <i className={cn('fa-solid mr-1.5', tab.icon)} />}
              {tab.label}
              {tab.count && tab.count > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
        
        {/* Search inline with tabs */}
        <div className="relative shrink-0">
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-36 sm:w-44 h-8 text-xs pl-8 bg-muted/30 border-transparent focus:border-border"
          />
          <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground" />
        </div>
      </div>

      {/* Main content - split view */}
      <div className="flex-1 flex overflow-hidden" data-tutorial="email-list">
        {showPending ? (
          <div className="flex-1 overflow-auto">
            <PendingEmailsQueue onClose={() => setShowPending(false)} />
          </div>
        ) : (
          <>
            {/* Email list */}
            <div className={cn(
              'border-r border-border/40 overflow-auto',
              (selectedThread || viewMode === 'compose') ? 'w-80 shrink-0 hidden md:block' : 'flex-1'
            )}>
              <EmailList
                emails={emails}
                selectedEmailId={selectedItem.type === 'email' ? selectedItem.id : null}
                onSelect={handleSelectEmail}
                onStar={handleStar}
                onArchive={handleClose}
                onDelete={handleClose}
                isLoading={loading && emails.length === 0}
              />
            </div>

            {/* Email detail or compose */}
            {viewMode === 'compose' ? (
              <div className="flex-1 overflow-hidden">
                <EmailCompose
                  onClose={handleCloseCompose}
                  replyTo={replyTo}
                  onSent={handleEmailSent}
                  inline
                />
              </div>
            ) : selectedThread ? (
              <div className="flex-1 overflow-auto">
                <EmailDetail
                  thread={selectedThread}
                  onClose={handleClose}
                  onReply={handleReply}
                  onStar={() => handleStar({ id: selectedConversation!.id } as Email)}
                  onArchive={handleClose}
                  onDelete={handleClose}
                />
              </div>
            ) : emails.length > 0 ? (
              <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <i className="fa-solid fa-envelope-open text-4xl mb-4 opacity-20" />
                  <p className="text-sm">Select a conversation</p>
                </div>
              </div>
            ) : !loading ? (
              <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <i className="fa-solid fa-inbox text-4xl mb-4 opacity-20" />
                  <p className="text-sm">No conversations yet</p>
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Floating Compose FAB - Gmail style (all screen sizes) */}
      <Button
        onClick={handleCompose}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg z-50 bg-primary hover:bg-primary/90"
      >
        <i className="fa-solid fa-pen-to-square text-lg" />
      </Button>
    </div>
  );
}

export default ConversationsContent;
