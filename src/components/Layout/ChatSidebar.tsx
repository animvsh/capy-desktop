import { useState, useRef, useCallback, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';
import capyLogo from '@/assets/capy-logo.png';

// Min/max widths for resizing
const MIN_WIDTH = 280;
const MAX_WIDTH = 600;
const DEFAULT_WIDTH = 320;
const COLLAPSED_WIDTH = 64;

/**
 * ChatSidebar - Persistent chat panel on the left side
 *
 * Features:
 * - Always visible (unless hidden on mobile)
 * - Collapsible to icon-only mode
 * - Resizable via drag handle
 * - Context-aware (shows what user is viewing)
 */
export function ChatSidebar() {
  const {
    chatSidebarOpen,
    setChatSidebarOpen,
    chatSidebarCollapsed,
    setChatSidebarCollapsed,
    selectedItem,
    theme,
    toggleTheme,
  } = useApp();

  // Resizable width state
  const [width, setWidth] = useState(() => {
    const saved = localStorage.getItem('capy-sidebar-width');
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Save width to localStorage
  useEffect(() => {
    if (!chatSidebarCollapsed) {
      localStorage.setItem('capy-sidebar-width', String(width));
    }
  }, [width, chatSidebarCollapsed]);

  // Handle mouse down on resize handle
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  // Handle mouse move during resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const newWidth = e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setWidth(newWidth);
      } else if (newWidth < MIN_WIDTH) {
        setWidth(MIN_WIDTH);
      } else if (newWidth > MAX_WIDTH) {
        setWidth(MAX_WIDTH);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  // Toggle collapse state
  const toggleCollapse = () => {
    setChatSidebarCollapsed(!chatSidebarCollapsed);
  };

  // Don't render if sidebar is closed (mobile)
  if (!chatSidebarOpen) {
    return (
      <Button
        variant="outline"
        size="icon"
        onClick={() => setChatSidebarOpen(true)}
        className="fixed bottom-4 left-4 z-50 h-14 w-14 rounded-2xl shadow-lg border border-border bg-card hover:bg-muted md:hidden"
      >
        <img src={capyLogo} alt="Capy" className="h-10 w-10" />
      </Button>
    );
  }

  const currentWidth = chatSidebarCollapsed ? COLLAPSED_WIDTH : width;

  return (
    <>
      {/* Mobile overlay */}
      {chatSidebarOpen && !chatSidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setChatSidebarOpen(false)}
        />
      )}

      {/* Sidebar container */}
      <aside
        ref={sidebarRef}
        style={{ width: currentWidth, maxWidth: currentWidth }}
        className={cn(
          'h-screen flex flex-col bg-card border-r border-border/50 relative overflow-hidden',
          'transition-[width] duration-150 ease-out',
          isResizing && 'transition-none',
          'fixed md:relative z-50 md:z-auto',
          !chatSidebarOpen && 'hidden md:flex'
        )}
        data-tutorial="chat-panel"
      >
        {/* Header */}
        <div className={cn(
          'flex items-center shrink-0 h-12 border-b border-border/50',
          chatSidebarCollapsed ? 'justify-center px-2' : 'justify-between px-3'
        )}>
          {!chatSidebarCollapsed && (
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              <div className="flex h-7 w-7 items-center justify-center shrink-0">
                <img src={capyLogo} alt="Capy" className="h-7 w-7" />
              </div>
              <div className="min-w-0 overflow-hidden">
                <span className="font-semibold text-sm text-foreground truncate block">Capy</span>
                <div className="flex items-center gap-1">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-[10px] text-muted-foreground truncate">Online</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-0.5 shrink-0">
            {/* Theme toggle */}
            {!chatSidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="h-7 w-7 rounded-md hover:bg-muted"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                <i className={cn(
                  'fa-solid text-muted-foreground text-xs',
                  theme === 'dark' ? 'fa-sun' : 'fa-moon'
                )} />
              </Button>
            )}

            {/* Collapse toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleCollapse}
              className={cn(
                'h-7 w-7 rounded-md hover:bg-muted',
                chatSidebarCollapsed && 'mx-auto'
              )}
              title={chatSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <i className={cn(
                'fa-solid text-muted-foreground text-xs',
                chatSidebarCollapsed ? 'fa-chevron-right' : 'fa-chevron-left'
              )} />
            </Button>

            {/* Mobile close button */}
            {!chatSidebarCollapsed && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatSidebarOpen(false)}
                className="h-7 w-7 rounded-md hover:bg-muted md:hidden"
              >
                <i className="fa-solid fa-xmark text-muted-foreground text-xs" />
              </Button>
            )}
          </div>
        </div>

        {/* Context indicator (when viewing something) */}
        {!chatSidebarCollapsed && selectedItem.type && (
          <div className="px-3 py-1.5 bg-muted/30 border-b border-border/50 shrink-0 overflow-hidden">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground min-w-0">
              <i className={cn(
                'fa-solid text-[8px] shrink-0',
                selectedItem.type === 'email' && 'fa-envelope',
                selectedItem.type === 'contact' && 'fa-user',
                selectedItem.type === 'meeting' && 'fa-calendar',
                selectedItem.type === 'lead' && 'fa-user-plus'
              )} />
              <span className="truncate min-w-0">
                {selectedItem.data?.subject || selectedItem.data?.name || selectedItem.type}
              </span>
            </div>
          </div>
        )}

        {/* Chat content */}
        <div className="flex-1 min-h-0 overflow-hidden w-full">
          {chatSidebarCollapsed ? (
            <CollapsedChatView onExpand={() => setChatSidebarCollapsed(false)} />
          ) : (
            <ChatPanel />
          )}
        </div>

        {/* Resize handle - only show when not collapsed */}
        {!chatSidebarCollapsed && (
          <div
            onMouseDown={startResizing}
            className={cn(
              'absolute top-0 right-0 w-1 h-full cursor-col-resize',
              'hover:bg-primary/50 active:bg-primary/70',
              'transition-colors duration-150',
              isResizing && 'bg-primary/70'
            )}
            title="Drag to resize"
          />
        )}
      </aside>
    </>
  );
}

