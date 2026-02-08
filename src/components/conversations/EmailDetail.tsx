/**
 * EmailDetail - Clean email detail view with thread display
 */

import { EmailThread, Email } from '@/hooks/useComposio';
import { Button } from '@/components/ui/Button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface EmailDetailProps {
  thread: EmailThread;
  onClose: () => void;
  onReply: () => void;
  onStar: () => void;
  onArchive: () => void;
  onDelete: () => void;
}

export function EmailDetail({
  thread,
  onClose,
  onReply,
  onStar,
  onArchive,
  onDelete,
}: EmailDetailProps) {
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(
    // Expand the last message by default
    new Set([thread.messages[thread.messages.length - 1]?.id])
  );

  const toggleExpand = (messageId: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedMessages(new Set(thread.messages.map(m => m.id)));
  };

  const collapseAll = () => {
    setExpandedMessages(new Set([thread.messages[thread.messages.length - 1]?.id]));
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-card/50">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 shrink-0 md:hidden"
          >
            <i className="fa-solid fa-arrow-left text-sm" />
          </Button>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm truncate">{thread.subject}</h3>
            <p className="text-[11px] text-muted-foreground">
              {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onStar}
            className="h-8 w-8"
            title="Star"
          >
            <i className={cn(
              'fa-star text-sm',
              thread.isStarred ? 'fa-solid text-amber-500' : 'fa-regular text-muted-foreground'
            )} />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onArchive}
            className="h-8 w-8"
            title="Archive"
          >
            <i className="fa-solid fa-box-archive text-sm text-muted-foreground" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            className="h-8 w-8"
            title="Delete"
          >
            <i className="fa-solid fa-trash text-sm text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </div>

      {/* Thread controls */}
      {thread.messageCount > 1 && (
        <div className="flex items-center justify-end gap-1 px-4 py-1.5 border-b border-border/30">
          <Button
            variant="ghost"
            size="sm"
            onClick={expandAll}
            className="h-6 text-[10px] text-muted-foreground"
          >
            Expand all
          </Button>
          <span className="text-muted-foreground/50">|</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={collapseAll}
            className="h-6 text-[10px] text-muted-foreground"
          >
            Collapse
          </Button>
        </div>
      )}

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {thread.messages.map((message, index) => (
            <MessageCard
              key={message.id}
              message={message}
              isExpanded={expandedMessages.has(message.id)}
              isLast={index === thread.messages.length - 1}
              onToggle={() => toggleExpand(message.id)}
            />
          ))}
        </div>
      </ScrollArea>

      {/* Reply bar */}
      <div className="p-3 border-t border-border/50 bg-card/30">
        <Button
          className="w-full gap-2 h-9"
          onClick={onReply}
        >
          <i className="fa-solid fa-reply text-xs" />
          Reply
        </Button>
      </div>
    </div>
  );
}

interface MessageCardProps {
  message: Email;
  isExpanded: boolean;
  isLast: boolean;
  onToggle: () => void;
}

function MessageCard({ message, isExpanded, isLast, onToggle }: MessageCardProps) {
  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    if (isToday) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Determine if this is an outbound message
  const isOutbound = message.labels?.includes('SENT') || message.from?.includes('you@') || message.fromName === 'You';

  return (
    <div className={cn(
      'rounded-xl overflow-hidden transition-all duration-200',
      isLast ? 'bg-card border border-border shadow-sm' : 'bg-muted/30 border border-transparent',
      isExpanded && 'bg-card border-border shadow-sm'
    )}>
      {/* Header - always visible */}
      <div
        className={cn(
          'flex items-center gap-3 p-3 cursor-pointer transition-colors',
          !isExpanded && 'hover:bg-muted/50'
        )}
        onClick={onToggle}
      >
        {/* Avatar */}
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0',
          isOutbound
            ? 'bg-emerald-500/10 text-emerald-600'
            : 'bg-primary/10 text-primary'
        )}>
          {isOutbound ? (
            <i className="fa-solid fa-user text-[10px]" />
          ) : (
            getInitials(message.fromName || message.from)
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {message.fromName || message.from}
            </span>
            {isOutbound && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 font-medium">
                You
              </span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground">
            to {message.toName || message.to}
          </div>
        </div>

        {/* Date & expand icon */}
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
          <span>{formatDate(message.date)}</span>
          <i className={cn(
            'fa-solid text-[8px] transition-transform',
            isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'
          )} />
        </div>
      </div>

      {/* Body - shown when expanded */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="h-px bg-border/50 mb-3" />
          <div
            className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed
                       prose-p:my-2 prose-p:leading-relaxed
                       prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                       prose-pre:bg-muted prose-pre:text-xs
                       prose-blockquote:border-l-primary/50 prose-blockquote:text-muted-foreground"
            dangerouslySetInnerHTML={{
              __html: formatEmailBody(message.body || message.bodyPlain || message.snippet || ''),
            }}
          />

          {/* Attachments */}
          {message.hasAttachments && (
            <div className="mt-3 pt-3 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <i className="fa-solid fa-paperclip text-[10px]" />
                <span>Attachments available</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed preview */}
      {!isExpanded && (
        <div className="px-3 pb-3 -mt-1">
          <p className="text-xs text-muted-foreground truncate pl-11">
            {message.snippet}
          </p>
        </div>
      )}
    </div>
  );
}

// Helper to format email body - clean up common email formatting issues
// SECURITY: Sanitizes HTML to prevent XSS attacks
function formatEmailBody(html: string): string {
  if (!html) return '';

  // If it's plain text (no HTML tags), convert newlines to <br> and escape HTML entities
  if (!html.includes('<') || !html.includes('>')) {
    return escapeHtml(html).replace(/\n/g, '<br>');
  }

  // Sanitize HTML - remove dangerous elements and attributes
  return sanitizeHtml(html);
}

// Escape HTML special characters
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char]);
}

