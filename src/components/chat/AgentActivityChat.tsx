/**
 * AgentActivityChat - Premium Live Activity + Chat component
 *
 * Features:
 * - Live activity feed with polished cards
 * - Integrated chat messages
 * - Multi-stage thinking indicators
 * - Smooth animations throughout
 */

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/textarea";
import { useChat, ChatMessage } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import capyLogo from "@/assets/capy-logo.png";
import ReactMarkdown from "react-markdown";
import './chat.css';

interface ActivityLog {
  id: string;
  type: string;
  title: string;
  description: string | null;
  created_at: string;
}

interface AgentActivityChatProps {
  activities: ActivityLog[];
  isAgentRunning: boolean;
  activityFilter: string | null;
}

// Unified feed item type
type FeedItem =
  | { kind: "activity"; data: ActivityLog; timestamp: Date }
  | { kind: "message"; data: ChatMessage; timestamp: Date }
  | { kind: "thinking"; data: { userMessage: string; stage: ThinkingStage }; timestamp: Date };

type ThinkingStage = "understanding" | "planning" | "executing";

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function getActivityStyle(type: string) {
  const styles: Record<string, { iconClass: string; color: string; bg: string; gradient: string }> = {
    prospect: { iconClass: "fa-user", color: "text-blue-500", bg: "bg-blue-500/10", gradient: "from-blue-500 to-blue-600" },
    found: { iconClass: "fa-user-plus", color: "text-blue-500", bg: "bg-blue-500/10", gradient: "from-blue-500 to-blue-600" },
    search: { iconClass: "fa-magnifying-glass", color: "text-blue-500", bg: "bg-blue-500/10", gradient: "from-blue-500 to-blue-600" },
    enrich: { iconClass: "fa-envelope-circle-check", color: "text-cyan-500", bg: "bg-cyan-500/10", gradient: "from-cyan-500 to-cyan-600" },
    email_found: { iconClass: "fa-at", color: "text-cyan-500", bg: "bg-cyan-500/10", gradient: "from-cyan-500 to-cyan-600" },
    generat: { iconClass: "fa-wand-magic-sparkles", color: "text-violet-500", bg: "bg-violet-500/10", gradient: "from-violet-500 to-violet-600" },
    draft: { iconClass: "fa-file-pen", color: "text-violet-500", bg: "bg-violet-500/10", gradient: "from-violet-500 to-violet-600" },
    sent: { iconClass: "fa-paper-plane", color: "text-emerald-500", bg: "bg-emerald-500/10", gradient: "from-emerald-500 to-emerald-600" },
    send: { iconClass: "fa-paper-plane", color: "text-emerald-500", bg: "bg-emerald-500/10", gradient: "from-emerald-500 to-emerald-600" },
    reply: { iconClass: "fa-comment", color: "text-amber-500", bg: "bg-amber-500/10", gradient: "from-amber-500 to-amber-600" },
    error: { iconClass: "fa-triangle-exclamation", color: "text-red-500", bg: "bg-red-500/10", gradient: "from-red-500 to-red-600" },
    fail: { iconClass: "fa-xmark", color: "text-red-500", bg: "bg-red-500/10", gradient: "from-red-500 to-red-600" },
    cooldown: { iconClass: "fa-clock", color: "text-gray-500", bg: "bg-gray-500/10", gradient: "from-gray-500 to-gray-600" },
    wait: { iconClass: "fa-hourglass", color: "text-gray-500", bg: "bg-gray-500/10", gradient: "from-gray-500 to-gray-600" },
  };

  for (const [key, style] of Object.entries(styles)) {
    if (type.includes(key)) return style;
  }
  
  return { iconClass: "fa-circle-check", color: "text-gray-500", bg: "bg-gray-500/10", gradient: "from-gray-500 to-gray-600" };
}

