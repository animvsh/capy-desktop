/**
 * EmailCompose - Full-featured email composer
 *
 * Can be used as a modal or inline component
 */

import { useState, useRef, useEffect } from 'react';
import { useComposio, Email } from '@/hooks/useComposio';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface EmailComposeProps {
  onClose: () => void;
  replyTo?: Email;
  onSent?: () => void;
  defaultTo?: string;
  inline?: boolean;
}

export function EmailCompose({ onClose, replyTo, onSent, defaultTo, inline }: EmailComposeProps) {
  const { sendEmail, replyToThread, isLoading, status } = useComposio();

  const [to, setTo] = useState(replyTo ? replyTo.from : defaultTo || '');
  const [subject, setSubject] = useState(
    replyTo ? `Re: ${replyTo.subject.replace(/^Re:\s*/i, '')}` : ''
  );
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showCc, setShowCc] = useState(false);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [showBcc, setShowBcc] = useState(false);

  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus body when opening
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.focus();
    }
  }, []);

  const handleSend = async () => {
    if (!to.trim()) {
      toast.error('Please enter a recipient');
      return;
    }
    if (!subject.trim()) {
      toast.error('Please enter a subject');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setIsSending(true);

    try {
      let success = false;
      if (replyTo) {
        success = await replyToThread(replyTo.threadId, body);
      } else {
        success = await sendEmail(to, subject, body);
      }

      if (success) {
        toast.success('Email sent successfully');
        onSent?.();
        onClose();
      }
    } catch (error) {
      toast.error('Failed to send email');
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to send
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
    // Escape to close
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const isReply = !!replyTo;
  const canSend = to.trim() && subject.trim() && body.trim() && !isSending;

  const content = (
    <div className="flex flex-col h-full" onKeyDown={handleKeyDown}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border/50 shrink-0">
        <h3 className="font-semibold text-sm">
          {isReply ? 'Reply' : 'New Message'}
        </h3>
        <div className="flex items-center gap-1">
          {status.connectedEmail && (
            <span className="text-[10px] text-muted-foreground mr-2">
              From: {status.connectedEmail}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7"
          >
            <i className="fa-solid fa-xmark text-xs" />
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 flex flex-col min-h-0 overflow-auto">
        {/* To */}
        <div className="flex items-center border-b border-border/50 px-3">
          <span className="text-xs text-muted-foreground w-12 shrink-0">To:</span>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="recipient@example.com"
            disabled={isReply}
            className="border-0 focus-visible:ring-0 h-9 text-sm px-0"
          />
          {!isReply && (
            <div className="flex gap-1 shrink-0">
              {!showCc && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCc(true)}
                  className="h-6 text-[10px] text-muted-foreground"
                >
                  Cc
                </Button>
              )}
              {!showBcc && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBcc(true)}
                  className="h-6 text-[10px] text-muted-foreground"
                >
                  Bcc
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Cc */}
        {showCc && (
          <div className="flex items-center border-b border-border/50 px-3">
            <span className="text-xs text-muted-foreground w-12 shrink-0">Cc:</span>
            <Input
              type="email"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="cc@example.com"
              className="border-0 focus-visible:ring-0 h-9 text-sm px-0"
            />
          </div>
        )}

        {/* Bcc */}
        {showBcc && (
          <div className="flex items-center border-b border-border/50 px-3">
            <span className="text-xs text-muted-foreground w-12 shrink-0">Bcc:</span>
            <Input
              type="email"
              value={bcc}
              onChange={(e) => setBcc(e.target.value)}
              placeholder="bcc@example.com"
              className="border-0 focus-visible:ring-0 h-9 text-sm px-0"
            />
          </div>
        )}

        {/* Subject */}
        <div className="flex items-center border-b border-border/50 px-3">
          <span className="text-xs text-muted-foreground w-12 shrink-0">Subject:</span>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Email subject"
            disabled={isReply}
            className="border-0 focus-visible:ring-0 h-9 text-sm px-0"
          />
        </div>

        {/* Reply context */}
        {isReply && replyTo && (
          <div className="p-3 bg-muted/30 border-b border-border/50">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <i className="fa-solid fa-reply text-[10px]" />
              <span>Replying to {replyTo.fromName || replyTo.from}</span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
              "{replyTo.snippet}"
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 p-3">
          <Textarea
            ref={bodyRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write your message here..."
            className="min-h-[150px] h-full resize-none border-0 focus-visible:ring-0 p-0 text-sm"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t border-border/50 shrink-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            title="Attach file (coming soon)"
            disabled
            className="h-8 w-8"
          >
            <i className="fa-solid fa-paperclip text-xs text-muted-foreground" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            title="Insert link"
            disabled
            className="h-8 w-8"
          >
            <i className="fa-solid fa-link text-xs text-muted-foreground" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground hidden sm:block">
            ⌘ Enter to send
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSending}
            className="h-8 text-xs"
          >
            Discard
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={!canSend}
            className="h-8 text-xs gap-1.5"
          >
            {isSending ? (
              <>
                <i className="fa-solid fa-spinner fa-spin text-[10px]" />
                Sending
              </>
            ) : (
              <>
                <i className="fa-solid fa-paper-plane text-[10px]" />
                Send
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );

  // Inline mode renders directly
  if (inline) {
    return (
      <div className="h-full border-l border-border/50 bg-card">
        {content}
      </div>
    );
  }

  // Modal mode
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[80vh] p-0 gap-0 flex flex-col">
        {content}
      </DialogContent>
    </Dialog>
  );
}

export default EmailCompose;
