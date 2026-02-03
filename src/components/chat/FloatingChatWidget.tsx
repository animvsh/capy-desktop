/**
 * FloatingChatWidget - Premium floating chat widget
 *
 * Features:
 * - Minimized state: Elegant circular button with pulse indicator
 * - Expanded state: Polished mini chat panel
 * - Smooth animations and transitions
 * - Hidden when on /chat page
 */

import { useState, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useChat, ChatMessage } from "@/hooks/useChat";
import { cn } from "@/lib/utils";
import capyLogo from "@/assets/capy-logo.png";
import ReactMarkdown from "react-markdown";
import './chat.css';

const STORAGE_KEY = "capy-chat-widget-expanded";

export function FloatingChatWidget() {
  const location = useLocation();
  const navigate = useNavigate();
  const { messages, isLoading, sendMessage } = useChat();

  const [isExpanded, setIsExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [input, setInput] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Hide on /chat page
  if (location.pathname === "/chat") {
    return null;
  }

  // Save expanded state
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(isExpanded));
    } catch {
      // Ignore
    }
  }, [isExpanded]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isExpanded]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 80) + "px";
    }
  }, [input]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const messageText = input.trim();
    setInput("");
    await sendMessage(messageText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleExpanded = () => setIsExpanded(!isExpanded);
  const openFullChat = () => navigate("/chat");

  // Get recent messages
  const recentMessages = messages.slice(-10);
  const hasMessages = recentMessages.length > 0;

  // Minimized state
  if (!isExpanded) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={toggleExpanded}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          className={cn(
            "group relative w-14 h-14 rounded-2xl transition-all duration-300",
            "bg-card border border-border hover:border-primary/30",
            "flex items-center justify-center",
            "shadow-lg hover:shadow-xl",
            isHovered && "scale-105"
          )}
          title="Chat with Capy"
        >
          <img 
            src={capyLogo} 
            alt="Capy" 
            className={cn(
              "h-9 w-9 transition-transform duration-300",
              isHovered && "scale-110"
            )} 
          />
          
          {/* Pulse indicator */}
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500 border-2 border-card" />
          </span>

          {/* Hover tooltip */}
          <div className={cn(
            "absolute right-full mr-3 px-3 py-1.5 rounded-lg bg-card border border-border shadow-lg",
            "text-sm font-medium whitespace-nowrap",
            "transition-all duration-200",
            isHovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-2 pointer-events-none"
          )}>
            Chat with Capy
          </div>
        </button>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="fixed bottom-6 right-6 z-50 chat-scale-in">
      <div
        className={cn(
          "w-[360px] h-[480px] rounded-2xl overflow-hidden",
          "bg-card border border-border",
          "flex flex-col",
          "shadow-2xl shadow-black/10"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 flex items-center justify-center chat-gentle-bounce">
              <img src={capyLogo} alt="Capy" className="h-9 w-9" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Chat with Capy</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 chat-thinking-pulse" />
                <p className="text-xs text-muted-foreground">AI Assistant</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={openFullChat}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              title="Open full chat"
            >
              <i className="fa-solid fa-expand text-xs" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleExpanded}
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground"
              title="Minimize"
            >
              <i className="fa-solid fa-minus text-xs" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 chat-scrollbar">
          <div className="p-4 space-y-3">
            {!hasMessages ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 chat-gentle-bounce">
                  <img src={capyLogo} alt="Capy" className="h-10 w-10 opacity-60" />
                </div>
                <p className="text-sm font-medium">Hey! I'm Capy 👋</p>
                <p className="text-xs text-muted-foreground mt-1">Ask me anything about your leads</p>
                
                {/* Quick suggestions */}
                <div className="flex flex-wrap justify-center gap-2 mt-4">
                  {["Find leads", "Draft email", "Stats"].map((text, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(text)}
                      className="chat-quick-action"
                    >
                      {text}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              recentMessages.map((message, index) => (
                <MiniMessageBubble 
                  key={message.id} 
                  message={message} 
                  isLatest={index === recentMessages.length - 1}
                />
              ))
            )}

            {isLoading && (
              <div className="flex gap-2 items-center chat-message-enter-left">
                <div className="w-7 h-7 flex items-center justify-center chat-thinking-pulse">
                  <img src={capyLogo} alt="Capy" className="h-7 w-7" />
                </div>
                <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-2.5">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full chat-typing-dot" />
                    <span className="w-2 h-2 bg-emerald-500 rounded-full chat-typing-dot" />
                    <span className="w-2 h-2 bg-emerald-500 rounded-full chat-typing-dot" />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="p-3 border-t border-border">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Capy anything..."
              className="chat-input min-h-[44px] max-h-[80px] resize-none rounded-xl text-sm px-4 py-3"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className={cn(
                "chat-send-button h-11 w-11 rounded-xl shrink-0 flex items-center justify-center text-white",
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
          <button
            onClick={openFullChat}
            className="w-full mt-2 py-1.5 text-xs text-center text-muted-foreground hover:text-primary transition-colors"
          >
            Open full chat <i className="fa-solid fa-arrow-right ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

// Mini message bubble
function MiniMessageBubble({ message, isLatest }: { message: ChatMessage; isLatest?: boolean }) {
  const isUser = message.role === "user";

  return (
    <div className={cn(
      "flex gap-2",
      isUser ? "justify-end" : "justify-start",
      isUser ? "chat-message-enter-right" : "chat-message-enter-left"
    )}>
      {!isUser && (
        <div className="w-7 h-7 flex items-center justify-center shrink-0">
          <img src={capyLogo} alt="Capy" className="h-7 w-7" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2.5",
          isUser
            ? "chat-bubble-user rounded-br-md"
            : message.messageType === "error"
            ? "chat-bubble-error rounded-bl-md"
            : "chat-bubble-assistant rounded-bl-md"
        )}
      >
        <div className={cn(
          "prose prose-sm max-w-none text-xs leading-relaxed",
          isUser ? "text-white prose-invert" : "dark:prose-invert",
          "prose-p:my-0.5"
        )}>
          <ReactMarkdown>
            {message.content.length > 200
              ? message.content.slice(0, 200) + "..."
              : message.content}
          </ReactMarkdown>
        </div>
        <p className={cn(
          "text-[10px] mt-1",
          isUser ? "text-white/60" : "text-muted-foreground"
        )}>
          {message.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {isUser && (
        <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <i className="fa-solid fa-user text-primary text-[10px]" />
        </div>
      )}
    </div>
  );
}