// Sanitize HTML - allow safe tags, remove dangerous ones
function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Create a temporary element to parse HTML
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // Safety check - if body is null, return empty string
  if (!doc.body) return '';

  // List of allowed tags
  const allowedTags = new Set([
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'a', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'img', 'hr',
  ]);
  
  // List of allowed attributes (per tag)
  const allowedAttrs: Record<string, Set<string>> = {
    'a': new Set(['href', 'title', 'target', 'rel']),
    'img': new Set(['src', 'alt', 'width', 'height']),
    '*': new Set(['style', 'class']), // Allow style and class on all elements
  };
  
  // Dangerous patterns in style attributes
  const dangerousStylePatterns = [
    /expression\s*\(/gi,
    /javascript\s*:/gi,
    /behavior\s*:/gi,
    /-moz-binding/gi,
    /url\s*\(\s*["']?\s*data:/gi,
  ];
  
  // Recursively sanitize nodes
  function sanitizeNode(node: Node): void {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      const tagName = element.tagName.toLowerCase();
      
      // Remove disallowed tags but keep their text content
      if (!allowedTags.has(tagName)) {
        // Special case: completely remove script, style, iframe, etc.
        const removeCompletely = ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button'];
        if (removeCompletely.includes(tagName)) {
          element.remove();
          return;
        }
        // Replace with span for other disallowed tags
        const span = document.createElement('span');
        span.innerHTML = element.innerHTML || '';
        element.replaceWith(span);
        return;
      }
      
      // Sanitize attributes
      const attrsToRemove: string[] = [];
      for (const attr of Array.from(element.attributes)) {
        const attrName = attr.name.toLowerCase();
        
        // Remove event handlers
        if (attrName.startsWith('on')) {
          attrsToRemove.push(attr.name);
          continue;
        }
        
        // Check if attribute is allowed
        const tagAllowed = allowedAttrs[tagName];
        const globalAllowed = allowedAttrs['*'];
        if (!tagAllowed?.has(attrName) && !globalAllowed?.has(attrName)) {
          attrsToRemove.push(attr.name);
          continue;
        }
        
        // Sanitize href/src - only allow safe protocols
        if (attrName === 'href' || attrName === 'src') {
          const value = attr.value.toLowerCase().trim();
          if (value.startsWith('javascript:') || 
              value.startsWith('vbscript:') ||
              value.startsWith('data:text/html')) {
            attrsToRemove.push(attr.name);
            continue;
          }
        }
        
        // Sanitize style attribute
        if (attrName === 'style') {
          let styleValue = attr.value;
          for (const pattern of dangerousStylePatterns) {
            styleValue = styleValue.replace(pattern, '');
          }
          element.setAttribute('style', styleValue);
        }
      }
      
      // Remove disallowed attributes
      for (const attr of attrsToRemove) {
        element.removeAttribute(attr);
      }
      
      // Add rel="noopener noreferrer" and target="_blank" to links
      if (tagName === 'a') {
        element.setAttribute('target', '_blank');
        element.setAttribute('rel', 'noopener noreferrer');
      }
    }
    
    // Recursively process children
    for (const child of Array.from(node.childNodes)) {
      sanitizeNode(child);
    }
  }
  
  sanitizeNode(doc.body);
  return doc.body?.innerHTML || '';
}

export default EmailDetail;