// Detect intent from user message
function detectIntent(message: string): { intent: string; icon: string; actions: string[] } {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes("pause") || lowerMsg.includes("stop")) {
    return {
      intent: "Pause/Stop agent",
      icon: "fa-pause",
      actions: ["Pausing outreach activities", "Saving current state"],
    };
  }
  if (lowerMsg.includes("resume") || lowerMsg.includes("start") || lowerMsg.includes("continue")) {
    return {
      intent: "Resume/Start agent",
      icon: "fa-play",
      actions: ["Resuming outreach", "Loading saved state"],
    };
  }
  if (lowerMsg.includes("clear target") || lowerMsg.includes("clear focus") || lowerMsg.includes("reset target")) {
    return {
      intent: "Clear targeting filters",
      icon: "fa-eraser",
      actions: ["Clearing custom targeting", "Reverting to ICP defaults"],
    };
  }
  if (lowerMsg.includes("focus") || lowerMsg.includes("only") || lowerMsg.includes("target") || 
      lowerMsg.includes("find me") || lowerMsg.includes("look for") || lowerMsg.includes("search for")) {
    return {
      intent: "Update targeting criteria",
      icon: "fa-bullseye",
      actions: ["Parsing targeting criteria", "Updating search filters"],
    };
  }
  if (lowerMsg.includes("slow") || lowerMsg.includes("speed") || lowerMsg.includes("fast")) {
    return {
      intent: "Adjust outreach speed",
      icon: "fa-gauge",
      actions: ["Calculating new rate limits", "Updating email cadence"],
    };
  }
  if (lowerMsg.includes("skip") || lowerMsg.includes("avoid") || lowerMsg.includes("exclude") || lowerMsg.includes("blacklist")) {
    return {
      intent: "Add exclusions",
      icon: "fa-ban",
      actions: ["Processing exclusion criteria", "Updating blacklist"],
    };
  }
  if (lowerMsg.includes("email") || lowerMsg.includes("write") || lowerMsg.includes("draft")) {
    return {
      intent: "Generate email content",
      icon: "fa-envelope",
      actions: ["Analyzing prospect data", "Crafting personalized message"],
    };
  }
  if (lowerMsg.includes("status") || lowerMsg.includes("how") || lowerMsg.includes("what is") || lowerMsg.includes("what's")) {
    return {
      intent: "Get status update",
      icon: "fa-info-circle",
      actions: ["Gathering agent metrics", "Preparing summary"],
    };
  }

  return {
    intent: "Process instruction",
    icon: "fa-brain",
    actions: ["Understanding request", "Determining best action"],
  };
}

