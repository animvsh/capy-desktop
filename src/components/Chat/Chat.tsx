import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Loader2, Paperclip, Mic } from 'lucide-react';
import { Button } from '../ui/Button';
import { ScrollArea } from '../ui/ScrollArea';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'sending' | 'sent' | 'error';
}

interface ChatProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  isTyping?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`
          flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center
          ${isUser
            ? 'bg-indigo-500/20 text-indigo-400'
            : 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white'
          }
        `}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
      </div>

      {/* Content */}
      <div
        className={`
          flex flex-col gap-1 max-w-[75%]
          ${isUser ? 'items-end' : 'items-start'}
        `}
      >
        <div
          className={`
            px-4 py-2.5 rounded-2xl text-sm leading-relaxed
            ${isUser
              ? 'bg-indigo-600 text-white rounded-tr-md'
              : 'bg-zinc-800/80 text-zinc-100 rounded-tl-md border border-zinc-700/50'
            }
          `}
        >
          {message.content}
        </div>
        <span className="text-[10px] text-zinc-500 px-1">
          {formatTime(message.timestamp)}
        </span>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
        <Sparkles className="w-4 h-4" />
      </div>
      <div className="px-4 py-3 rounded-2xl rounded-tl-md bg-zinc-800/80 border border-zinc-700/50">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  );
}

export function Chat({
  messages,
  onSendMessage,
  isTyping = false,
  placeholder = 'Send a message...',
  disabled = false,
}: ChatProps) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;

    onSendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-900/30">
      {/* Messages Area */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 p-4"
      >
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/25">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                How can I help you today?
              </h3>
              <p className="text-sm text-zinc-500 max-w-sm">
                I can help you with lead outreach, browser automation, and campaign management.
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))
          )}
          {isTyping && <TypingIndicator />}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-zinc-800/50">
        <form onSubmit={handleSubmit} className="relative">
          <div className="flex items-end gap-2 p-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50 focus-within:border-indigo-500/50 transition-colors">
            {/* Attachment Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-zinc-500 hover:text-zinc-300"
            >
              <Paperclip className="w-4 h-4" />
            </Button>

            {/* Text Input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="
                flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500
                resize-none focus:outline-none py-1.5
                min-h-[24px] max-h-[150px]
              "
            />

            {/* Voice Button */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-zinc-500 hover:text-zinc-300"
            >
              <Mic className="w-4 h-4" />
            </Button>

            {/* Send Button */}
            <Button
              type="submit"
              size="icon-sm"
              disabled={!input.trim() || disabled}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              {disabled ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>

          {/* Helper text */}
          <p className="mt-2 text-[11px] text-zinc-600 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}

export default Chat;
