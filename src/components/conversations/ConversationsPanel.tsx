/**
 * ConversationsPanel - Email client UI with database-driven conversations
 *
 * Features:
 * - Gmail/Outlook-like split view
 * - Real-time updates via Supabase subscriptions
 * - Capy-related emails only (sent by Capy and replies)
 * - Quick compose floating button
 * - Setup wizard for unconfigured users
 * - Email search and filtering
 * - Star, archive, delete actions
 */

import { useState, useEffect, useMemo } from 'react';
import { useComposio, Email, EmailThread } from '@/hooks/useComposio';
import { useCapyConversations, CapyConversation, CapyMessage, FilterTab } from '@/hooks/useCapyConversations';
import { useApp } from '@/contexts/AppContext';
import { EmailList } from './EmailList';
import { EmailDetail } from './EmailDetail';
import { EmailCompose } from './EmailCompose';
import { SetupWizard } from './SetupWizard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type ViewMode = 'list' | 'compose';

// Convert CapyMessage to Email format for EmailList/EmailDetail components
function messageToEmail(msg: CapyMessage, lead: CapyConversation['lead']): Email {
  // Determine from/to based on direction
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

// Convert CapyConversation to Email format for the list view
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

export function ConversationsPanel() {
  // Use useComposio just for connection status
  const { status, isConfigured } = useComposio();

  // Use useCapyConversations for data
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

  const { selectedItem, setSelectedItem, searchState, setSearchState } = useApp();

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

  // Convert conversations to Email format for display
  const emails = useMemo(() => {
    if (searchQuery) {
      return searchConversations(searchQuery).map(conversationToEmail);
    }
    return conversations.map(conversationToEmail);
  }, [conversations, searchQuery, searchConversations]);

  // Build thread from selected conversation and messages
  const selectedThread: EmailThread | null = useMemo(() => {
    if (!selectedConversation || selectedMessages.length === 0) {
      return null;
    }

    const emailMessages = selectedMessages.map(msg =>
      messageToEmail(msg, selectedConversation.lead)
    );

    return {
      id: selectedConversation.id,
      subject: selectedConversation.subject || `Conversation with ${selectedConversation.lead?.name || 'Unknown'}`,
      participants: [
        selectedConversation.lead?.email || '',
        'you@example.com',
      ].filter(Boolean),
      messages: emailMessages,
      lastMessageDate: new Date(selectedConversation.last_message_at),
      isRead: selectedConversation.is_read,
      isStarred: selectedConversation.is_starred,
      snippet: selectedConversation.latestMessage?.content?.substring(0, 100) || '',
      messageCount: selectedMessages.length,
    };
  }, [selectedConversation, selectedMessages]);

  const handleSelectEmail = async (email: Email) => {
    // Find the conversation
    const conv = conversations.find(c => c.id === email.id);
    if (!conv) return;

    // Update app context for chat awareness
    setSelectedItem({
      type: 'email',
      id: conv.id,
      data: {
        subject: conv.subject,
        from: conv.lead?.name || conv.lead?.email,
        snippet: conv.latestMessage?.content?.substring(0, 100),
      },
    });

    // Mark as read
    if (!conv.is_read) {
      await markAsRead(conv.id);
    }

    // Load all messages for the thread
    const messages = await getConversationMessages(conv.id);
    setSelectedMessages(messages);
    setSelectedConversation(conv);
    setViewMode('list');
  };

  const handleStar = async (email: Email) => {
    await toggleStar(email.id);
    // Update selected conversation if it's the same
    if (selectedConversation?.id === email.id) {
      setSelectedConversation(prev =>
        prev ? { ...prev, is_starred: !prev.is_starred } : null
      );
    }
  };

  const handleArchive = async (_email: Email) => {
    // TODO: Implement archive functionality if needed
    // For now, just clear selection
    setSelectedConversation(null);
    setSelectedMessages([]);
    setSelectedItem({ type: null, id: null, data: null });
  };

  const handleDelete = async (_email: Email) => {
    // TODO: Implement delete functionality if needed
    // For now, just clear selection
    setSelectedConversation(null);
    setSelectedMessages([]);
    setSelectedItem({ type: null, id: null, data: null });
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    // Search is handled reactively via searchConversations
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Check Gmail for new emails and import them
    const result = await checkForNewEmails();
    if (result.processed > 0) {
      console.log(`[Refresh] Processed ${result.processed} new emails`);
    }
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
      const lastEmail = selectedThread.messages[selectedThread.messages.length - 1];
      setReplyTo(lastEmail);
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

  // Map FilterTab to internal filter type
  const handleFilterChange = (value: string) => {
    setFilter(value as FilterTab);
  };

  // Show setup wizard if not configured
  if (!isConfigured) {
    return <SetupWizard />;
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40 shrink-0 bg-card/30">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Conversations</h2>
          {status.connectedEmail && (
            <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground px-2 py-1 bg-muted/40 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              {status.connectedEmail}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <form onSubmit={handleSearch} className="relative">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-36 sm:w-44 h-8 text-xs pl-8 bg-muted/30 border-transparent focus:border-border focus:bg-background"
            />
            <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground" />
          </form>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing || loading}
            className="h-8 w-8"
          >
            <i className={cn(
              'fa-solid fa-rotate-right text-xs text-muted-foreground',
              (isRefreshing || loading) && 'animate-spin'
            )} />
          </Button>

          {/* Compose */}
          <Button
            onClick={handleCompose}
            size="sm"
            className="gap-1.5 h-8 text-xs px-3"
          >
            <i className="fa-solid fa-plus text-[10px]" />
            <span className="hidden sm:inline">Compose</span>
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-4 py-1.5 border-b border-border/40 shrink-0 bg-card/20">
        <Tabs value={filter} onValueChange={handleFilterChange}>
          <TabsList className="h-8 p-0.5 bg-muted/30">
            <TabsTrigger value="all" className="text-[11px] h-7 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              All
            </TabsTrigger>
            <TabsTrigger value="inbox" className="text-[11px] h-7 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <i className="fa-solid fa-inbox mr-1.5 text-[9px]" />
              Inbox
            </TabsTrigger>
            <TabsTrigger value="sent" className="text-[11px] h-7 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <i className="fa-solid fa-arrow-up mr-1.5 text-[9px]" />
              Sent
            </TabsTrigger>
            <TabsTrigger value="starred" className="text-[11px] h-7 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm">
              <i className="fa-solid fa-star mr-1.5 text-[9px]" />
              Starred
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Main content - split view */}
      <div className="flex-1 flex overflow-hidden">
        {/* Email list */}
        <div className={cn(
          'border-r border-border/40 overflow-auto bg-card/20',
          (selectedThread || viewMode === 'compose') ? 'w-[300px] shrink-0 hidden md:block' : 'flex-1'
        )}>
          <EmailList
            emails={emails}
            selectedEmailId={selectedItem.type === 'email' ? selectedItem.id : null}
            onSelect={handleSelectEmail}
            onStar={handleStar}
            onArchive={handleArchive}
            onDelete={handleDelete}
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
              onClose={() => {
                setSelectedConversation(null);
                setSelectedMessages([]);
                setSelectedItem({ type: null, id: null, data: null });
              }}
              onReply={handleReply}
              onStar={() => handleStar({ id: selectedConversation!.id } as Email)}
              onArchive={() => handleArchive({ id: selectedConversation!.id } as Email)}
              onDelete={() => handleDelete({ id: selectedConversation!.id } as Email)}
            />
          </div>
        ) : emails.length > 0 ? (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground bg-muted/10">
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-envelope-open text-2xl opacity-40" />
              </div>
              <p className="text-sm font-medium mb-1">Select a conversation</p>
              <p className="text-xs text-muted-foreground/80">
                Choose from the list on the left or compose a new message
              </p>
            </div>
          </div>
        ) : !loading ? (
          <div className="hidden md:flex flex-1 items-center justify-center text-muted-foreground bg-muted/10">
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                <i className="fa-solid fa-inbox text-2xl opacity-40" />
              </div>
              <p className="text-sm font-medium mb-1">No conversations yet</p>
              <p className="text-xs text-muted-foreground/80">
                Your email conversations with leads will appear here
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Floating compose button on mobile */}
      <Button
        onClick={handleCompose}
        className="fixed bottom-6 right-6 h-12 w-12 rounded-full shadow-lg md:hidden z-50"
      >
        <i className="fa-solid fa-plus text-base" />
      </Button>
    </div>
  );
}

export default ConversationsPanel;