export function AgentActivityChat({ activities, isAgentRunning, activityFilter }: AgentActivityChatProps) {
  const { messages, isLoading, sendMessage } = useChat();
  const [input, setInput] = useState("");
  const [thinkingState, setThinkingState] = useState<{
    active: boolean;
    stage: ThinkingStage;
    userMessage: string;
    detectedIntent: ReturnType<typeof detectIntent> | null;
  }>({
    active: false,
    stage: "understanding",
    userMessage: "",
    detectedIntent: null,
  });

  const feedEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build unified feed
  const unifiedFeed: FeedItem[] = [];

  activities.forEach((activity) => {
    unifiedFeed.push({
      kind: "activity",
      data: activity,
      timestamp: new Date(activity.created_at),
    });
  });

  messages.forEach((message) => {
    if (message.id.startsWith("welcome")) return;
    unifiedFeed.push({
      kind: "message",
      data: message,
      timestamp: message.createdAt,
    });
  });

  unifiedFeed.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  // Auto-scroll
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [unifiedFeed.length, thinkingState.active]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 100) + "px";
    }
  }, [input]);

  // Clear thinking state when response received
  useEffect(() => {
    if (!isLoading && thinkingState.active) {
      setThinkingState((prev) => ({ ...prev, active: false }));
    }
  }, [isLoading]);

  // Progress through thinking stages
  useEffect(() => {
    if (thinkingState.active && thinkingState.stage === "understanding") {
      const timer = setTimeout(() => {
        setThinkingState((prev) => ({ ...prev, stage: "planning" }));
      }, 800);
      return () => clearTimeout(timer);
    }
    if (thinkingState.active && thinkingState.stage === "planning") {
      const timer = setTimeout(() => {
        setThinkingState((prev) => ({ ...prev, stage: "executing" }));
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [thinkingState.active, thinkingState.stage]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput("");

    const intent = detectIntent(messageText);
    setThinkingState({
      active: true,
      stage: "understanding",
      userMessage: messageText,
      detectedIntent: intent,
    });

    await sendMessage(messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const suggestions = [
    { label: "Status", instruction: "What's the current status?" },
    { label: "Focus CTOs", instruction: "Focus on CTOs at startups" },
    { label: "Fintech", instruction: "Find founders in fintech" },
    { label: "Clear Focus", instruction: "Clear targeting and use my ICP" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Feed Area */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-3 chat-scrollbar">
        {unifiedFeed.length === 0 && !thinkingState.active ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon chat-gentle-bounce">
              <img src={capyLogo} alt="Capy" />
            </div>
            <h3 className="chat-empty-title">No activity yet</h3>
            <p className="chat-empty-description">
              Start the agent or send instructions below to get Capy working for you
            </p>
          </div>
        ) : (
          <>
            {unifiedFeed.map((item) => {
              if (item.kind === "activity") {
                return <ActivityItem key={`activity-${item.data.id}`} activity={item.data} />;
              }
              if (item.kind === "message") {
                return <MessageItem key={`message-${item.data.id}`} message={item.data} />;
              }
              return null;
            })}

            {thinkingState.active && thinkingState.detectedIntent && (
              <ThinkingIndicator
                stage={thinkingState.stage}
                userMessage={thinkingState.userMessage}
                detectedIntent={thinkingState.detectedIntent}
              />
            )}

            <div ref={feedEndRef} />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="chat-input-container p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Give Capy instructions..."
            className="chat-input min-h-[44px] max-h-[100px] resize-none rounded-xl text-sm px-4 py-3"
            rows={1}
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className={cn(
              "h-11 w-11 rounded-xl shrink-0 flex items-center justify-center text-white",
              "bg-gradient-to-br from-emerald-500 to-emerald-600",
              "shadow-lg shadow-emerald-500/20",
              "transition-all duration-200",
              "hover:scale-105 hover:shadow-emerald-500/30",
              "active:scale-98",
              (!input.trim() || isLoading) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoading ? (
              <i className="fa-solid fa-spinner chat-spin-gentle text-sm" />
            ) : (
              <i className="fa-solid fa-paper-plane text-sm" />
            )}
          </button>
        </form>

        {/* Quick suggestions */}
        <div className="flex items-center gap-2 mt-3 overflow-x-auto">
          <span className="text-xs text-muted-foreground shrink-0">Quick:</span>
          {suggestions.map((suggestion, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInput(suggestion.instruction)}
              disabled={isLoading}
              className="chat-quick-action"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Activity Item
function ActivityItem({ activity }: { activity: ActivityLog }) {
  const style = getActivityStyle(activity.type);

  return (
    <div className="flex items-start gap-3 chat-message-enter-left">
      <div className={cn(
        "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
        style.bg
      )}>
        <i className={cn("fa-solid text-sm", style.iconClass, style.color)} />
      </div>
      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{activity.title}</p>
          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
            {formatTime(new Date(activity.created_at))}
          </span>
        </div>
        {activity.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{activity.description}</p>
        )}
      </div>
    </div>
  );
}

// Message Item
function MessageItem({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end chat-message-enter-right">
        <div className="max-w-[80%] chat-bubble-user rounded-2xl rounded-br-md px-4 py-2.5">
          <p className="text-sm text-white">{message.content}</p>
          <span className="text-[10px] text-white/60 mt-1 block">
            {formatTime(message.createdAt)}
          </span>
        </div>
        <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-user text-primary text-xs" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 chat-message-enter-left">
      <div className="w-8 h-8 flex items-center justify-center shrink-0">
        <img src={capyLogo} alt="Capy" className="h-8 w-8" />
      </div>
      <div className="max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl rounded-bl-md px-4 py-2.5",
            message.messageType === "error"
              ? "chat-bubble-error"
              : "chat-bubble-assistant"
          )}
        >
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none prose-p:my-1">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
          <span className="text-[10px] text-muted-foreground mt-1 block">
            {formatTime(message.createdAt)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Multi-stage Thinking Indicator
function ThinkingIndicator({
  stage,
  userMessage,
  detectedIntent,
}: {
  stage: ThinkingStage;
  userMessage: string;
  detectedIntent: ReturnType<typeof detectIntent>;
}) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    setElapsedTime(0);
    const interval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [stage]);

  const stageConfig = {
    understanding: {
      title: "Understanding",
      subtitle: `"${userMessage.length > 35 ? userMessage.slice(0, 35) + "..." : userMessage}"`,
      icon: "fa-ear-listen",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      progress: 33,
    },
    planning: {
      title: `Intent: ${detectedIntent.intent}`,
      subtitle: detectedIntent.actions[0],
      icon: detectedIntent.icon,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      progress: 66,
    },
    executing: {
      title: "Executing",
      subtitle: detectedIntent.actions[1] || detectedIntent.actions[0],
      icon: "fa-cog",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      progress: 100,
    },
  };

  const config = stageConfig[stage];

  return (
    <div className="flex items-start gap-3 chat-message-enter-left">
      <div className="w-8 h-8 flex items-center justify-center shrink-0 chat-thinking-pulse">
        <img src={capyLogo} alt="Capy" className="h-8 w-8" />
      </div>
      <div className="chat-thinking-container rounded-2xl rounded-bl-md px-4 py-3 max-w-[300px]">
        <div className="flex items-center gap-3">
          {/* Stage indicator */}
          <div className={cn(
            "relative w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300",
            config.bg
          )}>
            <i className={cn("fa-solid text-sm", config.icon, config.color)} />
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className={cn("animate-ping absolute inline-flex h-full w-full rounded-full opacity-75", config.bg)} />
              <span className={cn("relative inline-flex rounded-full h-2.5 w-2.5 border-2 border-card", config.bg)} />
            </span>
          </div>

          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={cn("text-sm font-medium transition-colors duration-300", config.color)}>
                {config.title}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums">{elapsedTime}s</span>
            </div>
            <span className="text-xs text-muted-foreground truncate">{config.subtitle}</span>
          </div>

          {/* Stage dots */}
          <div className="flex gap-1.5 ml-2">
            <span className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              stage === "understanding" ? "bg-blue-500" : "bg-blue-500"
            )} />
            <span className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              stage === "planning" || stage === "executing" ? "bg-violet-500" : "bg-muted"
            )} />
            <span className={cn(
              "w-2 h-2 rounded-full transition-colors duration-300",
              stage === "executing" ? "bg-emerald-500" : "bg-muted"
            )} />
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500 relative",
              stage === "understanding" && "bg-blue-500",
              stage === "planning" && "bg-violet-500",
              stage === "executing" && "bg-emerald-500"
            )}
            style={{ width: `${config.progress}%` }}
          >
            <div className="absolute inset-0 chat-progress-shimmer" />
          </div>
        </div>
      </div>
    </div>
  );
}
