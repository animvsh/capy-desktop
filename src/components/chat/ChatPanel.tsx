/**
 * ChatPanel - Premium Chat UI
 *
 * Features:
 * - Real-time thinking/status indicators
 * - Polished message bubbles with animations
 * - Clean input area with focus states
 * - Quick action pills
 * - Beautiful empty state
 * - Mobile-friendly design
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChat, ChatMessage, ChatAction } from '@/hooks/useChat';
import { useChatAssistant } from '@/hooks/useChatAssistant';
import { useChatSettings } from '@/hooks/useChatSettings';
import { useApp } from '@/contexts/AppContext';
import { ArtifactRenderer } from '@/components/chat/ArtifactRenderer';
import { IntegrationsPanel } from '@/components/chat/IntegrationsPanel';
import { ChatSettingsToggle } from '@/components/chat/ChatSettingsToggle';
import { ActionConfirmDialog, PendingAction } from '@/components/chat/ActionConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import capyLogo from '@/assets/capy-logo.png';
import ReactMarkdown from 'react-markdown';
import './chat.css';

// Agent Components
import { AgentStatusBar, AgentStatusBadge } from '@/components/agent';
import { AgentTaskList } from '@/components/agent';
import { AgentThinking, AgentThinkingBadge } from '@/components/agent';
import { useAgentStore } from '@/stores/agentStore';
import { processStatusUpdate } from '@/hooks/useAgentEvents';

// ============================================
// LOADING SKELETON
// ============================================

function MessageSkeleton() {
  return (
    <div className="flex gap-3 chat-fade-up">
      <Skeleton className="w-8 h-8 rounded-full shrink-0" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ============================================
// TYPING ANIMATION HOOK
// ============================================

function useTypingAnimation(text: string, isEnabled: boolean, speed: number = 15) {
  const [displayedText, setDisplayedText] = useState('');
  const [isComplete, setIsComplete] = useState(!isEnabled);

  useEffect(() => {
    if (!isEnabled) {
      setDisplayedText(text);
      setIsComplete(true);
      return;
    }

    setDisplayedText('');
    setIsComplete(false);

    let currentIndex = 0;
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        const charsToAdd = Math.min(3, text.length - currentIndex);
        setDisplayedText(text.slice(0, currentIndex + charsToAdd));
        currentIndex += charsToAdd;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, isEnabled, speed]);

  return { displayedText, isComplete };
}

// ============================================
// THINKING INDICATOR - PREMIUM VERSION
// ============================================

interface ThinkingStatus {
  icon: string;
  label: string;
  description: string;
  color: string;
  bgColor: string;
}

// Map SSE status types to display info
const STATUS_TYPE_MAP: Record<string, ThinkingStatus> = {
  thinking: { icon: 'fa-brain', label: 'Thinking', description: 'Processing your request...', color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
  extracting: { icon: 'fa-magnifying-glass-plus', label: 'Extracting', description: 'Understanding your request...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  resolving: { icon: 'fa-link', label: 'Resolving', description: 'Finding relevant context...', color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  executing: { icon: 'fa-bolt', label: 'Executing', description: 'Running the action...', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
  sourcing: { icon: 'fa-magnifying-glass', label: 'Searching', description: 'Finding matching leads...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  drafting: { icon: 'fa-pen-fancy', label: 'Drafting', description: 'Writing your message...', color: 'text-pink-500', bgColor: 'bg-pink-500/10' },
  sending: { icon: 'fa-paper-plane', label: 'Sending', description: 'Delivering your message...', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  retrying: { icon: 'fa-rotate', label: 'Retrying', description: 'Trying again...', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  saving: { icon: 'fa-floppy-disk', label: 'Saving', description: 'Saving your data...', color: 'text-green-500', bgColor: 'bg-green-500/10' },
  complete: { icon: 'fa-check', label: 'Done', description: 'Completed!', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  error: { icon: 'fa-exclamation-triangle', label: 'Error', description: 'Something went wrong', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  // Job executor status types
  job_started: { icon: 'fa-rocket', label: 'Starting', description: 'Starting the search...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  step_started: { icon: 'fa-play-circle', label: 'Working', description: 'Processing step...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  step_progress: { icon: 'fa-spinner', label: 'Progress', description: 'Making progress...', color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  step_completed: { icon: 'fa-check-circle', label: 'Step Done', description: 'Step completed!', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  results_updated: { icon: 'fa-users', label: 'Found Leads', description: 'Found some results!', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  job_complete: { icon: 'fa-flag-checkered', label: 'Complete', description: 'All done!', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  // Brain event types
  think: { icon: 'fa-brain', label: 'Thinking', description: 'Analyzing...', color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
  act: { icon: 'fa-search', label: 'Searching', description: 'Looking for leads...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  observe: { icon: 'fa-eye', label: 'Found', description: 'Processing results...', color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  reflect: { icon: 'fa-lightbulb', label: 'Analyzing', description: 'Reviewing what we found...', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
};

interface ThinkingIndicatorProps {
  userMessage?: string;
  liveStatus?: {
    type: string;
    message: string;
    timestamp: number;
    metadata?: {
      state?: string;
      progress?: number;
      action?: string;
    };
  } | null;
}

function ThinkingIndicator({ userMessage, liveStatus }: ThinkingIndicatorProps) {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [statusIndex, setStatusIndex] = useState(0);
  const [personalityMessage, setPersonalityMessage] = useState('');

  // Add personality messages that change
  const personalityMessages: Record<string, string[]> = {
    searching: [
      "Hunting down the perfect matches...",
      "Scanning the database for gems...",
      "Finding people who fit your criteria...",
      "This is my favorite part! 🔍",
    ],
    drafting: [
      "Channeling my inner copywriter...",
      "Making every word count...",
      "Crafting something special...",
      "Almost there, this is going to be good! ✨",
    ],
    thinking: [
      "Let me think about this...",
      "Processing your request...",
      "Connecting the dots...",
      "Hmm, interesting question...",
    ],
  };

  const getStatuses = (msg: string): ThinkingStatus[] => {
    const lowerMsg = msg?.toLowerCase() || '';

    if (lowerMsg.includes('find') || lowerMsg.includes('discover') || lowerMsg.includes('search')) {
      return [
        { icon: 'fa-magnifying-glass', label: 'Searching', description: 'Looking for matching leads...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
        { icon: 'fa-database', label: 'Checking Sources', description: 'Apollo, Clado, and more...', color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
        { icon: 'fa-sparkles', label: 'Ranking', description: 'Finding the best matches...', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
      ];
    }
    if (lowerMsg.includes('email') || lowerMsg.includes('write') || lowerMsg.includes('draft')) {
      return [
        { icon: 'fa-brain', label: 'Analyzing', description: 'Understanding the context...', color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
        { icon: 'fa-wand-magic-sparkles', label: 'Crafting', description: 'Writing personalized copy...', color: 'text-pink-500', bgColor: 'bg-pink-500/10' },
        { icon: 'fa-pen-fancy', label: 'Polishing', description: 'Refining the message...', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
      ];
    }
    if (lowerMsg.includes('send')) {
      return [
        { icon: 'fa-shield-check', label: 'Validating', description: 'Checking email address...', color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
        { icon: 'fa-paper-plane', label: 'Sending', description: 'Delivering your message...', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
      ];
    }
    if (lowerMsg.includes('conversation') || lowerMsg.includes('inbox')) {
      return [
        { icon: 'fa-inbox', label: 'Loading', description: 'Fetching conversations...', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
        { icon: 'fa-layer-group', label: 'Organizing', description: 'Sorting by priority...', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
      ];
    }

    return [
      { icon: 'fa-brain', label: 'Thinking', description: 'Processing your request...', color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
    ];
  };

  // Use live status from SSE if available, otherwise fall back to inferred statuses
  const statuses = getStatuses(userMessage || '');
  const inferredStatus = statuses[statusIndex % statuses.length];
  
  // Prefer live status when available
  const displayStatus: ThinkingStatus = liveStatus 
    ? (STATUS_TYPE_MAP[liveStatus.type] || {
        icon: 'fa-circle-notch',
        label: liveStatus.type.charAt(0).toUpperCase() + liveStatus.type.slice(1),
        description: liveStatus.message,
        color: 'text-emerald-500',
        bgColor: 'bg-emerald-500/10',
      })
    : inferredStatus;
  
  // Override description with live message if available
  const description = liveStatus?.message || displayStatus.description;

  useEffect(() => {
    setElapsedTime(0);
    setStatusIndex(0);
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [userMessage]);

  // Cycle through statuses every 2.5 seconds (only when no live status)
  useEffect(() => {
    if (liveStatus || statuses.length <= 1) return;
    const interval = setInterval(() => {
      setStatusIndex(prev => (prev + 1) % statuses.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [statuses.length, liveStatus]);

  return (
    <div className="flex gap-3 chat-message-enter-left">
      {/* Avatar */}
      <div className="w-8 h-8 flex items-center justify-center shrink-0 chat-thinking-pulse">
        <img src={capyLogo} alt="Capy" className="h-8 w-8" />
      </div>

      {/* Thinking bubble */}
      <div className="chat-thinking-container rounded-2xl rounded-bl-md px-4 py-3 max-w-[320px]">
        <div className="flex items-center gap-3">
          {/* Status icon */}
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300',
            displayStatus.bgColor
          )}>
            <i className={cn('fa-solid', displayStatus.icon, displayStatus.color, 'text-sm', 
              liveStatus?.type === 'executing' && 'chat-spin-gentle'
            )} />
          </div>

          {/* Status text */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn('text-sm font-medium transition-colors duration-300', displayStatus.color)}>
                {displayStatus.label}
              </span>
              {elapsedTime > 0 && (
                <span className="text-[10px] text-muted-foreground tabular-nums">
                  {elapsedTime}s
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {description}
            </p>
            {/* Progress bar when available */}
            {liveStatus?.metadata?.progress !== undefined && (
              <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                <div 
                  className={cn('h-full rounded-full transition-all duration-300', displayStatus.bgColor.replace('/10', ''))} 
                  style={{ width: `${liveStatus.metadata.progress}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Animated dots */}
        <div className="flex items-center gap-1.5 mt-2.5 pl-11">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 chat-typing-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 chat-typing-dot" />
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 chat-typing-dot" />
        </div>
      </div>
    </div>
  );
}

// ============================================
// EMPTY STATE
// ============================================

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  const [greeting, setGreeting] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  
  const greetings = [
    { text: "Hey there! I'm Capy", emoji: "👋" },
    { text: "What's up! Ready to find some leads", emoji: "🎯" },
    { text: "Let's crush some outreach today", emoji: "🚀" },
    { text: "I've been waiting for you", emoji: "😊" },
  ];
  
  const suggestions = [
    { icon: 'fa-magnifying-glass', text: 'Find CTOs at fintech startups', emoji: '🔍' },
    { icon: 'fa-rocket', text: 'Find founders at Series A companies', emoji: '🚀' },
    { icon: 'fa-envelope', text: 'Draft an email to my leads', emoji: '✉️' },
    { icon: 'fa-chart-line', text: 'How are my campaigns doing?', emoji: '📊' },
  ];

  useEffect(() => {
    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    setGreeting(randomGreeting.text);
    
    // Show emoji with a slight delay for pop effect
    setTimeout(() => setShowEmoji(true), 300);
  }, []);

  return (
    <div className="chat-empty-state chat-fade-up">
      {/* Capy Avatar with alive animation */}
      <div className="relative capy-avatar-alive chat-gentle-bounce mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-muted/80 to-muted/40 flex items-center justify-center overflow-hidden">
          <img src={capyLogo} alt="Capy" className="w-14 h-14 alive-breathe" />
        </div>
        <div className="capy-status-indicator online" />
      </div>
      
      {/* Online Badge */}
      <div className="capy-online-badge mb-4">
        Capy Online
      </div>
      
      {/* Greeting with personality */}
      <h3 className="text-lg font-semibold text-foreground mb-1 flex items-center gap-2">
        {greeting}
        {showEmoji && (
          <span className="personality-emoji text-xl">
            {greetings.find(g => g.text === greeting)?.emoji || '👋'}
          </span>
        )}
      </h3>
      
      <p className="text-sm text-muted-foreground max-w-[300px] leading-relaxed mb-6">
        I'm your autonomous AI sales agent. Tell me who you want to reach, and I'll find them, 
        research them, and help you connect.
      </p>
      
      {/* Suggestions with personality */}
      <div className="flex flex-col gap-2.5 w-full max-w-[320px]">
        {suggestions.map((suggestion, i) => (
          <button
            key={i}
            className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/30 border border-border/50 hover:bg-muted/50 hover:border-border transition-all duration-200 text-left suggestion-pill alive-slide-up"
            onClick={() => onSuggestionClick(suggestion.text)}
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              <i className={cn('fa-solid text-sm text-primary', suggestion.icon)} />
            </div>
            <span className="text-sm text-foreground flex-1">{suggestion.text}</span>
            <span className="text-base opacity-0 group-hover:opacity-100 transition-opacity">
              {suggestion.emoji}
            </span>
          </button>
        ))}
      </div>
      
      {/* Subtle tip */}
      <p className="text-xs text-muted-foreground/60 mt-6 flex items-center gap-1.5">
        <kbd className="px-1.5 py-0.5 rounded bg-muted/50 font-mono text-[10px]">⌘K</kbd>
        to focus anytime
      </p>
    </div>
  );
}

// ============================================
// CHAT PANEL COMPONENT
// ============================================

export function ChatPanel() {
  const {
    messages,
    isLoading,
    isConnecting,
    session,
    sessions,
    context,
    currentStatus,
    sendMessage,
    executeAction,
    clearSession,
    switchSession,
  } = useChat();

  // Agent store for live agent status
  const handleAgentEvent = useAgentStore((state) => state.handleEvent);
  const createAgent = useAgentStore((state) => state.createAgent);
  const isAgentRunning = useAgentStore((state) => 
    session?.id ? state.isAgentRunning(session.id) : false
  );
  const requestStop = useAgentStore((state) => state.requestStop);

  // Local command processing
  const { processLocalCommand, isLocalCommand } = useChatAssistant();

  // Chat settings with localStorage persistence
  const { 
    chatMode, 
    isReadOnly, 
    requiresConfirmation, 
    canExecuteAction, 
    shouldConfirmAction,
    primaryService,
  } = useChatSettings();

  // Sidebar state from context
  const { chatSidebarCollapsed, navigateTo } = useApp();

  // Toast for notifications
  const { toast } = useToast();

  // Confirmation dialog state
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const [input, setInput] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<React.ElementRef<typeof ScrollArea>>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    if (scrollAreaRef.current) {
      const viewport = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement;
      if (viewport) {
        viewport.scrollTo({ top: viewport.scrollHeight, behavior });
      }
    }
    messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
  };

  // Close history dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    };
    if (showHistory) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showHistory]);

  // Scroll to bottom on mount
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('instant');
    }
  }, []);

  // Scroll when sidebar expands
  useEffect(() => {
    if (!chatSidebarCollapsed && messages.length > 0) {
      setTimeout(() => scrollToBottom('instant'), 10);
    }
  }, [chatSidebarCollapsed]);

  // Scroll on new messages
  useEffect(() => {
    if (messages.length > 0 && !isConnecting) {
      setTimeout(() => scrollToBottom('smooth'), 50);
    }
  }, [messages, isConnecting]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K to focus chat input
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
      }
      
      // Escape to blur and clear
      if (e.key === 'Escape' && document.activeElement === textareaRef.current) {
        textareaRef.current?.blur();
      }
      
      // Cmd/Ctrl + Shift + N for new chat
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'n') {
        e.preventDefault();
        clearSession();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [clearSession]);

  // Create agent when session starts
  useEffect(() => {
    if (session?.id) {
      createAgent(session.id, `agent_${session.id}`);
    }
  }, [session?.id, createAgent]);

  // Process status updates into agent events
  // Track previous status to detect completion (when status goes from something to null)
  const prevStatusRef = useRef<typeof currentStatus>(null);
  useEffect(() => {
    if (currentStatus && session?.id) {
      // Status update in progress
      processStatusUpdate(session.id, currentStatus, handleAgentEvent);
    } else if (!currentStatus && prevStatusRef.current && session?.id) {
      // Status went from something → null = request completed
      // Dispatch a complete event to clear the Planning state
      processStatusUpdate(session.id, { type: 'complete', message: 'Done' }, handleAgentEvent);
    }
    prevStatusRef.current = currentStatus;
  }, [currentStatus, session?.id, handleAgentEvent]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput('');

    // Check if this is a local command
    if (isLocalCommand(messageText)) {
      const handled = await processLocalCommand(messageText);
      if (handled) return;
    }

    await sendMessage(messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAction = async (action: string, params?: Record<string, any>) => {
    // Handle frontend navigation actions locally (always allowed)
    if (action === 'navigate.settings' || action === 'settings.connect') {
      navigateTo('settings');
      return;
    }
    if (action.startsWith('navigate.')) {
      const panel = action.replace('navigate.', '') as any;
      navigateTo(panel);
      return;
    }
    
    // Handle copy to clipboard (always allowed)
    if (action === 'general.copy' && params?.text) {
      try {
        await navigator.clipboard.writeText(params.text);
        toast({ title: 'Copied!', description: 'Text copied to clipboard' });
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      return;
    }

    // Check if action is allowed in read-only mode
    if (!canExecuteAction(action)) {
      toast({
        title: 'Read-Only Mode',
        description: 'Actions are disabled in read-only mode. Switch to a different mode to perform actions.',
        variant: 'destructive',
      });
      return;
    }

    // Check if action needs confirmation in ask-first mode
    if (shouldConfirmAction(action)) {
      setPendingAction({
        action,
        params,
        description: `Are you sure you want to execute this action?`,
      });
      setShowConfirmDialog(true);
      return;
    }
    
    await executeAction(action, params);
  };

  // Handle confirmation dialog actions
  const handleConfirmAction = async () => {
    if (pendingAction) {
      await executeAction(pendingAction.action, pendingAction.params);
    }
    setShowConfirmDialog(false);
    setPendingAction(null);
  };

  const handleCancelAction = () => {
    setShowConfirmDialog(false);
    setPendingAction(null);
    toast({
      title: 'Action Cancelled',
      description: 'The action was not executed.',
    });
  };

  // Quick actions
  const quickActions = [
    { icon: 'fa-comments', label: 'Inbox', action: () => setInput('Show my conversations') },
    { icon: 'fa-users', label: 'Find Leads', action: () => setInput('Find new leads') },
    { icon: 'fa-chart-line', label: 'Stats', action: () => setInput('Show campaign stats') },
  ];

  // Filter out welcome messages for empty check
  const hasRealMessages = messages.some(m => !m.id.startsWith('welcome'));

  if (isConnecting) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center chat-fade-up">
          <div className="w-12 h-12 flex items-center justify-center mx-auto mb-3 chat-thinking-pulse">
            <img src={capyLogo} alt="Capy" className="h-12 w-12" />
          </div>
          <p className="text-sm text-muted-foreground">Connecting to Capy...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 gap-2 shrink-0 bg-card/50">
        {/* History */}
        <div className="relative" ref={historyRef}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
          >
            <i className="fa-solid fa-clock-rotate-left text-xs" />
          </Button>
          {showHistory && sessions.length > 1 && (
            <div className="absolute left-0 top-full mt-1 min-w-[160px] bg-card border border-border rounded-xl shadow-lg z-50 overflow-hidden chat-scale-in">
              <div className="px-3 py-2 border-b border-border/50">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Recent Chats</span>
              </div>
              <div className="max-h-48 overflow-y-auto py-1">
                {sessions.slice(0, 5).map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      switchSession(s.id);
                      setShowHistory(false);
                    }}
                    className={cn(
                      'w-full px-3 py-2 text-left text-xs hover:bg-muted/50 transition-colors',
                      s.id === session?.id && 'bg-muted/50'
                    )}
                  >
                    <div className="font-medium truncate">{s.title || 'Chat'}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {s.updatedAt.toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Mode Selector & Integrations */}
        <div className="flex items-center gap-1.5">
          {/* Integrations Panel */}
          <IntegrationsPanel />
          
          {/* Mode & Service Selector with localStorage persistence */}
          <ChatSettingsToggle />
        </div>

        {/* New Chat - More visible */}
        <Button
          variant="outline"
          size="sm"
          onClick={clearSession}
          className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground border-dashed"
          title="Start a new chat"
        >
          <i className="fa-solid fa-plus text-[10px]" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>

      {/* Agent Status Bar - Shows when agent is active */}
      {session?.id && isAgentRunning && (
        <div className="px-3 py-2 border-b border-border/30 shrink-0">
          <AgentStatusBar sessionId={session.id} />
        </div>
      )}

      {/* Messages */}
      <ScrollArea ref={scrollAreaRef} className="flex-1 min-h-0 w-full chat-scrollbar">
        <div className="p-4 space-y-4 w-full max-w-full">
          {!hasRealMessages && !isLoading ? (
            <EmptyState onSuggestionClick={(text) => setInput(text)} />
          ) : (
            <>
              {messages.map((message, index) => (
                <MessageBubble
                  key={`${message.id}-${index}`}
                  message={message}
                  onAction={handleAction}
                  isLatest={index === messages.length - 1}
                />
              ))}
            </>
          )}

          {isLoading && (
            <ThinkingIndicator
              userMessage={messages.filter(m => m.role === 'user').pop()?.content}
              liveStatus={currentStatus}
            />
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Quick Actions */}
      {!hasRealMessages && !isLoading && (
        <div className="px-4 pb-2 shrink-0">
          <div className="flex gap-2">
            {quickActions.map((action, i) => (
              <button
                key={i}
                onClick={action.action}
                className="chat-quick-action"
              >
                <i className={cn('fa-solid', action.icon)} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Area */}
      <div className="chat-input-container p-3 shrink-0" data-tutorial="chat-input">
        <form onSubmit={handleSubmit} className="flex gap-2" role="form" aria-label="Chat input">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Capy anything... (⌘K to focus)"
            className="chat-input min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm flex-1 px-4 py-3"
            rows={1}
            disabled={isLoading}
            aria-label="Message input"
            aria-describedby="chat-shortcuts-hint"
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              'chat-send-button h-11 w-11 rounded-xl shrink-0 flex items-center justify-center text-white transition-transform',
              (!input.trim() || isLoading) && 'opacity-50 cursor-not-allowed'
            )}
            aria-label={isLoading ? 'Sending message...' : 'Send message'}
          >
            {isLoading ? (
              <i className="fa-solid fa-spinner chat-spin-gentle text-sm" aria-hidden="true" />
            ) : (
              <i className="fa-solid fa-paper-plane text-sm" aria-hidden="true" />
            )}
          </button>
        </form>
        <span id="chat-shortcuts-hint" className="sr-only">
          Press Enter to send, Shift+Enter for new line
        </span>
      </div>
    </div>
  );
}

// ============================================
// MESSAGE BUBBLE
// ============================================

interface MessageBubbleProps {
  message: ChatMessage;
  onAction: (action: string, params?: Record<string, any>) => void;
  isLatest?: boolean;
}

function MessageBubble({ message, onAction, isLatest = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const hasArtifacts = message.artifacts && message.artifacts.length > 0;
  const hasActions = message.actions && message.actions.length > 0;

  const [hasAnimated, setHasAnimated] = useState(false);
  const shouldAnimate = !isUser && isLatest && !hasAnimated && !message.id.startsWith('welcome');

  const { displayedText, isComplete } = useTypingAnimation(
    message.content,
    shouldAnimate,
    12
  );

  useEffect(() => {
    if (isComplete && shouldAnimate) {
      setHasAnimated(true);
    }
  }, [isComplete, shouldAnimate]);

  const textToShow = shouldAnimate ? displayedText : message.content;

  return (
    <div
      className={cn(
        'flex gap-3 w-full max-w-full',
        isUser ? 'justify-end' : 'justify-start',
        isUser ? 'chat-message-enter-right' : 'chat-message-enter-left'
      )}
    >
      {/* Bot avatar */}
      {!isUser && (
        <div className="w-8 h-8 flex items-center justify-center shrink-0">
          <img src={capyLogo} alt="Capy" className="h-8 w-8" />
        </div>
      )}

      <div className={cn('flex-1 space-y-2 min-w-0 overflow-hidden max-w-[85%]', isUser && 'flex flex-col items-end')}>
        {/* Message bubble */}
        <div
          className={cn(
            'chat-bubble rounded-2xl px-4 py-2.5 overflow-hidden',
            isUser
              ? 'chat-bubble-user rounded-br-md'
              : message.messageType === 'error'
                ? 'chat-bubble-error rounded-bl-md'
                : message.messageType === 'status'
                  ? 'chat-bubble-status rounded-bl-md bg-indigo-500/10 border border-indigo-500/20'
                  : message.messageType === 'progress_summary'
                    ? 'chat-bubble-progress rounded-bl-md bg-emerald-500/10 border border-emerald-500/20'
                    : 'chat-bubble-assistant rounded-bl-md'
          )}
        >
          {/* Status icon for pipeline status messages */}
          {message.messageType === 'status' && message.metadata && (
            <div className="flex items-center gap-2 mb-2 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
              {message.metadata.status_type === 'thinking' && <i className="fa-solid fa-brain" />}
              {message.metadata.status_type === 'sourcing' && <i className="fa-solid fa-magnifying-glass" />}
              {message.metadata.status_type === 'drafting' && <i className="fa-solid fa-pen-fancy" />}
              {message.metadata.status_type === 'sending' && <i className="fa-solid fa-paper-plane" />}
              {message.metadata.status_type === 'saving' && <i className="fa-solid fa-floppy-disk" />}
              {message.metadata.status_type === 'complete' && <i className="fa-solid fa-check-circle" />}
              {message.metadata.status_type === 'error' && <i className="fa-solid fa-exclamation-circle" />}
              {message.metadata.step_number && message.metadata.total_steps && (
                <span>Step {message.metadata.step_number}/{message.metadata.total_steps}</span>
              )}
            </div>
          )}

          <div className={cn(
            'text-sm leading-relaxed prose prose-sm max-w-full',
            isUser ? 'text-white prose-invert' : 'dark:prose-invert',
            'prose-p:my-1 prose-pre:max-w-full prose-pre:overflow-x-auto break-words [overflow-wrap:anywhere]'
          )}>
            <ReactMarkdown>{textToShow}</ReactMarkdown>
            {shouldAnimate && !isComplete && (
              <span className="inline-block w-0.5 h-4 bg-current chat-cursor-blink ml-0.5 align-middle" />
            )}
          </div>
          
          {/* Timestamp */}
          <div className={cn(
            'flex items-center gap-2 text-[10px] mt-1.5',
            isUser ? 'text-white/60' : 'text-muted-foreground'
          )}>
            <span>
              {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {message.intent && (
              <Badge 
                variant="secondary" 
                className={cn(
                  'text-[9px] h-4 px-1.5 font-normal',
                  isUser && 'bg-white/20 text-white/80 hover:bg-white/30'
                )}
              >
                {message.intent.action.split('.')[1]}
              </Badge>
            )}
          </div>
        </div>

        {/* Artifacts */}
        {hasArtifacts && (shouldAnimate ? isComplete : true) && (
          <div className="space-y-2 w-full chat-fade-up">
            {message.artifacts.map((artifact) => (
              <ArtifactRenderer
                key={artifact.id}
                artifact={artifact}
                onAction={onAction}
              />
            ))}
          </div>
        )}

        {/* Action buttons */}
        {hasActions && !isUser && (shouldAnimate ? isComplete : true) && (
          <div className="flex flex-wrap gap-1.5 chat-fade-up">
            {message.actions.slice(0, 4).map((action, i) => (
              <button
                key={i}
                onClick={() => onAction(action.action, action.params)}
                className="chat-quick-action"
              >
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-user text-primary text-xs" />
        </div>
      )}
    </div>
  );
}

export default ChatPanel;
