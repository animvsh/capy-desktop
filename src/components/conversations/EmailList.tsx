/**
 * EmailList - Clean, minimal list view of emails
 * Simplified design with better spacing and less visual noise
 * 
 * Performance optimizations:
 * - React.memo on EmailListItem to prevent re-renders
 * - useCallback for handlers passed to children
 */

import { memo, useCallback } from 'react';
import { Email } from '@/hooks/useComposio';
import { cn } from '@/lib/utils';

interface EmailListProps {
  emails: Email[];
  selectedEmailId: string | null;
  onSelect: (email: Email) => void;
  onStar: (email: Email) => void;
  onArchive: (email: Email) => void;
  onDelete: (email: Email) => void;
  isLoading?: boolean;
}

export function EmailList({
  emails,
  selectedEmailId,
  onSelect,
  onStar,
  isLoading = false,
}: EmailListProps) {
  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="flex items-center gap-3 p-3">
              <div className="w-10 h-10 rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-1/3" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <i className="fa-solid fa-inbox text-4xl mb-4 opacity-30" />
        <p className="text-sm">No emails found</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-border/30">
      {emails.map((email) => (
        <EmailListItem
          key={email.id}
          email={email}
          isSelected={selectedEmailId === email.id}
          onSelect={() => onSelect(email)}
          onStar={() => onStar(email)}
        />
      ))}
    </div>
  );
}

interface EmailListItemProps {
  email: Email;
  isSelected: boolean;
  onSelect: () => void;
  onStar: () => void;
}

// Memoized to prevent re-renders when parent state changes
const EmailListItem = memo(function EmailListItem({ email, isSelected, onSelect, onStar }: EmailListItemProps) {
  const formatDate = (date: Date) => {
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isThisYear = date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (isThisYear) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' });
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const isOutbound = email.labels?.includes('SENT') || email.from?.includes('you@');
  const displayName = isOutbound ? (email.toName || email.to) : (email.fromName || email.from);

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
        isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
        !email.isRead && 'bg-primary/[0.02]'
      )}
      onClick={onSelect}
    >
      {/* Unread indicator */}
      {!email.isRead && (
        <div className="absolute left-1 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full bg-primary" />
      )}

      {/* Avatar */}
      <div className={cn(
        'w-10 h-10 rounded-full flex items-center justify-center text-xs font-medium shrink-0',
        isOutbound
          ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
          : 'bg-muted text-muted-foreground'
      )}>
        {isOutbound ? (
          <i className="fa-solid fa-arrow-up text-xs" />
        ) : (
          getInitials(displayName || 'U')
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Name and date */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <span className={cn('text-sm truncate', !email.isRead && 'font-semibold')}>
            {isOutbound ? `To: ${displayName}` : displayName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatDate(email.date)}
          </span>
        </div>

        {/* Subject */}
        <div className={cn(
          'text-sm truncate mb-0.5',
          !email.isRead ? 'font-medium' : 'text-muted-foreground'
        )}>
          {email.subject || '(No subject)'}
        </div>

        {/* Snippet */}
        <div className="text-xs text-muted-foreground/70 truncate">
          {email.snippet}
        </div>
      </div>

      {/* Star indicator */}
      {email.isStarred && (
        <i className="fa-solid fa-star text-amber-500 text-xs shrink-0 mt-1" />
      )}

      {/* Hover star button */}
      <button
        className={cn(
          'absolute right-3 top-3 p-1.5 rounded opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-muted',
          email.isStarred && 'opacity-100'
        )}
        onClick={(e) => {
          e.stopPropagation();
          onStar();
        }}
      >
        <i className={cn(
          'fa-star text-xs',
          email.isStarred ? 'fa-solid text-amber-500' : 'fa-regular text-muted-foreground'
        )} />
      </button>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for better memoization
  return (
    prevProps.email.id === nextProps.email.id &&
    prevProps.email.isRead === nextProps.email.isRead &&
    prevProps.email.isStarred === nextProps.email.isStarred &&
    prevProps.isSelected === nextProps.isSelected
  );
});

export default EmailList;