/**
 * CollapsedChatView - Icon-only view when sidebar is collapsed
 */
function CollapsedChatView({ onExpand }: { onExpand: () => void }) {
  const { selectedItem, navigateTo } = useApp();

  return (
    <div className="flex flex-col items-center py-4 gap-2 h-full">
      {/* Expand button with logo */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onExpand}
        className="h-11 w-11 rounded-xl hover:bg-muted"
        title="Expand chat"
      >
        <img src={capyLogo} alt="Capy" className="h-7 w-7" />
      </Button>

      {/* Quick action buttons */}
      <div className="flex flex-col gap-1 mt-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateTo('home')}
          className="h-10 w-10 rounded-lg hover:bg-muted"
          title="Home"
        >
          <i className="fa-solid fa-home text-muted-foreground hover:text-foreground" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateTo('contacts')}
          className="h-10 w-10 rounded-lg hover:bg-muted"
          title="Contacts"
        >
          <i className="fa-solid fa-users text-muted-foreground hover:text-foreground" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigateTo('meetings')}
          className="h-10 w-10 rounded-lg hover:bg-muted"
          title="Meetings"
        >
          <i className="fa-solid fa-calendar text-muted-foreground hover:text-foreground" />
        </Button>
      </div>

      {/* Context indicator (mini) */}
      {selectedItem.type && (
        <div className="mt-auto mb-4">
          <div
            className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center"
            title={`Viewing: ${selectedItem.type}`}
          >
            <i className={cn(
              'fa-solid text-primary',
              selectedItem.type === 'email' && 'fa-envelope',
              selectedItem.type === 'contact' && 'fa-user',
              selectedItem.type === 'meeting' && 'fa-calendar',
              selectedItem.type === 'lead' && 'fa-user-plus'
            )} />
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatSidebar;
